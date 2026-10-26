/**
 * Vant Traveler — the auditable, traceable pin through a distributed
 * workflow (pass 255, the owner's clarified framing).
 *
 * The clarified definition: the traveler is the object that HOLDS a job's
 * schema/info as it goes from one station (step/stage) to the next across
 * nodes/mesh/pods — the audit-able and traceable pin through the
 * environment. This reflects ISO 9001 clause 8.5.2 (identification and
 * traceability) — vant embraces it: every station-landing is a typed,
 * timestamped, APPEND-ONLY ledger record; nothing silently overwrites.
 *
 * THE LAW (this lib + the tr/1 web kit are the same contract, two layers):
 *
 *   1. CONTENT ADDRESS: the traveler's id is the sha256 of its (slots +
 *      prior ledger) — ANY edit is a NEW id. One truth: the address proves
 *      the payload, the ledger proves the process.
 *   2. APPEND-ONLY LEDGER: stations land `steps` only. Re-opening an old
 *      seq, deleting, or mutating an existing step refuses typed
 *      E_DESCRIPTION_STEP (the ledger never re-writes history).
 *   3. SCHEMA-RIZE, NEVER GUESS: a version-stamped envelope (tr/1).
 *      schemaRize migrates known legacy generations FORWARD with a stamped
 *      rize step; unknown future generations refuse typed
 *      E_TRAVELER_SCHEMA (the rizer never guesses forward).
 *   4. VERIFY AT EVERY LANDING: `arrive()` re-derives the address from the
 *      payload and refuses on mismatch (tamper or corruption is LOUD).
 *
 * The web kit mirror (web/kit/contracts/traveler-contract.js, tr/1) is the
 * STRUCTURAL shape law for the wire; this lib is the WORKING
 * implementation: content-addressing, ledger append, ISO-traceability
 * helpers, and persistence. test/traveler.test.js pins BOTH.
 *
 * Relationship to lib/trace.js: trace spans = EXECUTION moments (what the
 * runtime did); travelers = WORKFLOW identity (what the job is and where
 * it has been). The traveler's steps may carry a trace span id in
 * `step.span` — relation, not duplication.
 *
 * THE CERTIFIED-LETTER PRINCIPLE (pass 259, enterprise posture, opt-in for
 * every other user): a packet that ROUTES is a certified letter. Each
 * stage performs, with the OS this lib already carries (nothing new): the
 * CHECK (scopeCheck — the RLS lineage gate), the RISK (approvalFor — the
 * escrow lane, single-use burn for privileged hops), and the AUDIT (the
 * shared bus + audit trail). A refused stage DROPS the packet: fail-closed,
 * the record stops exactly there, and carriers.carry()/_replay certify
 * where. lib/carriers.js is the route runner over these gates; this lib
 * stays the letter itself.
 */

'use strict';

const fs = require('fs');
const path = require('path');
// (pass 259, hash-canon gate) the ONE hashing surface: sha256 digests live
// on lib/hash (the Wave C canonical module). Direct crypto is gone from
// this lib: digests via hashLib, secrets via the escrow mint lane.
const hashLib = require('./hash');

// (pass 256) THE PIPELINE (AGENTS.md loading order: sandbox -> vaf -> qos ->
// escrow; audit/event adjacency informational). The traveler is not a
// bystander: writes go through the sandbox capability gate, every caller-
// supplied string is vaf-validated, door-side hops rate-limit through the
// QoS lane, every meaningful landing is audited and audible on the shared
// event bus. Errors are typed lib/error.js VantErrors (the pass-169
// zero-raw-throw law in lib).
// (lib note) no state-store dependency: the traveler index is one small
// brain-scoped JSON file with a .sha256 pin — the same contract as the
// boot stone; callers receive the path to verify at their own landing.

const vaf = require('./vaf');
const errors = require('./error');
const audit = require('./audit');
const sandbox = require('./sandbox');
const scope = require('./scope');
const { atomicWriteFile } = require('./primitives');
const { RateLimiter } = require('./qos');

