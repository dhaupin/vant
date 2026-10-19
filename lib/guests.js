/**
 * Vant Guests (H1 of #185) — per-identity multi-guest auth for the MCP door.
 *
 * "One authenticated boot, many concurrent guests" (issue #185, TOP item).
 * NOT a fourth permission system: roles map onto the trio that already
 * exists — lib/scope.js owner kinds, lib/sandbox.js capability vocabulary,
 * lib/trust.js trust levels.
 *
 *    tokens:   'vguest_<id>_<secret>' (random; NOT an HMAC of claims, so
 *              revocation is denylist-backed and honest)
 *    at-rest:  sha256 hash only (lib/hash.sha256, the habitat precedent);
 *              the raw secret is shown exactly once at issue time
 *    ledger:   models/private/<brain>/.guests.json — the .audit.json
 *              precedent (pass 209 containment ruling): brain-scoped,
 *              dotted, runtime JSON, inside the backup/horcrux gather walk
 *              so a restored stone keeps its guest roster; gitignored tree,
 *              zero sync traffic
 *
 * Roles (default capability maps, sandbox vocabulary):
 *    observer: canRead, canLoad, canList                          (watch only)
 *    human:    + canWrite                                         (operator UI)
 *    agent:    + canExec, canSpawn                                (working peer)
 *
 * Door gate (lib/mcp.js): guest_issue/guest_list/guest_revoke are
 * ADMIN-ONLY — a guest can never manage guests (the #185 enumeration
 * lesson: any guest-callable list-of-clients surface is an enumeration
 * vector). Unknown tool classes count as WRITE: denied to observers,
 * allowed to writer roles. Classification is a small explicit pattern
 * list, not a mirror of the 300+-tool catalog.
 *
 * Pairing: `vant headless` persists its pairing code's HASH in the ledger
 * (pendingPairing); guests.pair(code) consumes it single-use and issues
 * the default `human` guest. The code is a voucher, not a credential.
 *
 * Isolation rule (the #195/#197 precedent): module load is side-effect
 * free; a failing guest write never takes a build down; the bus never
 * blocks on guest events.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const errors = require('./error');
const hash = require('./hash');

// (pass 253) env-tunable ONLY for test harnesses that need many identities
// per process (pass-215 budget matrix); the production default stays 100
// and the roster-cap refusal semantics are untouched.
const MAX_GUESTS = (() => {
    const v = parseInt(process.env.VANT_GUESTS_MAX || '100', 10);
    return Number.isFinite(v) && v > 0 ? v : 100;
})();
const ROLES = ['observer', 'human', 'agent'];
// Sandbox-vocabulary capability names (lib/sandbox.js) per role. Ordered
// checks ride TRUST_CAP_FLOOR below, not separate role sets.
const ROLE_CAPS = {
    observer: ['canRead', 'canLoad', 'canList'],
    // human carries canSpawn: the #185 acceptance has the operator's browser
    // SPAWN WORK (assigner = tasks + spawn composed)
    human: ['canRead', 'canLoad', 'canList', 'canWrite', 'canSpawn'],
    agent: ['canRead', 'canLoad', 'canList', 'canWrite', 'canExec', 'canSpawn']
};
// trust.js levels, permissive→restrictive. Trust caps are RESTRICTIONS, not
// extra grants — a role never exceeds its own map. The #185 acceptance says
// a remote browser (default-trust, medium) must be able to spawn work, so
// only the explicitly paranoid issuances floor:
//    none -> read-only (the doc's lakh "verifies but is capped to read")
//    low  -> read+write, no exec, no spawn
const TRUST_LEVELS = ['high', 'medium', 'low', 'none'];
const TRUST_CAP_FLOOR = {
    high: null,        // no floor: role grants stand
    medium: null,      // role grants stand (the operator default)
    low: ['canSpawn', 'canExec'],
    none: ['canSpawn', 'canExec', 'canWrite']
};

// ---------- door verb classification (small, explicit, honest) ----------

// Admin tools: guests can NEVER call these (enumeration defense).
const GUEST_ADMIN_TOOLS = new Set(['guest_issue', 'guest_list', 'guest_revoke']);
// Read-safe patterns for observer gating (applied to the FULL tool name):
const READ_TOOL_RE = /(^|_)(load|list|ls|state|status|get|read|info|inspect|verify|peek|search|rollup|summary|health|whoami|describe|replay|fetch)$/;   // (pass 261) +replay: the carrier continuity walk reports, never mutates (lib/carriers law 3) — the auditor's read  // (pass 267) +fetch: traveler_fetch serves a packet body by address — a pure read of the append-only store, the door the pointer resolve rides
// Explicit writes that read-style suffix traps would misclass (fail-closed,
// keep short; the honest default for anything unnamed here is WRITE).
// (pass 267) +fetch to the read canon brought the network proxy verbs with
// it: vant_network_fetch / fetchJson fire OUTBOUND HTTP through the pod —
// never observer read-safe (SSRF posture), so they stay pinned write-class
// exactly as the fallback default had them before the canon grew.
const WRITE_OVERRIDES = new Set(['vant_network_fetch', 'vant_network_fetchJson']);
// Exec-class verbs (run arbitrary code through the pod) — a distinct gate so
// the trust floor `low` (strip exec/spawn) actually bites.
const EXEC_TOOL_RE = /(^|_|\.)(exec|shell|run)(_|$)|^(sudo_shell|command_exec)$/;

function classifyTool(tool) {
    if (typeof tool !== 'string' || !tool) return 'admin';
    if (GUEST_ADMIN_TOOLS.has(tool)) return 'admin';
    if (WRITE_OVERRIDES.has(tool)) return 'write';
    const tail = tool.toLowerCase().split('.').pop();
    if (READ_TOOL_RE.test(tool) || READ_TOOL_RE.test(tail.replace(/^(vant|mcp|sudo)_/, ''))) return 'read';
    // honest default: unknown = write (fail-closed for observers)
    return 'write';
}

// ---------- brain scoping (the leisure/tempo containment contract) ----------

function _brainName() {
    try {
        const name = require('./brain').getCurrentBrain();
        return (typeof name === 'string' && name.trim()) ? name.trim() : 'vant';
    } catch (e) {
        return 'vant';
    }
}

function _brainSafe(brain) {
    if (typeof brain !== 'string') return null;
    const clean = brain.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return clean || null;
}

function _privateBase() {
    try {
        const mod = require('./brain');
        if (mod.getBrainPath) return path.dirname(path.resolve(mod.getBrainPath()));
    } catch (e) { /* fallback below */ }
    return path.join('models', 'private');
}

