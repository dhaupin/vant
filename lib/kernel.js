'use strict';

/**
 * VANT KERNEL — the lifecycle substrate (seed draft, K1-shaped)
 *
 * Spec: labs/prd-kernel.md (itself downstream of the runtime it
 * catches up to — see §1's epistemology). This file is the SEED the
 * spec names in §3: portable core, ZERO vant-internal imports, no
 * runtime consumer registered yet — adoption is registration, and
 * nothing registers until its §4 row lands (see §3, "The wiring
 * map", for the callsites that WILL register: escrow, harness,
 * horcrux, prune, sudo, pipeline, docs gates).
 *
 * STATUS (honest, per the repo's no-fiction law):
 *   - LIVE in this file: the registry, the append-only in-process
 *     journal, KERNEL TIME (journal position + content hash, §6d #1),
 *     coded errors, refusals-journal-themselves (§6d #2), and the
 *     cross-verb invariants enforced fail-closed at the gate.
 *   - NOT yet: persistence (the journal dies with the process),
 *     storage/backing of any kind, compaction-as-succeed (§6d #3),
 *     zone consults (§6b), and any callsite wiring (the §3 map).
 *     K2 (the invariant test suite) and K3 (first consumer) have NOT
 *     run; a seed is not a pass.
 *
 * THE INVARIANTS (§2 cross-verb laws, every one enforced below):
 *   1. No retire without a census entry naming what died.
 *   2. No attest without a dated census entry behind it.
 *   3. Missing verbs are census-visible gaps, never silent.
 *   4. Every refusal gets a typed journal entry — fail-closed is
 *      never fail-silent. (The kernel is the clerk of the record
 *      with refusal teeth, NOT the judge; the rules layer above
 *      decides — §6 Q8.)
 *
 * Kernel time: an entry's date IS its journal position plus the
 * content hash of its own payload (a Lamport clock in embryo).
 * "Dated" in every invariant and law below means a journal seq the
 * journal can verify — never a wall clock, which is recorded only
 * when a caller SUPPLIES one, as receipt decoration for humans
 * (§6d #1). This is what makes determinism structural, not tested.
 */

const crypto = require('crypto');

// The open verb vocabulary (§2, locked names; orderings are law, not arrows).
const VERBS = Object.freeze(['census', 'attest', 'retire', 'succeed']);

/** Coded errors only (the pass-169 gate-teeth rule). */
class KernelError extends Error {
    constructor(code, message) {
        super(`[${code}] ${message}`);
        this.name = 'KernelError';
        this.code = code;
    }
}

// ==================== journal ====================
// Append-only. No entry mutates after append; each entry's time is
// computed from its own content at the moment it lands.

let _journal = [];
const _registry = new Map(); // name -> consumer record