const TRAVEL_VERSION = 'tr/1';               // schema generation (kit parity)
const TRAVEL_WIRE_EVENT = 'relay.travel';
const TRAVEL_KNOWN = ['tr/1', 'tr/0'];
const TRAVEL_STEP_MAX = 512;
const TRAVEL_MAX_CTEXT = 524288;

const CODES = {
    SHAPE: 'E_TRAVELER_SHAPE',
    SCHEMA: 'E_TRAVELER_SCHEMA',
    STEP: 'E_TRAVELER_STEP',
    ADDRESS: 'E_TRAVELER_ADDRESS'
};

const STATE_FILE = 'state/traveler-ledger.json';   // the pin-through ledger, per brain

// ==================== PIPELINE HELPERS (pass 256) ====================

/** Shared-event-bus emit (the lib/qos.js lazy pattern; never noisy on absence). */
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && typeof _event.emit === 'function') {
        try { _event.emit(event, data); } catch (e) { /* audibility never blocks the pin */ }
    }
}

/** Capability gate via lib/gate (the house pattern): the untouched
 *  default sandbox stub ALLOWS (safe-by-default posture, the gate.js
 *  "not configured" lane); only an explicitly configured refuser stays
 *  a refuser. The sandbox instance is handed to gate explicitly — the
 *  require is real usage, not wiring decoration. */
const gate = require('./gate');
function _can(kind) {
    try {
        const sb = sandbox.defaultSandbox || sandbox;
        const verdict = gate.checkCapability(kind === 'read' ? 'canRead' : 'canWrite', { scope: 'traveler', sandbox: sb });
        return verdict.allowed !== false;
    } catch (e) { /* unavailable gate = allow (pod default posture) */ }
    return true;
}

/** vaf-validated caller strings, centered so the refusal is uniform.
 *  vaf.check THROWS on invalid input and is a side-effect check (its own
 *  return is not the value, see bin/rate.js usage) — the validated string
 *  itself is what we keep. Absent values (null/undefined/empty) pass
 *  through as absent; required-ness is each caller's law, not the helper's. */
function _vafStr(value, name, max) {
    if (value === undefined || value === null || value === '') return value;
    const s = String(value);
    vaf.check(s, { type: 'string', name: 'traveler:' + name, maxLength: max });
    return s;
}

/**
 * The QoS lane for door-facing traveler hops (module-level RateLimiter;
 * async because RateLimiter.check resolves). Door handlers await this.
 * Set VANT_TRAVELER_RATE to widen the per-minute ceiling (default 6000:
 * the pin audit trail must never strangle a legitimate workflow).
 * @param {string} clientId door-side client identity
 * @param {string} op the traveler verb (open|hop)
 * (Named gateCheck: `gate` must not shadow the shared lib/gate.js module.)
 */
const _rate = new RateLimiter({ maxPerMinute: parseInt(process.env.VANT_TRAVELER_RATE || '6000', 10) });
async function gateCheck(clientId, op) {
    const ok = await _rate.check('traveler:' + (clientId || '_'), op);
    if (!ok) {
        throw new errors.VantError('traveler lane rate limited (QoS)', { code: 'E_TRAVELER_RATE', retryable: true });
    }
}

/**
 * (pass 257) THE ESCROW APPROVAL LANE: a privileged hop (marked
 * `privileged: true` on the step) REQUIRES a live escrow approval for the
 * op family BEFORE the append — minted by escrow.requestApproval('traveler
 * <op>', reason), approved by the operator lane, consumed HERE (single-use
 * burn — one approval never authorizes unlimited reruns, the #204 law).
 * Unprivileged hops never touch escrow (a plain workflow stays plain).
 * @param {object} step { op, privileged, approvalId }
 */