function _ledgerPath(brain) {
    return path.join(_privateBase(), _brainSafe(brain) || _brainName(), '.guests.json');
}

// ---------- ledger (mtime-fresh cache, external-writer honest) ----------

let _ledgerCache = null;
let _ledgerMtime = 0;

function _freshLedger(brain) {
    return { brain: brain || _brainName(), guests: [], pendingPairing: null };
}

function _diskMtime(brain) {
    try { return fs.statSync(_ledgerPath(brain)).mtimeMs; } catch (e) { return 0; }
}

function _readLedger(brain) {
    try {
        const data = JSON.parse(fs.readFileSync(_ledgerPath(brain), 'utf8'));
        return data && typeof data === 'object' && Array.isArray(data.guests)
            ? { guests: data.guests, pendingPairing: data.pendingPairing || null, brain: brain }
            : _freshLedger(brain);
    } catch (e) {
        return _freshLedger(brain);
    }
}

function _useLedger(brain) {
    const dbg = process.env.DEBUG_GUESTS;
    if (!_ledgerCache || _ledgerCache.brain !== brain) {
        _ledgerCache = _readLedger(brain);
        _ledgerMtime = _diskMtime(brain);
        if (dbg) console.error('[guests-debug] cold load for', brain);
    } else {
        const disk = _diskMtime(brain);
        if (disk !== _ledgerMtime) {
            _ledgerCache = _readLedger(brain);
            _ledgerMtime = disk;
            if (dbg) console.error('[guests-debug] external-writer reload', (_ledgerCache.guests || []).length, 'rows');
        } else if (dbg) console.error('[guests-debug] cache hit', (_ledgerCache.guests || []).length, 'rows, mtime', _ledgerMtime % 1e7);
    }
    return _ledgerCache;
}

