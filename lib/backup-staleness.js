'use strict';

/**
 * backup-staleness — the staleness ledger behind the lesson of issue #252
 * (a live wipe killed two genuinely irrecoverable copies mid-session):
 *
 *   "a brain in active use implies its last backup is recent."
 *
 * Shape kept to the smallest honest composition of vant's existing parts:
 *
 *   - Per-brain receipts live AT the brain (models/backup-receipts.json),
 *     written every time a backup actually lands (stampBackup from
 *     lib/backup.js's create() success path and the scheduler's watchdog).
 *     A backup that did not complete never stamps — the receipt only
 *     confirms bytes that exist and (for horcrux) round-trip.
 *   - stalenessReport() answers for every brain in the stack: RECENT,
 *     STALE (older than the freshness window), or NEVER — the last being
 *     exactly "the brain that dies tonight-style", a FINDING, never an
 *     absence-of-data.
 *   - ephemeralZone() is ask 3's warning basis: it truthfully names the
 *     fact that the models root resolves inside a git mount (issue #252:
 *     untracked content inside a repo mount dies on resync), which the
 *     health gate surfaces as a WARNING, never silently.
 *
 * Clerk-not-judge: nothing here removes or repairs anything. Every fs
 * error becomes a typed failure (never a raw crash), and a nondeterministic
 * wall clock is INJECTED as `now` on every API so pins stay deterministic.
 */

const fs = require('fs');
const path = require('path');

const RECEIPTS_BASENAME = 'backup-receipts.json';
const DEFAULT_FRESHNESS_MS = 30 * 60 * 1000; // the issue's 30m cadence
const STALE_MULTIPLIER = 2;                  // 2 windows late = STALE

/** The models root, anchored the same seam as lib/brain's
 * _brainModelsRoot: process.cwd() + /models. */
function _modelsRoot() {
    return path.resolve(process.cwd(), 'models');
}

function _receiptsPath() {
    return path.join(_modelsRoot(), RECEIPTS_BASENAME);
}

/** Read the receipt ledger. Typed failures; a missing ledger is the
 * legitimate fresh state ({}) — every other shape faults by throwing a
 * coded error the caller must surface. */
function readReceipts() {
    try {
        const raw = fs.readFileSync(_receiptsPath(), 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
            (parsed.byBrain && (typeof parsed.byBrain !== 'object' || Array.isArray(parsed.byBrain)))) {
            const err = new Error('[E_SCHEMA] backup receipts ledger is not brain-keyed');
            err.code = 'E_SCHEMA';
            throw err;
        }
        return parsed;
    } catch (e) {
        if (e && e.code === 'ENOENT') return { schema: 1, byBrain: {} };
        if (e && e.code) throw e;
        const err = new Error(`[E_SCHEMA] backup receipts unreadable: ${String(e.message).slice(0, 160)}`);
        err.code = 'E_SCHEMA';
        throw err;
    }
}

/** Stamp one landing for one brain. The stamp ONLY carries what a
 * restore needs to find the artifact: brain, path, type, unix at. */
function stamp({ brain, artifact, type = 'horcrux', at = Date.now() }) {
    if (!brain || !_validSegment(brain)) {
        const err = new Error('[E_NAMING] backup-staleness.stamp needs a valid brain name');
        err.code = 'E_NAMING';
        throw err;
    }
    const ledger = readReceipts();
    if (!ledger.byBrain) ledger.byBrain = {};
    ledger.schema = 1;
    ledger.byBrain[brain] = {
        at: Number(at),
        type: String(type),
        artifact: artifact ? String(path.relative(_modelsRoot(), path.resolve(artifact))) : null,
    };
    _write(ledger);
    return ledger.byBrain[brain];
}

/** Stamp a landing for every brain in the active stack (the watchdog
 * pushes the whole kit; the receipt is quieter than the artifact). */