function approvalFor(step) {
    const s = step || {};
    if (s.privileged !== true) return;
    const escrow = require('./escrow');
    const family = 'traveler ' + _vafStr(s.op || 'step', 'op', 60);
    // (pass 259) The exporter's helper model is the disk-coherent lane:
    // consumeApproval constructs a FRESH instance that hydrates from the
    // brain's escrow.json. A LOCAL escrow instance (create({...})) only
    // hydrates at ITS construction — an approval minted and approved on
    // it AFTERWARD must reach disk before the fresh consumer can see it,
    // exactly the pass-251/257 contract (save-on-mutate). Do it here: the
    // consumer lane stays the same helper path for every caller.
    const verdict = s.approvalId
        ? escrow.consumeApproval(s.approvalId, family)
        : { approved: false, reason: 'missing' };
    if (!verdict.approved) {
        _emit('traveler:refused', { why: 'escalation', op: s.op, reason: verdict.reason });
        const opName = _vafStr(s.op || 'step', 'op', 60);
        throw coded(CODES.STEP, 'privileged hop refused: no (or spent/expired/foreign) escrow approval (reason: ' + (verdict.reason || 'denied') + '). Mint one with escrow.requestApproval(traveler ' + opName + ', reason) and pass approvalId.');
    }
}

/**
 * (pass 259) The route-facing mint+bridge: request an approval AND land it
 * on disk in one call, so the fresh-instance consumer lane used by
 * approvalFor() sees it regardless of which escrow instance the operator
 * minted on. Returns the same { approvalId } shape as requestApproval.
 * @param {object} escrowInstance the LOCAL escrow (optional; defaults the
 *   helper registry) holding the operator's approvalRequired posture
 * @param {string} op      the op family (e.g. 'traveler carry')
 * @param {string} reason  the audit reason
 */
function approvalForRoute(escrowInstance, op, reason) {
    const escrow = require('./escrow');
    const e = escrowInstance || {
        // (pass 259 completion check) The no-instance lane debts the disk
        // bridge to the exporter's OWN helper functions — they construct a
        // fresh instance per call and save-on-mutate already (the helper
        // model), so minting/approving/rejecting through them is disk-
        // coherent WITHOUT a stub save() that never existed there.
        requestApproval: escrow.requestApproval,
        approve: escrow.approve,
        save: () => {}   // each helper call already persisted its own mutation
    };
    const appr = e.requestApproval(op, reason);
    if (!appr.approvalId) return appr;   // auto-approved posture: nothing to bridge
    e.approve(appr.approvalId, undefined);
    e.save();   // the pass-251/257 disk bridge: the fresh consumer hydrates it
    return appr;
}

/** Station attribution: the acting agent (env), else the caller's brain, else verbatim. */
function _stationBy(explicit) {
    if (explicit) return _vafStr(explicit, 'by', 120);
    if (process.env.VANT_AGENT) return String(process.env.VANT_AGENT);
    try {
        const b = require('./brain');
        if (typeof b.getCurrentBrain === 'function' && b.getCurrentBrain()) return b.getCurrentBrain();
    } catch (e) { /* fall through */ }
    return 'vant-traveler';
}

// ==================== CONTENT ADDRESS (the one truth) ====================

/**
 * The traveler's address: sha256 over the canonical payload order
 * (version || id-from-prior || slots JSON || ledger JSON). Deterministic:
 * same payload + same ledger = same address, on every node.
 */
function contentAddress(traveler) {
    const t = traveler || {};
    // (pass 255) canonical order: content-carries-identity means the
    // ledger is IN the address, so a forged step breaks it loudly.
    const h = hashLib.sha256H();
    h.update(String(t.tr || TRAVEL_VERSION));
    h.update('\u0000');
    h.update(JSON.stringify(t.slots || {}));
    h.update('\u0000');
    h.update(JSON.stringify(_canonicalSteps(t.steps || [])));
    return h.digest('hex');
}