function _writeLedger(brain, data) {
    try {
        fs.mkdirSync(path.dirname(_ledgerPath(brain)), { recursive: true });
        require('./primitives').atomicWriteFile(_ledgerPath(brain), JSON.stringify(data, null, 2));
        _ledgerMtime = _diskMtime(brain);
        return true;
    } catch (e) {
        // isolation rule: never take a build down — but the failure is
        // AUDIBLE, never swallowed silently (a swallowed guest-write is how
        // "the token you were just handed" silently stops working).
        try { require('./audit').info('[guests] ledger write refused: ' + e.message); } catch (e2) { /* no bus */ }
        return false;
    }
}

// ---------- events (bus parity, never fatal) ----------

function _emit(event, data) {
    try { require('./event').emit(event, data); } catch (e) { /* bus never blocks */ }
}

// ---------- token shape ----------

function _tokenHash(rawToken) {
    return hash.sha256(String(rawToken));
}

function _parseGuestToken(raw) {
    if (typeof raw !== 'string' || !raw.startsWith('vguest_')) return null;
    const rest = raw.slice('vguest_'.length);
    // BOTH parts are hex: the '_' separator must be UNAMBIGUOUS. Older
    // drafting used base64url for both, which randomly produces ids/secrets
    // containing '_' — the greedy capture then swallows the separator into a
    // bogus id (verify intermittently "losing" freshly-issued tokens). Hex
    // ids/secrets make the split total and dual-parse-identical.
    const m = /^([a-f0-9]{6,32})_([a-f0-9]{24,128})$/.exec(rest);
    if (!m) return null;
    return { id: m[1], secret: m[2] };
}

function _capRole(role, trust) {
    const caps = (ROLE_CAPS[role] || []).slice();
    const floor = TRUST_CAP_FLOOR[trust];
    if (floor) for (const cap of floor) {
        const i = caps.indexOf(cap);
        if (i !== -1) caps.splice(i, 1);
    }
    return caps;
}

// ---------- public surface ----------

/**
 * Issue a guest identity. Returns the RAW token exactly once.
 *
 * @param {string} name
 * @param {object} [opts]
 * @param {string} [opts.role] 'observer'|'human'|'agent' (default 'human')
 * @param {string} [opts.scopeOwner] lib/scope.js owner ref 'org:|dept:|team:|agent:<x>' (validates via scope.parseOwner)
 * @param {string} [opts.trustLevel] lib/trust.js level (default 'medium')
 * @param {string|number} [opts.expires] '7d' | ms deadline | null (never)
 * @param {string} [opts.brain] explicit brain scope
 * @returns {object} { token, guest: {id, name, role, scopeOwner, trustLevel, expiresAt, ...} }
 */