function _hash(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function _append(kind, verb, consumer, detail) {
    detail = detail || {};
    const payload = { kind, verb: verb || null, consumer: consumer || null, detail };
    const seq = _journal.length + 1;
    const entry = Object.assign({}, payload, {
        seq,
        time: { seq, hash: _hash(payload) },
    });
    // Wall clock enters the journal ONLY as caller-supplied decoration
    // (§6d #1). The kernel never stamps it itself.
    if (detail.wallClock !== undefined) entry.wallClock = String(detail.wallClock);
    _journal.push(entry);
    return entry;
}

/**
 * The kernel's only teeth: journal the refusal as a typed negative
 * entry (invariant 4), THEN fail with the coded error. A surface that
 * refuses often becomes census-visible without ever being accused.
 */
function _refuse(code, message, verb, consumer, detail) {
    _append('refusal', verb, consumer, Object.assign({ code }, detail || {}));
    throw new KernelError(code, message);
}

// ==================== registry ====================

/**
 * Register a consumer: { name, scope, verbs: {census?, attest?, retire?, succeed?} }.
 * Each verb chunk is the consumer's own implementation of that verb for
 * its surface. Missing verbs are legal at registration and become
 * census-visible gaps (invariant 3); verb names outside the vocabulary
 * are refused outright.
 */
function register(spec) {
    if (!spec || typeof spec.name !== 'string' || !spec.name.trim()) {
        throw new KernelError('E_BAD_SPEC', 'register() needs { name, scope, verbs }');
    }
    if (_registry.has(spec.name)) {
        throw new KernelError('E_DUPLICATE_NAME', `consumer already registered: ${spec.name}`);
    }
    const fns = {};
    const declared = Object.keys(spec.verbs || {});
    for (const v of declared) {
        if (!VERBS.includes(v)) {
            throw new KernelError(`E_UNKNOWN_VERB`, `not a kernel verb: "${v}" (vocabulary: ${VERBS.join(', ')})`);
        }
        if (typeof spec.verbs[v] !== 'function') {
            throw new KernelError('E_BAD_VERB', `verb "${v}" of ${spec.name} must be a function`);
        }
        fns[v] = spec.verbs[v];
    }
    const consumer = {
        name: spec.name,
        scope: spec.scope || null,
        verbs: new Set(declared),
        fns,
        at: _journal.length + 1,
    };
    _registry.set(spec.name, consumer);
    _append('register', null, spec.name, { scope: consumer.scope, verbs: declared });
    return { name: spec.name, at: _journal.length };
}

/**
 * The substrate-level census (invariant 3, live): every registered
 * consumer, which verbs it implements, and which of the four are
 * MISSING — visible, and dated with kernel time.
 */
function census() {
    const consumers = [..._registry.values()].map((c) => ({
        name: c.name,
        scope: c.scope,
        at: c.at,
        verbs: [...c.verbs].sort(),
        missingVerbs: VERBS.filter((v) => !c.verbs.has(v)),
    }));
    return {
        consumers,
        entries: _journal.length,
        time: time(),
    };
}

/** Kernel time (§6d #1): position + content hash of the live edge. */
function time() {
    if (_journal.length === 0) return { epoch: 'journal', seq: 0, hash: 'genesis' };
    const top = _journal[_journal.length - 1];
    return { epoch: 'journal', seq: top.seq, hash: top.time.hash };
}

/** The append-only ledger, read-out (a copy; the caller mutates its own copy at its own risk). */
function journal() {
    return _journal.slice();
}

// ==================== verb helpers (the dated-in checks) ====================

function _isDated(n) {
    return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= _journal.length;
}

// ==================== the gate ====================

/**
 * gate(verb, consumerName, payload) — the ONLY path a verb legally takes.
 * Enforcement posture per Q8: the kernel does not decide flow; it
 * refuses to journal illegal verbs and journals every refusal. The
 * rules layer above remains the judge.
 *
 *   census  — payload: { detail?, wallClock? }   (consumer enumerates its surface)
 *   attest  — payload: { claim, basis: { at }, detail? }   (basis.at = a dated census seq: invariant 2)
 *   retire  — payload: { census: [{ id, at }], ids: [...], reason, detail? }
 *             (invariant 1: count-kind census receipt naming what died; every retired
 *              id must be LISTED in it — an unlisted thing is a finding, not background)
 *   succeed — payload: { boundary, attestChain: [seq, ...], detail? }
 *             (carries the attest chain it inherits; refuses on an unverifiable chain)
 */
function gate(verb, consumerName, payload) {
    payload = payload || {};
    if (!VERBS.includes(verb)) {
        _refuse('E_UNKNOWN_VERB', `not a kernel verb (vocabulary: ${VERBS.join(', ')})`, verb, consumerName);
    }
    const consumer = _registry.get(consumerName);
    if (!consumer) {
        _refuse('E_UNKNOWN_CONSUMER', `consumer not registered: ${consumerName}`, verb, consumerName);
    }
    if (!consumer.verbs.has(verb)) {
        _refuse('E_UNREGISTERED_VERB', `${consumerName} does not implement "${verb}" (a census-visible gap, invariant 3)`, verb, consumerName);
    }

    let detail = payload.detail || {};
    let result;

    try {
        switch (verb) {
            case 'census': {
                const listing = consumer.fns.census(detail);
                if (!Array.isArray(listing)) {
                    _refuse('E_BAD_CENSUS', `${consumerName}.census() must return an array of { id, at, kind }`, verb, consumerName);
                }
                result = listing;
                _append('verb', verb, consumerName, {
                    count: listing.length,
                    wallClock: payload.wallClock,
                });
                break;
            }
            case 'attest': {
                if (!payload.claim || (typeof payload.claim !== 'string' && typeof payload.claim !== 'number')) {
                    _refuse('E_NO_CLAIM', 'attest needs a claim (string or status code)', verb, consumerName);
                }
                const at = payload.basis && payload.basis.at;
                if (!_isDated(at)) {
                    _refuse('E_NO_DATE', 'no attest without a dated census entry behind it (invariant 2)', verb, consumerName, { basis: at === undefined ? null : at });
                }
                result = consumer.fns.attest(detail);
                _append('verb', verb, consumerName, {
                    claim: String(payload.claim),
                    basisAt: at,
                    wallClock: payload.wallClock,
                });
                break;
            }
            case 'retire': {
                const receipt = payload.census;
                if (!Array.isArray(receipt) || receipt.length === 0) {
                    _refuse('E_NO_CENSUS', 'no retire without a census entry naming what died (invariant 1)', verb, consumerName);
                }
                for (const e of receipt) {
                    if (!e || typeof e.id !== 'string' || !_isDated(e.at)) {
                        _refuse('E_BAD_CENSUS', 'census receipt entries must be { id, at } with a dated "at"', verb, consumerName);
                    }
                }
                const ids = payload.ids && payload.ids.length ? payload.ids : receipt.map((e) => e.id);
                if (!Array.isArray(ids) || ids.length === 0) {
                    _refuse('E_NO_CENSUS', 'retire names at least one id', verb, consumerName);
                }
                const listed = new Set(receipt.map((e) => e.id));
                const unlisted = ids.filter((id) => !listed.has(id));
                if (unlisted.length) {
                    _refuse('E_UNLISTED_RETIRE', 'an unlisted thing is a finding, not background (invariant 1)', verb, consumerName, { unlisted });
                }
                if (!payload.reason || typeof payload.reason !== 'string' || !payload.reason.trim()) {
                    _refuse('E_NO_REASON', 'retire carries a reason: name, date, and where the record goes', verb, consumerName);
                }
                result = consumer.fns.retire(detail);
                _append('verb', verb, consumerName, {
                    reason: payload.reason,
                    ids,
                    censusAt: receipt[0].at,
                    wallClock: payload.wallClock,
                });
                break;
            }
            case 'succeed': {
                if (!payload.boundary || typeof payload.boundary !== 'string') {
                    _refuse('E_NO_BOUNDARY', 'succeed names the boundary it crosses (session, version, tenant, restore)', verb, consumerName);
                }
                const chain = payload.attestChain;
                if (!Array.isArray(chain) || chain.length === 0 || !chain.every(_isDated)) {
                    _refuse('E_NO_ATTEST_CHAIN', 'no succeed without the attest chain it inherits (verifiable at the destination)', verb, consumerName);
                }
                result = consumer.fns.succeed(detail);
                _append('verb', verb, consumerName, {
                    boundary: payload.boundary,
                    attestChain: chain,
                    wallClock: payload.wallClock,
                });
                break;
            }
            default: // unreachable; vocabulary is frozen and checked above
                _refuse('E_UNKNOWN_VERB', 'not a kernel verb', verb, consumerName);
        }
    } catch (err) {
        if (err instanceof KernelError) throw err; // already journaled by _refuse
        // The consumer's own verb failed: journal it (invariant 4), then rethrow.
        _refuse('E_CONSUMER_REFUSED', `${verb} refused by ${consumerName}: ${err.message}`, verb, consumerName, { error: String(err.message) });
    }

    return { ok: true, verb, consumer: consumerName, result, time: time() };
}

// ==================== exports ====================

module.exports = {
    VERBS,
    KernelError,
    register,
    census,
    gate,
    journal,
    time,

    /**
     * TEST-ONLY unwind (scratch-brain posture). The K4 harness consumer
     * replaces this with real retire semantics — census its own mints,
     * retire them on suite exit (labs/prd-kernel.md §4, harness row).
     */
    _unwind() {
        _journal = [];
        _registry.clear();
    },
};