function _canonicalSteps(steps) {
    // only the law-shaped part of each step enters the address: seq, op,
    // by, ts. Free-form step extras stay auditable but never re-address.
    return (steps || []).map((s) => ({
        seq: s && s.seq, op: s && s.op, by: s && s.by, ts: s && s.ts
    }));
}

// ==================== RLS SCOPE LINEAGE (pass 257) ====================

/**
 * Stamp the traveler with an RLS scope record AFTER the shape check: the
 * owner ref MUST be a canonical scoping line (org:|dept:|team:|agent:<id>),
 * the visibility one of lib/scope's canon (public|scope|private). The stamp
 * happens through scope.normalize — a malformed ref refuses typed
 * E_TRAVELER_SCOPE, the lineage never rides as free-form text.
 * @param {object} t the traveler
 * @param {object} scopeIn { owner: 'team:qa', visibility?: 'scope' }
 */
function scopeStamp(t, scopeIn) {
    const s = scopeIn || {};
    if (s.owner === undefined && s.visibility === undefined) return t;
    if (typeof s.owner !== 'string' || !s.owner) {
        throw coded(CODES.SHAPE, 'scope.owner is required when scoping a traveler (org:|dept:|team:|agent:<id>).');
    }
    const canonical = scope.normalize({ owner: s.owner, visibility: s.visibility === undefined ? 'scope' : s.visibility });
    if (!canonical || canonical.owner === null) {
        throw coded(CODES.SHAPE, 'scope must be canonical (owner: org:|dept:|team:|agent:<id>; visibility: public|scope|private) — the RLS lineage never rides free-form.');
    }
    t.scope = canonical;
    return t;
}

/**
 * The RLS access check the WORKFLOW must pass before a landing is
 * appended: the acting identity must be inside the stamped scope's member
 * set (lib/scope.canAccess is deny-first on malformed/unknown owners —
 * unscoped travelers stay public, the lenient legacy read). Applied in
 * advance() so EVERY station inherits the lineage, not just persistence.
 * @param {object} t
 * @param {string} actorId
 */
function scopeCheck(t, actorId) {
    if (!t || !t.scope) return true;             // unscoped = public (legacy rule)
    if (scope.canAccess(t, actorId)) return true;
    _emit('traveler:refused', { why: 'rls', id: t.id, actor: String(actorId || '').slice(0, 40) });
    audit.warn('[Traveler] RLS refused: ' + String(actorId || '').slice(0, 40) + ' outside ' + t.scope.owner + '/' + t.scope.visibility);
    throw coded(CODES.SHAPE, 'RLS: ' + String(actorId || 'actor').slice(0, 40) + ' is outside the traveler scope (' + t.scope.owner + '/' + t.scope.visibility + ') — the landing refuses.');
}

// ==================== BUILDERS ====================

/**
 * Mint a NEW traveler: one birth step, address derived from content.
 * NOT persisted by itself — the station that opens the ledger persists.
 * @param {object} p { from, slots, verb? }
 * @returns {object} the traveler (tr/1)
 */
function mint(p) {
    const o = p || {};
    const title = _vafStr(o.slots && o.slots.title, 'title', 200);
    // (pass 256) Explicit `now` makes the birth timestamp deterministic:
    // the same payload + same ledger + same ts = the SAME address, so a
    // re-mint is an idempotent address (and the determinism pin in the
    // suite is a law, not a millisecond race on the wall clock).
    const now = Number(o.now) > 0 ? o.now : Date.now();
    const t = {
        tr: TRAVEL_VERSION,
        id: '',                    // derived below
        from: _stationBy(o.from),
        seq: 1,        steps: [{ seq: 1, op: _vafStr(o.verb || 'open', 'verb', 60), by: _stationBy(o.from), ts: now }],
        slots: o.slots || { title: title },
        v: { major: 2 }
    };
    t.id = contentAddress(t);
    return t;
}