function issue(name, opts = {}) {
    const text = String(name || '').trim();
    if (!text || text.length > 64) {
        throw new errors.VantError('guests.issue: a guest needs a name (1-64 chars)', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
    }
    const role = ROLE_CAPS[opts.role] ? opts.role : 'human';
    const trust = TRUST_LEVELS.includes(opts.trustLevel) ? opts.trustLevel : 'medium';
    let scopeOwner = null;
    if (opts.scopeOwner !== undefined && opts.scopeOwner !== null) {
        const parsed = require('./scope').parseOwner(opts.scopeOwner);
        if (!parsed || parsed.kind === null) {
            throw new errors.VantError('guests.issue: scopeOwner must be a scope owner ref (org:/dept:/team:/agent:<x>) — fail-closed by kind', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
        }
        scopeOwner = opts.scopeOwner;
    }
    const b = _brainSafe(opts.brain) || _brainName();
    const ledger = _useLedger(b);
    if (ledger.guests.filter(g => !g.revokedAt).length >= MAX_GUESTS) {
        throw new errors.VantError('guests.issue: guest roster capped at ' + MAX_GUESTS + ' — revoke before issuing', { code: errors.CODES.RATE_LIMIT_EXCEEDED, retryable: false });
    }
    // (see _parseGuestToken) hex for BOTH parts: the separator '_' then
    // never collides with token alphabets
    const id = crypto.randomBytes(9).toString('hex');
    const secret = crypto.randomBytes(32).toString('hex');
    const raw = 'vguest_' + id + '_' + secret;
    // '7d'-style specs, plain ms numbers, or null (never expires) — same
    // animations cron duration grammar family.
    let expiresAt = null;
    if (typeof opts.expires === 'number' && opts.expires > 0) {
        expiresAt = opts.expires > 1e9 ? opts.expires : Date.now() + opts.expires;
    } else if (typeof opts.expires === 'string') {
        const m = /^(\d+)([dhm])$/.exec(String(opts.expires).trim());
        if (!m) throw new errors.VantError('guests.issue: --expires takes "7d"/"12h"/"90m" or a ms number', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
        expiresAt = Date.now() + Number(m[1]) * ({ d: 864e5, h: 36e5, m: 6e4 }[m[2]]);
    }
    const guest = {
        id,
        name: text.slice(0, 64),
        role,
        scopeOwner,
        trustLevel: trust,
        tokenHash: _tokenHash(raw),
        createdAt: Date.now(),
        expiresAt,
        lastSeenAt: null,
        revokedAt: null,
        brain: b
    };
    ledger.guests.push(guest);
    if (!_writeLedger(b, ledger)) {
        throw new errors.VantError('guests.issue: ledger write refused (fail-closed — NO token is issued when the roster cannot persist)', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
    }
    _emit('guest:issued', { id, name: guest.name, role, brain: b });
    return { token: raw, guest: _pub(guest) };
}

/** Public projection: never the token hash, never a raw secret. */
function _pub(g) {
    return { id: g.id, name: g.name, role: g.role, scopeOwner: g.scopeOwner || null, trustLevel: g.trustLevel, createdAt: g.createdAt, expiresAt: g.expiresAt || null, lastSeenAt: g.lastSeenAt || null, revokedAt: g.revokedAt || null };
}

/**
 * Verify a raw guest token -> { guest, caps, isGuest } or null.
 * Denylist-backed: revoked/expired/deleted all fail closed. Honors
 * lastSeenAt (external-write honest via the mtime-fresh cache).
 *
 * @param {string} rawToken
 * @param {object} [opts] { brain }
 * @returns {object|null} { guest: <public projection>, caps: string[], isGuest: true }
 */
function verify(rawToken, opts = {}) {
    const parsed = _parseGuestToken(rawToken);
    if (!parsed) {
        if (process.env.DEBUG_GUESTS && typeof rawToken === 'string') console.error('[guests-debug] verify parse-FAIL prefix:', rawToken.slice(0, 20), 'len:', rawToken.length);
        return null;
    }
    const b = _brainSafe(opts.brain) || _brainName();
    const ledger = _useLedger(b);
    const guest = ledger.guests.find(g => g.id === parsed.id);
    // Timing-safe across the whole hash space (wrong id == wrong hash shape):
    // compare the STORED hash against the presented-token hash; an unknown id
    // burns the same compare against a constant to keep the branch profile flat.
    const presented = _tokenHash('vguest_' + parsed.id + '_' + parsed.secret);
    const storedHash = guest ? guest.tokenHash : null;
    const ref = Buffer.from(storedHash || hash.sha256('vguest_' + parsed.id + '_' + '0' + parsed.secret), 'hex');
    const cand = Buffer.from(presented, 'hex');
    const equal = ref.length === cand.length && crypto.timingSafeEqual(ref, cand);
    if (process.env.DEBUG_GUESTS) {
        console.error('[guests-debug] verify', parsed.id, 'found:', !!guest, 'hashEq:', equal, 'revoked:', guest && !!guest.revokedAt, 'expired:', guest && guest.expiresAt ? Date.now() > guest.expiresAt : false);
    }
    if (!guest || !storedHash || !equal) return null;
    if (guest.revokedAt) return null;
    if (guest.expiresAt && Date.now() > guest.expiresAt) return null;
    guest.lastSeenAt = Date.now();
    _writeLedger(b, ledger); // lastSeen persists (best-effort; fails soft)
    return { guest: _pub(guest), caps: _capRole(guest.role, guest.trustLevel), isGuest: true };
}

/** Revoke by id (denylist: dead now, dead forever). */
function revoke(id, opts = {}) {
    const b = _brainSafe(opts.brain) || _brainName();
    const ledger = _useLedger(b);
    const guest = ledger.guests.find(g => g.id === id || g.name === id);
    if (process.env.DEBUG_GUESTS) console.error('[guests-debug] revoke', id, 'brain', b, 'found:', !!guest, 'alreadyRevoked:', !!(guest && guest.revokedAt), 'rows:', ledger.guests.length, 'instance:', Math.round(Math.random() * 1e6));
    if (!guest || guest.revokedAt) return false;
    guest.revokedAt = Date.now();
    const ok = _writeLedger(b, ledger);
    if (ok) _emit('guest:revoked', { id: guest.id, name: guest.name, role: guest.role, brain: b });
    return ok;
}

/**
 * Read model / introspection. NEVER includes hashes or raw secrets.
 */
function list(opts = {}) {
    const b = _brainSafe(opts.brain) || _brainName();
    const ledger = _useLedger(b);
    return ledger.guests.map(_pub);
}

/** Access the raw pendingPairing row for introspection (module callers). */
function pendingPairing(opts = {}) {
    const b = _brainSafe(opts.brain) || _brainName();
    return _useLedger(b).pendingPairing;
}

function _pairingHash(code) { return _tokenHash('vhpair::' + code); }

/**
 * Persist a pairing code's HASH for later single-use redemption (called by
 * `vant headless` at boot; cross-process truth in the guest ledger, so a
 * dashboard CLI process can redeem without talking to the pod).
 *
 * @returns {boolean} persisted
 */
function offerPairing(code, opts = {}) {
    if (typeof code !== 'string' || !/^vhpair-[A-Za-z0-9-]{6,49}$/.test(code)) return false;
    const b = _brainSafe(opts.brain) || _brainName();
    const ledger = _useLedger(b);
    ledger.pendingPairing = { hash: _pairingHash(code), createdAt: Date.now(), expiresAt: Date.now() + 24 * 36e5 };
    return _writeLedger(b, ledger);
}

/**
 * Redeem the pending pairing code: single-use, creates the default
 * `human` guest ("pairing code is a voucher, not a standing credential").
 *
 * @returns {object} { ok, token?, guest?, reason? }
 */
function pair(code, opts = {}) {
    const b = _brainSafe(opts.brain) || _brainName();
    const ledger = _useLedger(b);
    const pending = ledger.pendingPairing;
    if (!pending) return { ok: false, reason: 'no pending pairing code' };
    if (Date.now() > pending.expiresAt) {
        ledger.pendingPairing = null;
        _writeLedger(b, ledger);
        return { ok: false, reason: 'pairing code expired' };
    }
    const expect = Buffer.from(pending.hash, 'hex');
    const got = Buffer.from(_pairingHash(String(code || '')), 'hex');
    if (expect.length !== got.length || !crypto.timingSafeEqual(expect, got)) {
        return { ok: false, reason: 'pairing code mismatch' };
    }
    ledger.pendingPairing = null; // consume FIRST (single-use even on later failure)
    if (!_writeLedger(b, ledger)) return { ok: false, reason: 'ledger write refused (fail-closed)' };
    // The voucher becomes the operator's guest identity (role: human).
    return issue('guest-' + Date.now().toString(36), { role: 'human', brain: b, expires: '30d' });
}

/**
 * Door gate: may THIS guest call THIS tool?
 *
 * @param {string} tool
 * @param {object} verified - guests.verify() result
 * @returns {object} { allowed, reason?, reasonCode? }
 */
function authorize(tool, verified) {
    if (!verified || !verified.isGuest) return { allowed: true };
    const cls = classifyTool(tool);
    if (cls === 'admin') {
        return { allowed: false, reason: 'guest management is admin-only — a guest can never manage guests', reasonCode: 'E_GUEST_ADMIN' };
    }
    if (cls !== 'read' && EXEC_TOOL_RE.test(String(tool))) {
        return verified.caps.includes('canExec')
            ? { allowed: true }
            : { allowed: false, reason: 'exec-class verbs require the canExec capability', reasonCode: 'E_GUEST_CAP' };
    }
    const needs = cls === 'read' ? 0 : 1; // read verbs need NO capability; write verbs CAN WRITE
    if (needs === 0) return { allowed: true };
    // Spawn-class write verbs check canSpawn specifically (the trust floor
    // medium/low strips it: spawning is a working-peer act, not a UI act).
    if (/(^|_|\.)(spawn|delegate|kill|terminate|work_assign)(_|$)/.test(String(tool))) {
        return verified.caps.includes('canSpawn')
            ? { allowed: true }
            : { allowed: false, reason: 'spawn-class verbs require the canSpawn capability', reasonCode: 'E_GUEST_CAP' };
    }
    if (verified.caps.includes('canWrite')) return { allowed: true };
    return { allowed: false, reason: 'role "' + (verified.guest ? verified.guest.role : '?') + '" cannot call write-class tools', reasonCode: 'E_GUEST_CAP' };
}

// ---------- per-tenant LIST filtering (pass 213, H5 of #185) ----------
// H1 shipped the door capacity honestly (roster cap + owner-only admin) and
// DECLARED the boundary: org-wide list surfaces filtered an unscoped guest
// view nothing. This closes that runway with a fail-closed matcher using
// ONLY existing machinery (scope.parseOwner + scope.resolveMembers + the
// teams rows).

/**
 * Per-tenant visibility for a RECORD that carries an OWNER ref
 * (org:/dept:/team:/agent:<id>). Rules, fail-closed throughout:
 * - record WITHOUT owner ref = unscoped = PUBLIC (the lib/scope normalize()
 *   legacy read rule) => visible to every guest.
 * - guest WITHOUT an issued scopeOwner = the unscoped default tenant => sees
 *   ONLY unscoped records (a scoped row of another tenant never shows).
 * - both scoped => visible iff EQUAL, or the viewer's agent id resolves as a
 *   MEMBER of the record's owner set (member truth, via scope.resolveMembers),
 *   or the record's owner is an ANCESTOR CONTAINER of the viewer scope
 *   (viewer org sees its depts/teams; viewer dept sees its teams) — chain
 *   resolved through the teams rows, unavailable module => rule skipped.
 */
function tenantVisible(recordOwnerRef, guestOwnerRef) {
    const scope = require('./scope');
    const r = scope.parseOwner(recordOwnerRef);
    const g = scope.parseOwner(guestOwnerRef);
    if (!r || r.kind === null) return true;              // unscoped record = public
    if (!g || g.kind === null) return false;             // scoped row vs default tenant
    if (r.kind === g.kind && r.id === g.id) return true; // same tenant row
    if (g.kind === 'agent') {
        const members = scope.resolveMembers(recordOwnerRef);
        if (members && members.has(g.id)) return true;   // member of that container
    }
    try {
        const t = _teams();
        if (t) {
            const teamRow = () => (t.listTeams ? t.listTeams() : []).find(tm => tm && tm.id === r.id);
            const deptRow = () => (t.listDepts ? t.listDepts() : []).find(d => d && d.id === r.id);
            if (g.kind === 'dept' && r.kind === 'team') {
                const team = teamRow();
                if (team && team.dept === g.id) return true;
            }
            if (g.kind === 'org' && r.kind === 'dept') {
                const dept = deptRow();
                if (dept && dept.org === g.id) return true;
            }
            if (g.kind === 'org' && r.kind === 'team') {
                const team = teamRow();
                if (team) {
                    if (team.org === g.id) return true;
                    if (team.dept) {
                        const dept = (t.listDepts ? t.listDepts() : []).find(d => d && d.id === team.dept);
                        if (dept && dept.org === g.id) return true;
                    }
                }
            }
        }
    } catch (e) { /* roster module unavailable -> ancestry rules skipped (fail-closed) */ }
    return false;
}

/**
 * Roster routing: may guest ownerRef G see agent AGENT_ID on an org-wide
 * roster? The crew roster carries no owner refs of its own — the TENANT
 * rule is membership: agents assigned inside the guest's resolved container
 * are the guest's crew; everything else is another tenant's roster and is
 * WITHHELD. Fail-closed at every miss: unscoped guest -> no roster; unknown
 * container -> no roster; roster module unavailable -> no roster.
 */
function tenantAgentVisible(agentId, guestOwnerRef) {
    if (!agentId || typeof agentId !== 'string') return false;
    const scope = require('./scope');
    const g = scope.parseOwner(guestOwnerRef);
    if (!g || g.kind === null) return false;             // unscoped guest: empty roster
    if (g.kind === 'agent') return g.id === agentId;     // an agent-scoped guest sees itself
    const members = scope.resolveMembers(guestOwnerRef);
    return members ? members.has(agentId) : false;       // container miss = deny
}

// ---------- per-guest READ-VERB enumeration throttle (pass 215) ----------
// The last #185 runway item. The guest-management verbs were already
// blockable (admin-only for every guest role); the SURVEY vector is the
// read-class surface itself — a guest machine-walking agent_list/era_list/
// market lists learns shape and size of what is NOT theirs. This throttle
// admits a normal dashboard cadence and machine-walks nothing. Identity-
// keyed (NOT IP: two guests behind one NAT keep independent budgets, and
// one burned budget never affects a neighbor). Fixed window, FIFO-evicted
// map, refusals charged only by the clock (the EW4 lesson).
// The window is read PER CALL (not module-load) so runtime/test tuning
// applies even after first require; default 60s.
const BUDGET_WINDOW_DEFAULT = 60_000;
function _budgetWindowMs() {
    const envWin = parseInt(process.env.VANT_GUESTS_READ_WINDOW_MS || '0', 10);
    return Number.isFinite(envWin) && envWin > 0 ? envWin : BUDGET_WINDOW_DEFAULT;
}
const READ_BUDGET_DEFAULT = 120;     // a dashboard cadence, not a crawler
const READ_BUDGET_MAX_CLIENTS = 10_000;
const _readBudgets = new Map();      // guestId -> { windowStart, count }

/**
 * May THIS guest fire another read-class verb at the door?
 * Budget source: env VANT_GUESTS_READ_BUDGET (>=1; 0 disables), else 120
 * per 60s window. In-memory by design: the throttle bounds a live crawl,
 * not a crash-recovery ledger.
 */
function checkReadBudget(guestId) {
    if (!guestId || typeof guestId !== 'string') return { allowed: false, retryAfterMs: _budgetWindowMs() };
    const envBudget = parseInt(process.env.VANT_GUESTS_READ_BUDGET, 10);
    const budget = Number.isFinite(envBudget) && envBudget >= 0
        ? envBudget : READ_BUDGET_DEFAULT;
    if (budget === 0) return { allowed: true, budget: 0 }; // disabled
    const now = Date.now();
    const windowMs = _budgetWindowMs();
    let b = _readBudgets.get(guestId);
    if (!b || now - b.windowStart >= windowMs) {
        b = { windowStart: now, count: 0 };
        _readBudgets.set(guestId, b);
        if (_readBudgets.size > READ_BUDGET_MAX_CLIENTS) {
            let oldestKey = null, oldestStart = Infinity;
            for (const [k, v] of _readBudgets) {
                if (v.windowStart < oldestStart) { oldestStart = v.windowStart; oldestKey = k; }
            }
            if (oldestKey && oldestKey !== guestId) _readBudgets.delete(oldestKey);
        }
    }
    b.count += 1;
    if (b.count > budget) {
        _emit('guest:throttled', { guestId, tool: 'read-class', count: b.count, budget, timestamp: now });
        return {
            allowed: false,
            retryAfterMs: Math.max(1, windowMs - (now - b.windowStart)),
            budget
        };
    }
    return { allowed: true, budget, remaining: budget - b.count };
}

module.exports = {
    ROLES, ROLE_CAPS, TRUST_LEVELS, GUEST_ADMIN_TOOLS, classifyTool,
    issue, verify, revoke, list, pendingPairing, offerPairing, pair, authorize,
    // pass 213 (H5): per-tenant list filtering (org-wide roster + owner-ref records)
    tenantVisible, tenantAgentVisible,
    // pass 215: per-guest read-verb enumeration throttle
    checkReadBudget,
    // test/ops seam: honest cache reset (the mtime-fresh cache honors
    // external writers on EVERY call, so resets are only needed by tests)
    _resetForTest: () => { (_ledgerCache = null), (_ledgerMtime = 0); },
    _resetReadBudgets: () => { _readBudgets.clear(); },   // pass 215 test seam (window state is in-memory)
    // (test seam, mirror of leisure._ledgerPath) where THIS brain's guest ledger lives
    _ledgerPath: (brain) => _ledgerPath(brain),
    _ledgerFile: _ledgerPath
};