function stampStack({ brains, artifact, type = 'horcrux', at = Date.now() }) {
    const list = Array.isArray(brains) ? brains : [];
    const out = [];
    for (const brain of list) {
        out.push(stamp({ brain, artifact, type, at }));
    }
    return out;
}

function _write(ledger) {
    // (2026-10-27) the shared atomic helper (tmp + fsync + rename) replaces
    // the hand-rolled tmp+rename - the structural law wants ONE helper, and
    // fsync-on-photo-robbery is what the receipts ledger deserves anyway.
    const { atomicWriteFile } = require('./primitives');
    atomicWriteFile(_receiptsPath(), JSON.stringify(ledger, null, 2) + '\n');
}

function _validSegment(name) {
    return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && name !== '.' && name !== '..';
}

/** Human age, coarse by design: minutes under an hour, else hours.
 * (The health gate prints it; no fake precision.) */
function ageHuman(ms) {
    if (ms < 60 * 1000) return 'under a minute';
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min}m ago`;
    const h = Math.round(ms / 3600000);
    if (h < 48) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
}

/**
 * The staleness report for the active stack. NEVER is a FINDING (issue
 * #252: "treat NEVER as a finding, not an absence-of-data"); STALE is a
 * finding too (a brain whose last push just died tonight-style).
 */
function stalenessReport({ now = Date.now(), freshnessMs = DEFAULT_FRESHNESS_MS, stack } = {}) {
    const brain = require('./brain');
    const brains = Array.isArray(stack) && stack.length ? stack : (brain.getStack() || []);
    let ledger = { byBrain: {} };
    let ledgerError = null;
    try {
        ledger = readReceipts();
    } catch (e) {
        ledgerError = e.code || 'E_UNKNOWN';
    }
    const windowMs = freshnessMs * STALE_MULTIPLIER;
    return {
        at: Number(now),
        freshnessMs,
        windowMs,
        ledgerError,
        brains: brains.map((name) => {
            const rec = (ledger.byBrain || {})[name];
            if (!rec || typeof rec.at !== 'number') {
                return { brain: name, status: 'NEVER', finding: true, why: 'no completed backup ever stamped' };
            }
            const age = Number(now) - rec.at;
            if (!(age >= 0)) {
                return { brain: name, status: 'RECENT', finding: false, lastAt: rec.at, ageMs: 0, artifact: rec.artifact, type: rec.type };
            }
            const status = age > windowMs ? 'STALE' : 'RECENT';
            return {
                brain: name,
                status,
                finding: status !== 'RECENT',
                lastAt: rec.at,
                ageMs: age,
                ageHuman: ageHuman(age),
                artifact: rec.artifact || null,
                type: rec.type || null,
            };
        }),
        findings: null, // filled by the aggregate helper below
    };
}

/** Findings-only view for the health gate (true = the invariant is
 * violated somewhere). */
function stalenessFindings(report) {
    return report.brains.filter((b) => b.finding);
}

/**
 * Ask 3's probe: does the models root live inside a git mount? Truthful
 * by walk — it names the .git it found and the models root, and nothing
 * else. The health gate surfaces it as a WARNING line, never a crash.
 */
function ephemeralZone({ from } = {}) {
    let dir = path.resolve(from || _modelsRoot());
    const root = dir;
    for (let i = 0; i < 32; i++) {
        if (fs.existsSync(path.join(dir, '.git'))) {
            return { insideRepo: true, gitRoot: dir, modelsRoot: root, why: 'untracked content inside a repo mount dies on resync (issue #252 was that lesson); prefer a durable home for vant storage' };
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return { insideRepo: false, gitRoot: null, modelsRoot: root, why: null };
}

module.exports = {
    stamp,
    stampStack,
    stalenessReport,
    stalenessFindings,
    ageHuman,
    ephemeralZone,
    readReceipts,
    RECEIPTS_BASENAME,
    DEFAULT_FRESHNESS_MS,
    STALE_MULTIPLIER,
};