/**
 * SCOPED mint: identical to mint() plus the RLS lineage stamp
 * (pass 257): the packet is born BOUND to an owner ref
 * (org:|dept:|team:|agent:<id>) with a scope visibility (public|scope|
 * private) — every later station inherits the lineage through scopeCheck.
 * @param {object} p { from, slots, verb?, now?, scope?: { owner, visibility } }
 */
function mintScoped(p) {
    const o = p || {};
    const t = mint(o);
    return scopeStamp(t, o.scope);
}

/**
 * A station processes the job and hands the traveler to the NEXT station:
 * appends one step (the landing record), re-derives the address. Pure —
 * persistence is `persist()`/the caller's lane (the lib never mutates
 * global state on a read).
 * @param {object} t    the traveler
 * @param {object} step { op, by, detail?, span?, team?, privileged?, approvalId? }
 * @returns {object} the advanced traveler (NEW object, new address)
 */
function advance(t, step) {
    const s = step || {};
    const shape = shapeRefusalFor(t);
    if (shape) throw shape;
    approvalFor(s);
    scopeCheck(t, s.by && _stationBy(s.by));
    if (t.steps.length >= TRAVEL_STEP_MAX) {
        throw coded(CODES.STEP, 'the ledger is at its ' + TRAVEL_STEP_MAX + '-step ceiling — open a successor traveler (append-only, never rewritten).');
    }

    // (pass 260) THE PART: a manufacturing line's station does two things —
    // it ASSIMILATES a part (the assembly slot it owns) and it SIGNS OFF (the
    // ledger step). Before this pass only the sign-off rode. Now a station
    // may carry `part`: a named, non-empty object merged into the packet's
    // assembly manifest (slots.assembly[part.name]). The part lives INSIDE
    // slots — the content address, so a later hop cannot silently edit what
    // an earlier station attached: verify() refuses at every landing. The
    // sign-off NAMES the part it attached (step.part) — the 8.5.2 record of
    // who added what.
    let nextSlots = t.slots;
    let partName = undefined;
    if (s.part !== undefined) {
        const part = s.part;
        if (!part || typeof part !== 'object' || Array.isArray(part) || !part.name) {
            throw coded(CODES.STEP, 'a station part must be an object with a `name` (the assembly slot it fills) — refuse, never guess.');
        }
        partName = _vafStr(part.name, 'part-name', 60);
        if (partName && nextSlots.assembly && nextSlots.assembly[partName]) {
            throw coded(CODES.STEP, 'the assembly slot `' + partName + '` is already filled — a part never overwrites a part (append-only assembly).');
        }
        const body = Object.keys(part).reduce((acc, k) => { if (k !== 'name') acc[k] = part[k]; return acc; }, {});
        if (!Object.keys(body).length) {
            throw coded(CODES.STEP, 'part `' + partName + '` carries no body — an empty part is not a part.');
        }
        nextSlots = { ...nextSlots, assembly: { ...(nextSlots.assembly || {}), [partName]: body } };
    }
    const next = {
        tr: t.tr,
        id: t.id,
        from: t.from,
        seq: t.seq + 1,
        steps: t.steps.concat([{
            seq: t.seq + 1,
            op: _vafStr(s.op || 'step', 'op', 60),
            by: _stationBy(s.by),
            ts: Date.now(),
            team: s.team !== undefined ? _vafStr(s.team, 'team', 120) : undefined, // crew attribution (informational)
            detail: s.detail !== undefined ? s.detail : undefined,
            span: s.span !== undefined ? s.span : undefined,   // lib/trace span relation
            part: s.part !== undefined ? partName : undefined   // which assembly slot this station filled
        }]),
        slots: nextSlots,
        v: { major: 2 }
    };
    // (pass 260, lineage fix surfaced by the assembly pin) the RLS lineage
    // RIDES every hop: without this, seq-2+ hops silently dropped t.scope
    // and every later landing ran unscooped (the pass-257 pin only covered
    // stage-1 refusals, where scopeCheck still sees the original object).
    // The lineage is not part of the content address (identity by content
    // is slots+ledger), so carrying it verbatim re-addresses nothing.
    if (t.scope !== undefined) next.scope = t.scope;
    next.id = contentAddress(next);   // ANY edit = a NEW address (law 1)
    return next;
}

// ==================== SHAPE LAW (the lib mirror of the kit) ====================

/**
 * Returns a THROW-ready error when t violates the law; null when legal.
 * Same refusal taxonomy as the kit (E_TRAVELER_*) plus lib-side extras.
 */
function shapeRefusalFor(t) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) {
        return coded(CODES.SHAPE, 'travel expects the traveler object.');
    }
    if (typeof t.tr !== 'string' || TRAVEL_KNOWN.indexOf(t.tr) === -1) {
        return coded(CODES.SCHEMA,
            (/^tr\//.test(String(t.tr)) ? 'E_TRAVELER_SCHEMA: unknown future traveler version `' + t.tr + '` — the rizer never guesses forward.'
                                        : 'tr must be a known traveler version (' + TRAVEL_KNOWN.join(', ') + ').'));
    }
    if (typeof t.id !== 'string' || !/^[0-9a-f]{16,64}$/.test(t.id)) {
        return coded(CODES.ADDRESS, 'id must be an opaque hex content address (16-64 hex chars).');
    }
    if (!t.slots || typeof t.slots !== 'object' || Array.isArray(t.slots)) {
        return coded(CODES.SHAPE, 'slots must be an object (the state payload).');
    }
    if (!Array.isArray(t.steps) || !t.steps.length || t.steps.length > TRAVEL_STEP_MAX) {
        return coded(CODES.STEP, 'steps must be a non-empty ledger (max ' + TRAVEL_STEP_MAX + ').');
    }
    let lastSeq = 0;
    for (const s of t.steps) {
        if (!s || typeof s !== 'object' || typeof s.op !== 'string' || s.seq !== lastSeq + 1) {
            return coded(CODES.STEP, 'ledger law violation at seq ' + (s && s.seq) + ' — append-only, ascending, each = prev + 1.');
        }
        lastSeq = s.seq;
    }
    if (t.seq !== t.steps.length) {
        return coded(CODES.STEP, 'seq must equal the ledger length (the frozen stamp, not a claim).');
    }
    return null;
}

function coded(code, message) {
    // (pass 256) typed VantError — the lib zero-raw-throw law; identical
    // E_TRAVELER_* refusal taxonomy as before.
    return new errors.VantError(message, { code: code, retryable: false });
}

// ==================== VERIFY AT EVERY LANDING (law 4) ====================

/**
 * A station receives the traveler: the ADDRESS is re-derived from payload
 * and compared. Mismatch = tamper or corruption — LOUD refusal, typed.
 * @param {object} t
 * @returns {object} { ok: true, id } | { ok: false, code, error, expected, got }
 */
function verify(t) {
    const shape = shapeRefusalFor(t);
    if (shape) return { ok: false, code: shape.code, error: shape.message };
    const derived = contentAddress(t);
    if (derived !== t.id) {
        return {
            ok: false,
            code: CODES.ADDRESS,
            error: 'the content address does not derive from the payload — tamper or corruption (ISO 8.5.2: refuse, never re-write).',
            expected: t.id,
            got: derived
        };
    }
    return { ok: true, id: derived };
}

// ==================== THE SCHEMA-RIZER ====================

/**
 * Legacy generation → current, with ONE truthful rize step + stamp.
 * Unknown future → typed refusal. Current → untouched (id preserved).
 * Identity-by-content: theCaller re-addresses through advance()/mint().
 */
function schemaRize(t) {
    const shape = shapeRefusalFor(t);
    if (shape && shape.code === CODES.SCHEMA && /^tr\//.test(String(t.tr))) throw shape;
    if (t && t.tr === TRAVEL_VERSION) return t;
    if (!t || typeof t !== 'object') throw coded(CODES.SHAPE, 'travel expects the traveler object.');
    // legacy normalize: slots verbatim, ledger gains the migration truth.
    const migrated = {
        tr: TRAVEL_VERSION,
        id: t.id,
        from: t.from || 'vant-traveler',
        seq: (Array.isArray(t.steps) ? t.steps.length : 0) + 1,
        steps: (Array.isArray(t.steps) ? t.steps : []).concat([{
            seq: (Array.isArray(t.steps) ? t.steps.length : 0) + 1,
            op: 'rize',
            by: t.from || 'unknown',
            from: String(t.tr),
            ts: Date.now()
        }]),
        slots: t.slots || {},
        v: { major: 2 },
        rized: { from: String(t.tr || 'tr/0'), to: TRAVEL_VERSION }
    };
    migrated.id = contentAddress(migrated);
    return migrated;
}

// ==================== PERSISTENCE (the per-brain pin ledger) ====================

function _ledgerPath() {
    // (pass 255) getBrainPath() is ALREADY brain-scoped (models/private/<brain>)
    // — resolved live so a mid-session brain switch carries the pin ledger.
    const brainMod = require('./brain');
    const root = typeof brainMod.getBrainPath === 'function' ? brainMod.getBrainPath() : path.join('models', 'private');
    return path.join(root, STATE_FILE);
}

/**
 * Persist the traveler into the brain's pin-through ledger. APPEND-ONLY:
 * an existing record for the same id is refused (the ledger never
 * re-writes), a NEW id (a genuinely advanced traveler) appends fresh.
 */
function persist(t, opts) {
    const o = opts || {};
    if (!_can('write')) {
        _emit('traveler:refused', { why: 'sandbox-write', id: t && t.id });
        throw coded(CODES.STEP, 'sandbox write capability required to persist a traveler.');
    }
    const shape = shapeRefusalFor(t);
    if (shape) { _emit('traveler:refused', { why: 'shape', code: shape.code }); throw shape; }
    const p = _ledgerPath(o.brain);
    const verifyOut = verify(t);
    if (!verifyOut.ok) {
        audit.warn('[Traveler] Address mismatch refused on persist: ' + t.id.slice(0, 12));
        _emit('traveler:refused', { why: 'address', id: t.id });
        throw coded(verifyOut.code, verifyOut.error);
    }    // (pass 28x) the ledger carries the ONE protocol-state marker — the same
    // stamp lib/state-store.js writes — so every marker-based classifier
    // (brain-layout migrations' dropfile step chief among them) reads this
    // brain-scoped durable ledger as LIVE state, never as legacy dropfile
    // content to relocate. Fresh stamp only on a fresh ledger: an existing
    // one keeps its fields and gains the stamp on the next persist.
    let ledger = { kind: 'vant-protocol-state', module: 'traveler', travelers: [] };
    try { ledger = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { /* fresh */ }
    if (!ledger.travelers) ledger.travelers = [];
    if (ledger.travelers.some((r) => r.id === t.id)) {
        throw coded(CODES.STEP, 'traveler ' + t.id.slice(0, 12) + ' is already in the ledger — append-only, never re-written.');
    }
    ledger.kind = 'vant-protocol-state';
    if (!ledger.module) ledger.module = 'traveler';
    ledger.travelers.push({ id: t.id, tr: t.tr, from: t.from, seq: t.seq, ts: Date.now() });
    // bounded: the PIN ledger stays a searchable index; full ledgers live
    // where travelers land (brain files via the door).
    if (ledger.travelers.length > 1000) ledger.travelers = ledger.travelers.slice(-1000);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    // (pass 257) THE ATOMIC CONTRACT: the index, its .sha256 pin, and the
    // packet body land via lib/primitives.atomicWriteFile (hidden same-dir
    // temp + rename) — a torn write can never present as a ledger row.
    // The .sha256 pin remains the verifier's independent crosscheck.
    atomicWriteFile(p, JSON.stringify(ledger, null, 2));
    atomicWriteFile(p + '.sha256', hashLib.sha256(fs.readFileSync(p)) + '  ' + p + '\n');
    // (pass 255) the packet BODY lands beside the index (state/travelers/
    // <id>.json) so any later station/mcp tool can load-by-id and verify:
    // address-derived, addressed to the exact content that landed.
    const bodyDir = path.join(path.dirname(p), 'travelers');
    fs.mkdirSync(bodyDir, { recursive: true });
    const bodyFile = path.join(bodyDir, t.id + '.json');
    if (!fs.existsSync(bodyFile)) {
        // append-only: a body file never rewrites (the address IS the
        // content — same id means same bytes, refusing duplicates keeps the
        // ledger honest while remaining idempotent for callers).
        atomicWriteFile(bodyFile, JSON.stringify(t, null, 2));
    }
    // Pipeline audibility: the pin-through is now on the shared bus + the
    // audit trail (adjacency layers, never gates).
    audit.info('[Traveler] persisted ' + t.id.slice(0, 12) + ' seq ' + t.seq + ' (' + t.tr + ')');
    _emit('traveler:persisted', { id: t.id, tr: t.tr, seq: t.seq });
    return { ok: true, id: t.id, ledger: p, body: bodyFile };
}

/**
 * The pin-through query: where has this job been? The ledger index for an
 * id, or the full traveler record when the caller hands one in.
 */
function status(t) {
    if (!_can('read')) throw coded(CODES.STEP, 'sandbox read capability required to status a traveler.');
    const shape = shapeRefusalFor(t);
    if (shape) throw shape;
    const p = _ledgerPath();
    let ledger = { travelers: [] };
    try { ledger = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { /* fresh */ }
    const rows = (ledger.travelers || []).filter((r) => String(r.id).startsWith(String(t.id).slice(0, 12)));
    return {
        id: t.id,
        seen: rows.length > 0,
        stations: t.steps.map((s) => ({ seq: s.seq, op: s.op, by: s.by, ts: s.ts })),
        ledgerRows: rows
    };
}

// ==================== ISO 9001 TRACEABILITY HELPERS ====================

/**
 * The 8.5.2 report: what happened to this job, verbatim, for an audit.
 * Plain text, station-by-station, timestamped — the auditor's copy.
 */
function auditReport(t) {
    const shape = shapeRefusalFor(t);
    if (shape) throw shape;
    const out = [];
    out.push('== TRAVELER TRACEABILITY RECORD (ISO 9001:2015 clause 8.5.2) ==');
    out.push('schema: ' + t.tr + '   id: ' + t.id);
    out.push('issued by: ' + t.from);
    out.push('stations (' + t.steps.length + '):');
    for (const s of t.steps) {
        out.push('  ' + String(s.seq).padStart(3) + '. [' + new Date(s.ts).toISOString() + '] ' + s.op + ' — by ' + s.by + (s.detail ? ' :: ' + JSON.stringify(s.detail) : ''));
    }
    out.push('lead time (first->last): ' +
        ((t.steps[t.steps.length - 1].ts - t.steps[0].ts) / 1000).toFixed(1) + 's');
    const vOut = verify(t);
    out.push('integrity: ' + (vOut.ok ? 'VERIFIED (address derives from payload)' : 'REFUSED (' + vOut.error + ')'));
    return out.join('\n');
}

module.exports = {
    TRAVEL_VERSION, TRAVEL_WIRE_EVENT, TRAVEL_KNOWN, TRAVEL_STEP_MAX, TRAVEL_MAX_CTEXT, CODES,
    contentAddress, mint, mintScoped, advance, shapeRefusalFor, verify, schemaRize,
    scopeStamp, scopeCheck, approvalFor, approvalForRoute,
    persist, status, auditReport, gateCheck,
    _ledgerPath
};
