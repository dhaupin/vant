/**
 * Teams Module (v0.8.6)
 * WITH EVENT EMISSIONS - team events emit globally
 * Organization, Department, Team, Role hierarchy for agent management
 *
 * Flexible structure: users define their own org/team/role hierarchies
 * Different industries can model differently:
 * - Software: Engineering > Frontend/Backend/DevOps > Team
 * - Logistics: Operations > Warehouse/Shipping > Team
 * - Math: Research > Applied/Pure > Team
 *
 * Usage:
 *   const teams = require('./teams');
 *   await teams.createOrg('Acme Corp');
 *   await teams.createDept('Engineering', { org: 'Acme Corp' });
 *   await teams.createTeam('Frontend', { dept: 'Engineering' });
 *   await teams.addRole('Senior Engineer', { team: 'Frontend', chain: ['Engineer'] });
 *   await teams.assign('agent_123', { team: 'Frontend', role: 'Senior Engineer' });
 */

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

const path = require('path');
const lock = require('./lock');
const Storage = require('./storage');
const Encrypt = require('./encrypt');
const vaf = require('./vaf');

// Name validation config
const NAME_CONFIG = {
    minLength: 1,
    maxLength: 100,
    // Only allow alphanumeric, spaces, hyphens, underscores
    pattern: /^[a-zA-Z0-9][a-zA-Z0-9\s\-_]{0,98}[a-zA-Z0-9]$/,
    trim: true
};

/**
 * Validate name input
 */
function _validateName(name, fieldName = 'name') {
    if (!name || typeof name !== 'string') {
        return { error: fieldName + ' is required', code: 'E_INVALID_NAME' };
    }

    // Trim whitespace
    const trimmed = NAME_CONFIG.trim ? name.trim() : name;

    if (trimmed.length < NAME_CONFIG.minLength) {
        return { error: fieldName + ' too short (min ' + NAME_CONFIG.minLength + ' chars)', code: 'E_INVALID_NAME' };
    }

    if (trimmed.length > NAME_CONFIG.maxLength) {
        return { error: fieldName + ' too long (max ' + NAME_CONFIG.maxLength + ' chars)', code: 'E_INVALID_NAME' };
    }

    if (NAME_CONFIG.pattern && !NAME_CONFIG.pattern.test(trimmed)) {
        return { error: fieldName + ' contains invalid characters', code: 'E_INVALID_NAME' };
    }

    return { valid: true, value: trimmed };
}

// Lazy-load OS modules
let _sandbox = null;
let _config = null;
let _audit = null;
let _rules = null;
let _escrow = null;

function _getSandbox() {
    // (pass 90) cache-resilient (gate.js F-2 doctrine) — same partial-export
    // hazard as lib/config.js this pass: verify defaultSandbox exists before
    // caching so a mid-cycle capture can't pin the early stub forever.
    if (!_sandbox || !_sandbox.defaultSandbox) {
        try {
            const candidate = require('./sandbox');
            if (candidate && candidate.defaultSandbox) _sandbox = candidate;
        } catch (e) {}
    }
    return _sandbox;
}

function _getEscrow() {
    if (!_escrow) {
        try {
            const escrowModule = require('./escrow');
            // Create an escrow instance
            _escrow = escrowModule.create ? escrowModule.create({ persistBudgets: false }) : null;
        } catch (e) {
            _escrow = null;
        }
    }
    return _escrow;
}

function _getConfig() {
    if (!_config) {
        try { _config = require('./config'); } catch (e) {}
    }
    return _config;
}

function _getAudit() {
    if (!_audit) {
        _audit = require('./audit');
    }
    return _audit;
}

function _getRules() {
    if (!_rules) {
        try { _rules = require('./rules'); } catch (e) {}
    }
    return _rules;
}

// Capability checks
function _checkCapability(cap) {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.can) {
        return sandbox.can(cap);
    }
    return true; // Default allow if no sandbox
}

// RLS check for teams
// (pass 90) Explicit contexts now enforce INLINE via rls.assertSync. The old
// body RETURNED the async check promise, which every caller discarded — a
// denial became an orphaned unhandledRejection after the mutation already
// landed. Anonymous (no explicit ctx) = internal actuator op -> allowed,
// same convention as lib/audit.js this pass.
function _checkRLS(userCtx, resource, operation = 'read') {
    if (!userCtx) return true;
    const sandbox = _getSandbox();
    if (sandbox && sandbox.rls && sandbox.rls.assertSync) {
        sandbox.rls.assertSync(userCtx, resource, operation);
    }
    return true; // No RLS configured -> allow (standalone usage)
}

// Rule check
function _checkRule(ruleName, context) {
    const rules = _getRules();
    if (rules && rules.check) {
        return rules.check(ruleName, context);
    }
    return true; // Default allow if no rules
}

// Team persistence - configurable path
// (pass 28) brain-scoped store is THE default — orgchart data must be
// gathered, committed, and horcrux-transported with the brain (O-7/F-10).
// The explicit teams.store config override is the only alternative; the
// old .agent_tmp fallback is GONE (no silent legacy writes outside the
// models tree). brain.js always yields a usable name ('vant' default); an
// unusable one throws rather than silently scattering orgchart state.
function _getStorePath() {
    const cfg = _getConfig();
    if (cfg && cfg.get) {
        const override = cfg.get('teams.store', null);
        if (override) return override;
    }
    // (pass 53 / two-install isolation) Brain resolution goes through
    // state-store's path-active resolver (VANT_BRAIN env > currentBrain),
    // the SAME seam consensus/market/trust/node-registry use. A bare
    // getCurrentBrain() ignores VANT_BRAIN, which split-brained an
    // env-scoped process: protocol state in one brain, the org model in
    // another.
    let brainName = 'vant';
    try {
        const stateStore = require('./state-store');
        brainName = stateStore.currentBrain();
    } catch (e) {
        const brainMod = require('./brain');
        brainName = brainMod.getCurrentBrain ? brainMod.getCurrentBrain() : 'vant';
    }
    // safe-charset guard: brain name becomes a path segment (R-6 pattern)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(brainName)) {
        throw new Error('teams: unusable current brain name: ' + JSON.stringify(brainName));
    }
    return 'models/private/' + brainName + '/orgchart/teams.json';
}

// ==================== REFERENCE RESOLUTION (D-1) ====================
// Every cross-reference in the orgchart accepts a NAME or an ID.
// IDs are stored internally; names are resolved to IDs at every boundary.
// Resolution is exact-ID first, then case-insensitive unique name match.

function _resolveOrgRef(ref) {
    if (!ref) return null;
    if (_orgs.has(ref)) return ref;                       // exact ID
    const lower = String(ref).toLowerCase();
    const matches = Array.from(_orgs.values()).filter(o => o.name.toLowerCase() === lower);
    return matches.length === 1 ? matches[0].id : null;   // unique name
}

function _resolveDeptRef(ref) {
    if (!ref) return null;
    if (_depts.has(ref)) return ref;
    const lower = String(ref).toLowerCase();
    const matches = Array.from(_depts.values()).filter(d => d.name.toLowerCase() === lower);
    return matches.length === 1 ? matches[0].id : null;
}

function _resolveTeamRef(ref) {
    if (!ref) return null;
    if (_teams.has(ref)) return ref;
    const lower = String(ref).toLowerCase();
    const matches = Array.from(_teams.values()).filter(t => t.name.toLowerCase() === lower);
    return matches.length === 1 ? matches[0].id : null;
}

function _resolveRoleRef(ref, teamId) {
    if (!ref) return null;
    if (_roles.has(ref)) return ref;
    const lower = String(ref).toLowerCase();
    let matches = Array.from(_roles.values()).filter(r => r.name.toLowerCase() === lower);
    // Context-scoped: when a team is known, prefer roles within that team
    if (teamId) {
        const scoped = matches.filter(r => r.team === teamId);
        if (scoped.length) matches = scoped;
    }
    return matches.length === 1 ? matches[0].id : null;
}

// Configurable limits - prevent spam attacks
function _getMaxOrgs() {
    const cfg = _getConfig();
    return cfg && cfg.get ? cfg.get('teams.maxOrgs', 10) : 10;
}

function _getMaxDepts() {
    const cfg = _getConfig();
    return cfg && cfg.get ? cfg.get('teams.maxDepts', 50) : 50;
}

function _getMaxTeams() {
    const cfg = _getConfig();
    return cfg && cfg.get ? cfg.get('teams.maxTeams', 100) : 100;
}

function _getMaxRoles() {
    const cfg = _getConfig();
    return cfg && cfg.get ? cfg.get('teams.maxRoles', 200) : 200;
}

// ==================== QOS RATE LIMITING ====================
const _teamRateLimit = new Map();

/**
 * Check rate limit for team operations
 * @param {string} identifier - Org, dept, or team ID
 * @param {number} window - Time window in ms
 * @param {number} max - Max operations per window
 */
function _checkTeamRate(identifier, window = 60000, max = 30) {
    const now = Date.now();
    if (!_teamRateLimit.has(identifier)) {
        _teamRateLimit.set(identifier, { count: 1, reset: now + window });
        return true;
    }

    const rl = _teamRateLimit.get(identifier);

    // Reset if window expired
    if (now > rl.reset) {
        _teamRateLimit.set(identifier, { count: 1, reset: now + window });
        return true;
    }

    // Check limit
    if (rl.count >= max) {
        _emit('team:rateLimited', { identifier, count: rl.count, max, timestamp: now });
        return false;
    }

    rl.count++;
    return true;
}

/**
 * Check rate limit for an operation, returns error object if limited
 */
function _checkTeamRateSafe(identifier, window, max) {
    if (!_checkTeamRate(identifier, window, max)) {
        return { error: 'Team operation rate limit exceeded', code: 'E_RATE_LIMIT' };
    }
    return null;
}

// Hierarchical agent limits
function _getMaxAgentsPerOrg() {
    const cfg = _getConfig();
    return cfg && cfg.get ? cfg.get('teams.maxAgentsPerOrg', 50) : 50;
}

function _getMaxAgentsPerDept() {
    const cfg = _getConfig();
    return cfg && cfg.get ? cfg.get('teams.maxAgentsPerDept', 50) : 50;
}

function _getMaxAgentsPerTeam() {
    const cfg = _getConfig();
    return cfg && cfg.get ? cfg.get('teams.maxAgentsPerTeam', 20) : 20;
}

function _getMaxReportsPerAgent() {
    const cfg = _getConfig();
    return cfg && cfg.get ? cfg.get('teams.maxReportsPerAgent', 5) : 5;
}

// Lazy load trust for permission checks (v0.9.0)
let _trust = null;
function _getTrust() {
    if (!_trust) {
        try { _trust = require('./trust'); } catch (e) { return null; }
    }
    return _trust;
}

// Count agents in org/dept/team
function _countAgentsInOrg(orgId) {
    return Array.from(_assignments.values()).filter(a => a.org === orgId).length;
}

function _countAgentsInDept(deptId) {
    return Array.from(_assignments.values()).filter(a => a.dept === deptId).length;
}

function _countAgentsInTeam(teamId) {
    return Array.from(_assignments.values()).filter(a => a.team === teamId).length;
}

// Count reports to an agent (span of control)
function _countReportsTo(agentId) {
    return Array.from(_assignments.values()).filter(a => a.reportsTo === agentId).length;
}

// In-memory state
const _orgs = new Map();      // orgId -> { id, name, desc, depts, created }
const _depts = new Map();     // deptId -> { id, name, org, teams, created }
const _teams = new Map();     // teamId -> { id, name, dept, roles, members, created }
const _roles = new Map();     // roleId -> { id, name, team, chain, permissions, created }
const _assignments = new Map(); // agentId -> { agentId, org, dept, team, role, brain, assigned }

// (pass 96) Tombstones for the cross-process org-model merge (see _saveTeams).
// Every id this process has ever held (created, adopted from disk, or deleted).
// A disk row for a seen-but-absent id is a local delete we must NOT resurrect;
// an unseen id is a concurrent writer's newcomer and IS adopted.
const _seenKeys = new Set();
function _noteSeen(kind, id) { if (id) _seenKeys.add(kind + ':' + id); }

// v0.9.0 fs->storage migration + (O-7): the teams JSON store goes through
// FileStorage (containment/symlink/VAF/atomic-write). The store path is
// resolved PER CALL (pushBrain moves it with the active brain); dirname
// becomes the store's basePath.
function _getStore() {
    const storePath = _getStorePath();
    return new Storage.FileStorage({ basePath: path.resolve(path.dirname(storePath)) });
}
function _getStoreFile() {
    return path.basename(_getStorePath());
}

// Load on init
(async () => {
    await _loadTeams();
})();

// (pass 53 / teams refresh seam) Cross-node scope consistency: teams.js
// hydrated ONCE at module init — a long-lived process could never see
// org-model writes made by another process after its boot (the two-org JV
// exercise caught this: receiving-side scope gates were boot-race-dependent,
// correct by luck of timing, not design). refresh() re-reads the store and
// MERGES unknown ids only — in-memory wins on conflict, the same rule as
// consensus hydrate. Throttled so scope-miss retries (scope.resolveMembers)
// cannot hammer the disk; force=true bypasses the throttle (tests/ops).
const REFRESH_MIN_MS = 2000;
let _lastRefresh = 0;

function _hydrateTeams(options = {}) {
    const store = _getStore();
    const storeFile = _getStoreFile();
    if (!store.has(storeFile)) return { merged: 0 };
    try {
        const data = JSON.parse(store.read(storeFile));
        let merged = 0;
        // (pass 96) Adopt unknown ids only, and never re-adopt a tombstoned id
        // (in-memory wins on conflict — same rule as before, now delete-safe).
        const _adopt = (map, kind, list, keyOf) => {
            if (!Array.isArray(list)) return;
            for (const a of list) {
                const id = keyOf(a);
                if (!id || map.has(id) || _seenKeys.has(kind + ':' + id)) continue;
                map.set(id, a);
                _seenKeys.add(kind + ':' + id);
                merged++;
            }
        };
        _adopt(_orgs, 'org', data.orgs, a => a.id);
        _adopt(_depts, 'dept', data.depts, a => a.id);
        _adopt(_teams, 'team', data.teams, a => a.id);
        _adopt(_roles, 'role', data.roles, a => a.id);
        _adopt(_assignments, 'asg', data.assignments, a => a.agentId);
        if (!options.silent) {
            try { _getAudit().info('[teams] Hydrated ' + (_orgs.size + _depts.size + _teams.size) + ' entities (+' + merged + ' merged)'); } catch (e) {}
        }
        return { merged };
    } catch (e) {
        console.warn('[teams] Store corrupted:', e.message);
        return { merged: 0, corrupted: true };
    }
}

async function _loadTeams() {
    _hydrateTeams();
}

/**
 * (pass 53) Re-read the org model from disk. Non-destructive: adopt only
 * unknown ids; local state never overwritten (multi-process rule).
 * Resolves { refreshed, merged } — refreshed:false means throttled.
 */
async function refresh(options = {}) {
    const force = options && options.force === true;
    const now = Date.now();
    if (!force && now - _lastRefresh < REFRESH_MIN_MS) {
        return { refreshed: false, throttled: true, merged: 0 };
    }
    _lastRefresh = now;
    const r = _hydrateTeams();
    return { refreshed: true, merged: r.merged || 0 };
}

/** Test/ops reset: drop all in-memory org state (fresh hydrate next touch). */
function _resetHydration() {
    _orgs.clear();
    _depts.clear();
    _teams.clear();
    _roles.clear();
    _assignments.clear();
    _seenKeys.clear(); // (pass 96) a reset means "forget everything", tombstones included
    _lastRefresh = 0;
}

/**
 * (pass 53) SYNCHRONOUS refresh for scope-gate miss paths. The scope
 * gates (canAccess/resolveMembers and every consensus/market/crew-bus
 * call site) are synchronous, so a scope-miss retry must be able to
 * re-read the store without an await. Same throttle + merge rules as
 * refresh(); force=true bypasses the throttle.
 */
function _refreshSync(options = {}) {
    const force = options && options.force === true;
    const now = Date.now();
    if (!force && now - _lastRefresh < REFRESH_MIN_MS) {
        return { refreshed: false, throttled: true, merged: 0 };
    }
    _lastRefresh = now;
    const r = _hydrateTeams();
    return { refreshed: true, merged: r.merged || 0 };
}

// (pass 89 — prime #101) Save chain + flush for exit safety. store.write
// is SYNCHRONOUS, so a save lands on disk before _saveTeams() returns —
// callers (and tests) rely on that, so the write stays inline. What
// actually raced the horcrux-restore exit was the UNAWAITED async
// teams.restoreState(): the CLI returned before its save ran and
// cold-restored brains woke with an empty org. transform.restore now
// awaits restoreState + flush(); the chain records the last completed
// save so flush() is a real drain, not a no-op guess.
let _teamsSaveChain = Promise.resolve();

// (pass 96) Cross-process org-model merge. Pass 95 fixed this class for the
// agent roster; teams.json had it too — proven live: 4 concurrent `createOrg`
// processes persisted only 1 org. _saveTeams writes the WHOLE in-memory
// snapshot while the adopt-on-hydrate merge only runs at module load, so a
// process that hydrated before a peer's write clobbered it. Every save now
// takes a short-lived lockfile in the orgchart dir and re-reads the disk
// roster (adopt unknown, tombstone seen) before writing the union.
function _teamsLockPath() { return path.resolve(_getStorePath() + '.lock'); }
// (pass 98) Delegate to lib/lock — same discipline plus a process-exit
// release hook (no leaked lockfile on abrupt teardown).
function _acquireTeamsLock() { return lock.acquire(_teamsLockPath()); }
function _releaseTeamsLock() { lock.release(_teamsLockPath()); }

function _saveTeams() {
    let locked = false;
    try {
        locked = _acquireTeamsLock();
        if (!locked) {
            console.warn('[teams] Orgchart lock unavailable — saving without cross-process merge (last-writer-wins)');
        } else {
            _hydrateTeams({ silent: true }); // adopt concurrent newcomers before writing the union
        }
        const store = _getStore();
        store.write(_getStoreFile(), JSON.stringify({
            orgs: Array.from(_orgs.values()),
            depts: Array.from(_depts.values()),
            teams: Array.from(_teams.values()),
            roles: Array.from(_roles.values()),
            assignments: Array.from(_assignments.values())
        }, null, 2));
        _teamsSaveChain = Promise.resolve();
    } catch (e) {
        console.error('[teams] Save failed:', e.message);
        // Keep the tail as-is (log, don't poison; a later save recovers).
    } finally {
        if (locked) _releaseTeamsLock();
    }
    return _teamsSaveChain;
}

/**
 * (pass 89 — prime #101) Drain pending org-model persistence. Await
 * before process exit in CLI/restore flows (transform.restore does).
 */
async function flush() {
    try {
        await _teamsSaveChain;
    } catch (e) {
        // tail is never rejected (failures log in place); defensive only
    }
}

// ==================== ORGANIZATIONS ====================

/**
 * Create organization (top-level container)
 * Sync version - saves asynchronously in background
 */
function createOrg(name, options = {}) {
    // SECURITY: Validate name
    const nameCheck = _validateName(name, 'Org name');
    if (nameCheck.error) return nameCheck;
    name = nameCheck.value;

    // SECURITY: Capability check
    if (!_checkCapability('canWrite')) {
        return { error: 'Capability denied: canWrite required - grants are per-process; run vant org grant in the SAME process as this write (see lib/sandbox.js setScopes)', code: 'E_SANDBOX' };
    }

    // SECURITY: RLS check for teams
    const userCtx = options.userCtx;
    try {
        _checkRLS(userCtx, 'team:org', 'write');
    } catch (e) {
        return { error: 'RLS denied: ' + e.message, code: 'E_RLS' };
    }

    // SECURITY: Duplicate name check (case-insensitive, trimmed)
    for (const [id, org] of _orgs) {
        if (org.name.toLowerCase() === name.toLowerCase()) {
            return { error: 'Org already exists: ' + name, code: 'E_DUPLICATE' };
        }
    }

    // QoS: Rate limit org creation
    const rateErr = _checkTeamRateSafe('global', 60000, 10);
    if (rateErr) return rateErr;

    // SECURITY: Quota check - prevent spam
    const maxOrgs = _getMaxOrgs();
    if (_orgs.size >= maxOrgs) {
        return { error: 'Org quota reached (max ' + maxOrgs + ')', code: 'E_QUOTA' };
    }

    // SECURITY: Rule check
    if (!_checkRule('team:create', { name, type: 'org' })) {
        return { error: 'Rule denied: team:create', code: 'E_RULE' };
    }

    const audit = _getAudit();
    const id = 'org_' + Date.now().toString(36) + Encrypt.key(8);
    const org = {
        id,
        name,
        desc: options.desc || '',
        metadata: options.metadata || {},
        created: Date.now()
    };
    _orgs.set(id, org);
    _noteSeen('org', id);
    // Save async (fire-and-forget)
    _saveTeams().catch(e => console.error('[teams] Save failed:', e.message));
    audit.info(`[teams] Org created: ${name} (${id})`);
    _emit('team:orgCreated', { id, name, timestamp: Date.now() });
    return org;
}

/**
 * List organizations
 */
function listOrgs() {
    return Array.from(_orgs.values());
}

/**
 * Get organization
 */
function getOrg(orgId) {
    return _orgs.get(orgId);
}

/**
 * Update organization
 */
async function updateOrg(orgId, updates) {
    const org = _orgs.get(orgId);
    if (!org) return { error: 'Org not found' };
    Object.assign(org, updates, { updated: Date.now() });
    await _saveTeams();
    _emit('team:orgUpdated', { id: orgId, timestamp: Date.now() });
    return org;
}

/**
 * Delete organization (cascades to depts/teams)
 */
async function deleteOrg(orgId, options = {}) {
    // (D-5) dryRun: report what WOULD cascade without touching anything
    if (options.dryRun) {
        const depts = Array.from(_depts.values()).filter(d => d.org === orgId).map(d => d.id);
        const teams = depts.flatMap(did => Array.from(_teams.values()).filter(t => t.dept === did).map(t => t.id));
        return { dryRun: true, cascade: { orgs: [orgId], depts, teams } };
    }
    if (!_orgs.has(orgId)) return { error: 'Org not found' };

    // Collect dept IDs first (can't modify while iterating)
    const deptIds = [];
    for (const [deptId, dept] of _depts) {
        if (dept.org === orgId) {
            deptIds.push(deptId);
        }
    }

    // Delete all depts in org
    for (const deptId of deptIds) {
        await deleteDept(deptId);
    }

    // CLEANUP: Remove assignments referencing this org
    const assignKeys = [];
    for (const [agentId, assign] of _assignments) {
        if (assign.org === orgId) {
            assignKeys.push(agentId);
        }
    }
    for (const agentId of assignKeys) {
        _assignments.delete(agentId);
    }

    _orgs.delete(orgId);
    await _saveTeams();
    _emit('team:orgDeleted', { id: orgId, cascaded: { depts: deptIds.length }, timestamp: Date.now() });
    return { deleted: true, cascaded: { depts: deptIds } };
}

// ==================== DEPARTMENTS ====================

/**
 * Create department (subdivision of org)
 * Sync version - saves asynchronously in background
 */
function createDept(name, options = {}) {
    // SECURITY: Validate name
    const nameCheck = _validateName(name, 'Dept name');
    if (nameCheck.error) return nameCheck;
    name = nameCheck.value;

    // SECURITY: Capability check
    if (!_checkCapability('canWrite')) {
        return { error: 'Capability denied: canWrite required - grants are per-process; run vant org grant in the SAME process as this write (see lib/sandbox.js setScopes)', code: 'E_SANDBOX' };
    }

    // SECURITY: RLS check for teams
    const userCtx = options.userCtx;
    try {
        _checkRLS(userCtx, 'team:dept', 'write');
    } catch (e) {
        return { error: 'RLS denied: ' + e.message, code: 'E_RLS' };
    }

    // QoS: Rate limit dept creation
    const rateErr = _checkTeamRateSafe('global', 60000, 20);
    if (rateErr) return rateErr;

    // SECURITY: Quota check - prevent spam
    const maxDepts = _getMaxDepts();
    if (_depts.size >= maxDepts) {
        return { error: 'Dept quota reached (max ' + maxDepts + ')', code: 'E_QUOTA' };
    }

    // SECURITY: Duplicate name check within same org (case-insensitive, trimmed)
    // (D-1) options.org accepts name or ID; resolved ID is what gets stored.
    // An explicit-but-unresolvable ref is E_NOT_FOUND — only an ABSENT ref
    // falls back to the first org.
    const orgId = options.org !== undefined && options.org !== null
        ? _resolveOrgRef(options.org)
        : (Array.from(_orgs.values())[0]?.id);
    if (options.org && !orgId) return { error: 'Org not found: ' + options.org, code: 'E_NOT_FOUND' };
    if (!orgId) return { error: 'No organization found' };
    for (const [id, dept] of _depts) {
        if (dept.name.toLowerCase() === name.toLowerCase() && dept.org === orgId) {
            return { error: 'Dept already exists in this org: ' + name, code: 'E_DUPLICATE' };
        }
    }

    const org = orgId;

    const audit = _getAudit();
    const id = 'dept_' + Date.now().toString(36) + Encrypt.key(8);
    const dept = {
        id,
        name,
        org,
        desc: options.desc || '',
        metadata: options.metadata || {},
        created: Date.now()
    };
    _depts.set(id, dept);
    _noteSeen('dept', id);
    // Save async (fire-and-forget)
    _saveTeams().catch(e => console.error('[teams] Save failed:', e.message));
    audit.info(`[teams] Dept created: ${name} (${id}) in org ${org}`);
    _emit('team:deptCreated', { id, name, org, timestamp: Date.now() });
    return dept;
}

/**
 * List departments (by org or all)
 * @param {string|object} filter - org ID string or {org: 'id'} object
 */
function listDepts(filter) {
    const all = Array.from(_depts.values());
    // Handle both: listDepts('org_id_or_name') and listDepts({org: '...'})
    const orgRef = typeof filter === 'object' ? filter?.org : filter;
    if (orgRef) {
        const orgId = _resolveOrgRef(orgRef) || orgRef;
        return all.filter(d => d.org === orgId);
    }
    return all;
}

/**
 * Get department
 */
function getDept(deptId) {
    return _depts.get(deptId);
}

/**
 * Delete department (cascades to teams)
 */
async function deleteDept(deptId, options = {}) {
    // (D-5) dryRun: report what WOULD cascade without touching anything
    if (options.dryRun) {
        const teams = Array.from(_teams.values()).filter(t => t.dept === deptId).map(t => t.id);
        return { dryRun: true, cascade: { depts: [deptId], teams } };
    }
    if (!_depts.has(deptId)) return { error: 'Dept not found' };

    // Collect team IDs first
    const teamIds = [];
    for (const [teamId, team] of _teams) {
        if (team.dept === deptId) {
            teamIds.push(teamId);
        }
    }

    // Delete all teams in dept
    for (const teamId of teamIds) {
        await deleteTeam(teamId);
    }

    // Collect assignment keys first
    const assignKeys = [];
    for (const [agentId, assign] of _assignments) {
        if (assign.dept === deptId) {
            assignKeys.push(agentId);
        }
    }
    for (const agentId of assignKeys) {
        _assignments.delete(agentId);
    }

    _depts.delete(deptId);
    await _saveTeams();
    _emit('team:deptDeleted', { id: deptId, cascaded: { teams: teamIds.length }, timestamp: Date.now() });
    return { deleted: true, cascaded: { teams: teamIds } };
}

// ==================== TEAMS ====================

/**
 * Create team (group within dept)
 * Sync version - saves asynchronously in background
 */
function createTeam(name, options = {}) {
    // SECURITY: Validate name
    const nameCheck = _validateName(name, 'Team name');
    if (nameCheck.error) return nameCheck;
    name = nameCheck.value;

    // SECURITY: Capability check
    if (!_checkCapability('canWrite')) {
        return { error: 'Capability denied: canWrite required - grants are per-process; run vant org grant in the SAME process as this write (see lib/sandbox.js setScopes)', code: 'E_SANDBOX' };
    }

    // SECURITY: RLS check for teams
    const userCtx = options.userCtx;
    try {
        _checkRLS(userCtx, 'team:team', 'write');
    } catch (e) {
        return { error: 'RLS denied: ' + e.message, code: 'E_RLS' };
    }

    // QoS: Rate limit team creation
    const rateErr = _checkTeamRateSafe('global', 60000, 30);
    if (rateErr) return rateErr;

    // SECURITY: Quota check - prevent spam
    const maxTeams = _getMaxTeams();
    if (_teams.size >= maxTeams) {
        return { error: 'Team quota reached (max ' + maxTeams + ')', code: 'E_QUOTA' };
    }

    // SECURITY: Duplicate name check within same dept (case-insensitive, trimmed)
    // (D-1) options.dept accepts name or ID; org context inherited from the dept
    // record. Explicit-but-unresolvable ref = E_NOT_FOUND (no silent fallback).
    const deptId = options.dept !== undefined && options.dept !== null
        ? _resolveDeptRef(options.dept)
        : (Array.from(_depts.values())[0]?.id);
    if (options.dept && !deptId) return { error: 'Dept not found: ' + options.dept, code: 'E_NOT_FOUND' };
    if (!deptId) return { error: 'No department found' };
    for (const [id, team] of _teams) {
        if (team.name.toLowerCase() === name.toLowerCase() && team.dept === deptId) {
            return { error: 'Team already exists in this dept: ' + name, code: 'E_DUPLICATE' };
        }
    }

    const dept = deptId;

    const audit = _getAudit();
    const id = 'team_' + Date.now().toString(36) + Encrypt.key(8);
    const team = {
        id,
        name,
        dept,
        desc: options.desc || '',
        metadata: options.metadata || {},
        created: Date.now()
    };
    _teams.set(id, team);
    _noteSeen('team', id);
    // Save async (fire-and-forget)
    _saveTeams().catch(e => console.error('[teams] Save failed:', e.message));
    audit.info(`[teams] Team created: ${name} (${id}) in dept ${dept}`);
    _emit('team:created', { id, name, dept, timestamp: Date.now() });
    return team;
}

/**
 * List teams (by dept or all)
 * @param {string|object} filter - dept ID string or {dept: 'id'} object
 */
function listTeams(filter) {
    const all = Array.from(_teams.values());
    // Handle both: listTeams('dept_id_or_name') and listTeams({dept: '...'})
    const deptRef = typeof filter === 'object' ? filter?.dept : filter;
    if (deptRef) {
        const deptId = _resolveDeptRef(deptRef) || deptRef;
        return all.filter(t => t.dept === deptId);
    }
    return all;
}

/**
 * Get team
 */
function getTeam(teamId) {
    return _teams.get(teamId);
}

/**
 * Delete team (cascades to roles/members)
 */
async function deleteTeam(teamId, options = {}) {
    // (D-5) dryRun: report what WOULD cascade without touching anything
    if (options.dryRun) {
        const roles = Array.from(_roles.values()).filter(r => r.team === teamId).map(r => r.id);
        const agents = Array.from(_assignments.values()).filter(a => a.team === teamId).map(a => a.agentId);
        return { dryRun: true, cascade: { teams: [teamId], roles, agents } };
    }
    if (!_teams.has(teamId)) return { error: 'Team not found' };

    // Delete all roles in team
    for (const [roleId, role] of _roles) {
        if (role.team === teamId) {
            _roles.delete(roleId);
        }
    }

    // Remove members from team
    for (const [agentId, assign] of _assignments) {
        if (assign.team === teamId) {
            _assignments.delete(agentId);
        }
    }

    _teams.delete(teamId);
    await _saveTeams();
    _emit('team:deleted', { id: teamId, timestamp: Date.now() });
    return { deleted: true };  // roles/assignments removed above are implicit (team-scope)
}

// ==================== ROLES ====================

/**
 * Create role within team
 * Chain defines hierarchy: ['Engineer', 'Senior', 'Lead'] means Lead > Senior > Engineer
 * (D-4) sync like its create* siblings — callers must not need to await this
 * (D-1) options.team accepts name or ID; resolved ID is what gets stored
 */
function createRole(name, options = {}) {
    // SECURITY: Validate name (createRole previously skipped _validateName entirely)
    const nameCheck = _validateName(name, 'Role name');
    if (nameCheck.error) return nameCheck;
    name = nameCheck.value;

    // SECURITY: Capability check
    if (!_checkCapability('canWrite')) {
        return { error: 'Capability denied: canWrite required - grants are per-process; run vant org grant in the SAME process as this write (see lib/sandbox.js setScopes)', code: 'E_SANDBOX' };
    }

    // SECURITY: Quota check - prevent spam
    const maxRoles = _getMaxRoles();
    if (_roles.size >= maxRoles) {
        return { error: 'Role quota reached (max ' + maxRoles + ')', code: 'E_QUOTA' };
    }

    const teamId = options.team !== undefined && options.team !== null
        ? _resolveTeamRef(options.team)
        : (Array.from(_teams.values())[0]?.id);
    if (options.team && !teamId) return { error: 'Team not found: ' + options.team, code: 'E_NOT_FOUND' };
    if (!teamId) return { error: 'No team found' };

    // SECURITY: Duplicate name check within same team
    for (const [id, role] of _roles) {
        if (role.name.toLowerCase() === name.toLowerCase() && role.team === teamId) {
            return { error: 'Role already exists in this team: ' + name, code: 'E_DUPLICATE' };
        }
    }

    const audit = _getAudit();
    const id = 'role_' + Date.now().toString(36) + Encrypt.key(8);
    const role = {
        id,
        name,
        team: teamId,
        chain: options.chain || [], // e.g., ['Engineer', 'Senior'] - Engineer reports to Senior
        permissions: options.permissions || [], // e.g., ['canWrite', 'canDeploy']
        metadata: options.metadata || {},
        created: Date.now()
    };
    _roles.set(id, role);
    _noteSeen('role', id);
    // Save async (fire-and-forget) — matches createOrg/createDept/createTeam
    _saveTeams().catch(e => console.error('[teams] Save failed:', e.message));
    audit.info(`[teams] Role created: ${name} (${id}) in team ${teamId}`);
    _emit('team:roleCreated', { id, name, team: teamId, timestamp: Date.now() });
    return role;
}

/**
 * List roles (optionally by team)
 */
function listRoles(teamId) {
    const all = Array.from(_roles.values());
    if (teamId) return all.filter(r => r.team === teamId);
    return all;
}

/**
 * Get role
 */
function getRole(roleId) {
    return _roles.get(roleId);
}

/**
 * Get role chain (all roles this role reports to)
 */
function getRoleChain(roleId) {
    const role = _roles.get(roleId);
    if (!role) return [];
    return role.chain || [];
}

/**
 * Check if role has permission
 */
function hasPermission(roleId, permission) {
    const role = _roles.get(roleId);
    if (!role) return false;
    return role.permissions.includes(permission);
}

// ==================== ASSIGNMENTS ====================

/**
 * Assign agent to team with role
 * Sync version - saves asynchronously in background
 * @param {string} agentId - Agent ID to assign
 * @param {object} options - { team, role, dept, org, reportsTo, brain }
 */
function assign(agentId, options = {}) {
    // VALIDATE: agentId must be a string ID (F-7 — objects/undefined produced
    // "Assigned agent [object Object]" nonsense records)
    if (!agentId || typeof agentId !== 'string') {
        return { error: 'agentId must be a string agent ID', code: 'E_INVALID_AGENT' };
    }

    // SECURITY: Capability check
    if (!_checkCapability('canWrite')) {
        return { error: 'Capability denied: canWrite required - grants are per-process; run vant org grant in the SAME process as this write (see lib/sandbox.js setScopes)', code: 'E_SANDBOX' };
    }

    // QoS: Rate limit assignments
    const rateLimitKey = options.org || options.dept || options.team || 'global';
    const rateErr = _checkTeamRateSafe(rateLimitKey, 60000, 30);
    if (rateErr) return rateErr;

    const audit = _getAudit();
    // (pass 89 — prime #104) Stored binding, read BEFORE resolution: a
    // partial re-assign must PRESERVE unspecified identity-scoping fields
    // (brain/org/dept/team/role) instead of smearing the caller's context
    // into them. {} on a first assign — nothing to preserve.
    const prev = _assignments.get(agentId) || {};
    const orgGiven = options.org !== undefined && options.org !== null;
    const deptGiven = options.dept !== undefined && options.dept !== null;
    const teamGiven = options.team !== undefined && options.team !== null;
    const roleGiven = options.role !== undefined && options.role !== null;

    // (D-1) every ref accepts name or ID; resolution order: role→team→dept→org so
    // partial context (e.g. just org+team) still resolves upward correctly
    let team = _resolveTeamRef(options.team);
    let dept = _resolveDeptRef(options.dept) || (team ? _teams.get(team)?.dept : null);
    let org = _resolveOrgRef(options.org) || (dept ? _depts.get(dept)?.org : null);
    let role = _resolveRoleRef(options.role, team);
    const reportsTo = options.reportsTo; // Agent ID this agent reports to

    // MULTIBRAIN: Get brain - explicit `brain:` wins; a re-assign WITHOUT
    // one KEEPS the stored brain (prime #104: the caller's current brain
    // smeared an explicitly-set field on partial updates). Only a first
    // assign falls back to the caller's current brain — checked via
    // options.brain PRESENCE, never via the already-resolved value.
    let brain;
    if (options.brain) {
        brain = options.brain;
    } else if (prev.brain !== undefined && prev.brain !== null) {
        brain = prev.brain;
    } else {
        // (pass 93) First-assign fallback resolves via state-store's
        // path-active resolver (VANT_BRAIN env > currentBrain) — the bare
        // currentBrain() bound first-assigns to 'vant' even under an env
        // brain (same seam as the agents spawn binding, this pass).
        try {
            const stateStore = require('./state-store');
            brain = stateStore.currentBrain();
        } catch (e) {
            try {
                const brainMod = require('./brain');
                brain = brainMod.currentBrain ? brainMod.currentBrain() : null;
            } catch (e2) {
                brain = null;
            }
        }
    }

    // VALIDATE: Entity existence — distinguish "given but unresolvable" from "not given"
    if (options.org && !org) {
        return { error: 'Org not found: ' + options.org, code: 'E_NOT_FOUND' };
    }
    if (options.dept && !dept) {
        return { error: 'Dept not found: ' + options.dept, code: 'E_NOT_FOUND' };
    }
    if (options.team && !team) {
        return { error: 'Team not found: ' + options.team, code: 'E_NOT_FOUND' };
    }
    if (options.role && !role) {
        return { error: 'Role not found: ' + options.role, code: 'E_NOT_FOUND' };
    }

    // VALIDATE: reportsTo agent exists in assignments (if specified)
    if (reportsTo && !_assignments.has(reportsTo)) {
        return { error: 'reportsTo agent not found: ' + reportsTo, code: 'E_NOT_FOUND' };
    }

    // (pass 89 — prime #104) PRESERVE unspecified fields: absent = "keep",
    // not "clear". Consistency guards drop a stale child when this call
    // introduced a NEW parent (old role under a new team, old team under
    // a new dept, old dept under a new org).
    if (org === null && !orgGiven && prev.org != null) org = prev.org;
    if (dept === null && !deptGiven && prev.dept != null &&
        (org === null || _depts.get(prev.dept)?.org === org)) dept = prev.dept;
    if (team === null && !teamGiven && prev.team != null &&
        (dept === null || _teams.get(prev.team)?.dept === dept)) team = prev.team;
    if (role === null && !roleGiven && prev.role != null &&
        (team === null || _roles.get(prev.role)?.team === team)) role = prev.role;

    // SECURITY: Hierarchical quota checks — SELF-EXCLUDED: an agent
    // re-assigned inside its own current org/dept/team must not consume a
    // slot against itself (a full org would reject its own member).
    if (org) {
        const maxPerOrg = _getMaxAgentsPerOrg();
        const usedInOrg = _countAgentsInOrg(org) - (prev.org === org ? 1 : 0);
        if (usedInOrg >= maxPerOrg) {
            return { error: 'Org agent quota reached (max ' + maxPerOrg + ')', code: 'E_QUOTA' };
        }
    }

    if (dept) {
        const maxPerDept = _getMaxAgentsPerDept();
        const usedInDept = _countAgentsInDept(dept) - (prev.dept === dept ? 1 : 0);
        if (usedInDept >= maxPerDept) {
            return { error: 'Dept agent quota reached (max ' + maxPerDept + ')', code: 'E_QUOTA' };
        }
    }

    if (team) {
        const maxPerTeam = _getMaxAgentsPerTeam();
        const usedInTeam = _countAgentsInTeam(team) - (prev.team === team ? 1 : 0);
        if (usedInTeam >= maxPerTeam) {
            return { error: 'Team agent quota reached (max ' + maxPerTeam + ')', code: 'E_QUOTA' };
        }
    }

    // SECURITY: Span of control check
    if (reportsTo) {
        const maxReports = _getMaxReportsPerAgent();
        if (_countReportsTo(reportsTo) >= maxReports) {
            return { error: 'Span of control exceeded (max ' + maxReports + ' reports per agent)', code: 'E_QUOTA' };
        }
    }

    // ESCROW: Check org budget (if escrow available). placement=false for
    // a pure partial re-assign that merely re-confirms the stored org —
    // re-confirming is not a spend (and must not be blocked by budget).
    const escrow = _getEscrow();
    const placement = org !== null && (orgGiven || deptGiven || teamGiven || prev.org !== org);
    if (escrow && placement) {
        const budgetCheck = escrow.canSpend(org, 1);
        if (!budgetCheck.allowed) {
            return { error: 'Org budget exceeded: ' + budgetCheck.reason, code: 'E_BUDGET' };
        }
    }

    const assignment = {
        agentId,
        org,
        dept,
        team,
        role,
        brain,  // MULTIBRAIN: Track which brain owns this agent
        reportsTo,
        assigned: Date.now()
    };

    _assignments.set(agentId, assignment);
    _noteSeen('asg', agentId);
    // Save async (fire-and-forget)
    _saveTeams().catch(e => console.error('[teams] Save failed:', e.message));

    // ESCROW: Record spend (if escrow available) — placement ops only
    if (escrow && placement) {
        escrow.recordSpend(org, 1);
    }

    audit.info(`[teams] Assigned agent ${agentId} to org ${org}, dept ${dept}, team ${team}, brain ${brain}, reportsTo ${reportsTo}`);
    _emit('team:assigned', { agentId, org, dept, team, role, brain, reportsTo, timestamp: Date.now() });
    return assignment;
}

/**
 * Get agent's assignment
 */
function getAssignment(agentId) {
    return _assignments.get(agentId);
}

/**
 * List all assignments (optionally by team/org/brain)
 */
function listAssignments(options = {}) {
    let all = Array.from(_assignments.values());
    if (options.org) all = all.filter(a => a.org === options.org);
    if (options.dept) all = all.filter(a => a.dept === options.dept);
    if (options.team) all = all.filter(a => a.team === options.team);
    if (options.brain) all = all.filter(a => a.brain === options.brain);  // MULTIBRAIN
    return all;
}

/**
 * MULTIBRAIN: Get brain for an agent
 * @param {string} agentId - Agent ID
 * @returns {string|null} Brain name or null
 */
function getAgentBrain(agentId) {
    const assign = _assignments.get(agentId);
    return assign ? assign.brain : null;
}

/**
 * MULTIBRAIN: List agents by brain
 * @param {string} brain - Brain name
 * @returns {Array} Array of agent IDs
 */
function listAgentsByBrain(brain) {
    const all = Array.from(_assignments.values());
    return all.filter(a => a.brain === brain).map(a => a.agentId);
}

/**
 * Remove agent from team
 */
async function unassign(agentId) {
    const removed = _assignments.delete(agentId);
    if (removed) {
        await _saveTeams();
        _emit('team:unassigned', { agentId, timestamp: Date.now() });
    }
    return { removed };
}

// ==================== PERMISSIONS & FLOW ====================

/**
 * Check if agent can perform action (based on role chain + trust)
 */
function can(agentId, permission) {
    const assign = _assignments.get(agentId);
    if (!assign || !assign.role) return false;

    // Check role and all roles in chain
    const role = _roles.get(assign.role);
    if (!role) return false;

    // Direct permission
    if (role.permissions.includes(permission)) {
        // TRUST: If role grants permission, also check trust minimum
        return _checkTrustThreshold(agentId, permission);
    }

    // Check chain
    for (const chainRoleName of role.chain || []) {
        const chainRole = Array.from(_roles.values()).find(r =>
            r.team === role.team && r.name === chainRoleName
        );
        if (chainRole && chainRole.permissions.includes(permission)) {
            return _checkTrustThreshold(agentId, permission);
        }
    }

    return false;
}

/**
 * Check trust threshold for permission (v0.9.0)
 * Low trust can be a security risk regardless of role
 */
function _checkTrustThreshold(agentId, permission) {
    const trust = _getTrust();
    if (!trust || !trust.getScore) return true; // No trust, allow

    const score = trust.getScore(agentId);

    // Critical permissions require minimum trust
    const CRITICAL_PERMS = {
        'canDeploy': 0.6,
        'canExecute': 0.6,
        'canDelete': 0.7,
        'canWrite': 0.5,
        'canAdmin': 0.8
    };

    const minTrust = CRITICAL_PERMS[permission];
    if (minTrust !== undefined) {
        return score >= minTrust;
    }

    // Default: trust below 0.3 is suspicious
    return score >= 0.3;
}

/**
 * Get delegation path (who can delegate to whom)
 */
function getDelegationPath(fromAgentId, toAgentId) {
    const fromAssign = _assignments.get(fromAgentId);
    const toAssign = _assignments.get(toAgentId);

    if (!fromAssign || !toAssign) return null;

    // Same team - can delegate
    if (fromAssign.team === toAssign.team) return ['same_team'];

    // Check role hierarchy
    const fromRole = fromAssign.role ? _roles.get(fromAssign.role) : null;
    const toRole = toAssign.role ? _roles.get(toAssign.role) : null;

    if (fromRole && toRole) {
        // fromRole is higher in chain than toRole
        if (toRole.chain.includes(fromRole.name)) return ['role_hierarchy'];
    }

    // Check dept hierarchy
    if (fromAssign.dept === toAssign.dept) return ['same_dept'];
    if (fromAssign.org === toAssign.org) return ['same_org'];

    return null;
}

/**
 * Get accountability chain (who is responsible for agent)
 */
function getAccountabilityChain(agentId) {
    const assign = _assignments.get(agentId);
    if (!assign) return [];

    const chain = [assign.agentId];

    // Find supervisor (role higher in chain)
    if (assign.role) {
        const role = _roles.get(assign.role);
        if (role && role.chain.length > 0) {
            const supervisorRole = Array.from(_roles.values()).find(r =>
                r.team === role.team && r.name === role.chain[role.chain.length - 1]
            );
            if (supervisorRole) {
                // Find agent with this role
                for (const [aId, a] of _assignments) {
                    if (a.role === supervisorRole.id && aId !== agentId) {
                        chain.push(aId);
                        break;
                    }
                }
            }
        }
    }

    return chain;
}

// ==================== HIERARCHY TRAVERSAL ====================

/**
 * Get full hierarchy for an agent
 */
function getHierarchy(agentId) {
    const assign = _assignments.get(agentId);
    if (!assign) return null;

    return {
        org: assign.org ? _orgs.get(assign.org) : null,
        dept: assign.dept ? _depts.get(assign.dept) : null,
        team: assign.team ? _teams.get(assign.team) : null,
        role: assign.role ? _roles.get(assign.role) : null,
        assignment: assign
    };
}

/**
 * Get team members
 */
function getTeamMembers(teamId) {
    const members = [];
    for (const [agentId, assign] of _assignments) {
        if (assign.team === teamId) {
            members.push({ agentId, ...assign });
        }
    }
    return members;
}

/**
 * Get department members
 */
function getDeptMembers(deptId) {
    const members = [];
    for (const [agentId, assign] of _assignments) {
        if (assign.dept === deptId) {
            members.push({ agentId, ...assign });
        }
    }
    return members;
}

/**
 * Get organization members
 */
function getOrgMembers(orgId) {
    const members = [];
    for (const [agentId, assign] of _assignments) {
        if (assign.org === orgId) {
            members.push({ agentId, ...assign });
        }
    }
    return members;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * List organizations from all brains in the stack
 * @param {Object} options - Filter options
 * @returns {Array} Combined orgs from all brains
 */
function listStackOrgs(options = {}) {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = [];

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const orgs = listOrgs(options);
            if (Array.isArray(orgs)) {
                orgs.forEach(org => {
                    results.push({ ...org, brain: brainName });
                });
            }
        } catch (e) {
            // Skip brains that fail
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

/**
 * Get organization by ID from all brains in stack
 * @param {string} orgId - Organization ID
 * @param {Object} options - Options
 * @returns {Object} Org if found
 */
function getStackOrg(orgId, options = {}) {
    const brain = require('./brain');
    const stack = brain.getStack();

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const org = getOrg(orgId, options);
            if (org) {
                brain.removeBrain();
                return { ...org, brain: brainName };
            }
        } catch (e) {
            // Try next brain
        } finally {
            brain.removeBrain();
        }
    }

    return null;
}

/**
 * List teams from all brains in the stack
 * @param {Object} options - Filter options
 * @returns {Array} Combined teams from all brains
 */
function listStackTeams(options = {}) {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = [];

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const teams = listTeams(options);
            if (Array.isArray(teams)) {
                teams.forEach(team => {
                    results.push({ ...team, brain: brainName });
                });
            }
        } catch (e) {
            // Skip brains that fail
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

/**
 * Get team by ID from all brains in stack
 * @param {string} teamId - Team ID
 * @param {Object} options - Options
 * @returns {Object} Team if found
 */
function getStackTeam(teamId, options = {}) {
    const brain = require('./brain');
    const stack = brain.getStack();

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const team = getTeam(teamId, options);
            if (team) {
                brain.removeBrain();
                return { ...team, brain: brainName };
            }
        } catch (e) {
            // Try next brain
        } finally {
            brain.removeBrain();
        }
    }

    return null;
}

/**
 * Get full hierarchy across all brains in stack
 * @returns {Object} Combined hierarchy
 */
function getStackHierarchy() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        orgs: [],
        teams: [],
        agents: []
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const hierarchy = getHierarchy();
            if (hierarchy) {
                if (hierarchy.orgs) results.orgs.push(...hierarchy.orgs.map(o => ({ ...o, brain: brainName })));
                if (hierarchy.teams) results.teams.push(...hierarchy.teams.map(t => ({ ...t, brain: brainName })));
                if (hierarchy.agents) results.agents.push(...hierarchy.agents.map(a => ({ ...a, brain: brainName })));
            }
        } catch (e) {
            // Skip brains that fail
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

// ==================== EXPORTS ====================

module.exports = {
    // Organizations
    createOrg,
    listOrgs,
    getOrg,
    updateOrg,
    deleteOrg,

    // (pass 89 — prime #101) Drain pending org-model persistence.
    flush,

    // Departments
    createDept,
    listDepts,
    getDept,
    deleteDept,

    // Teams
    createTeam,
    listTeams,
    getTeam,
    deleteTeam,

    // Roles
    createRole,
    listRoles,
    getRole,
    getRoleChain,
    hasPermission,

    // Assignments
    assign,
    getAssignment,
    listAssignments,
    unassign,

    // MULTIBRAIN
    getAgentBrain,  // Get brain for an agent
    listAgentsByBrain,  // List agents by brain

    // MULTIBRAIN STACK
    listStackOrgs,
    getStackOrg,
    listStackTeams,
    getStackTeam,
    getStackHierarchy,

    // Permissions & Flow
    can,
    getDelegationPath,
    getAccountabilityChain,

    // Hierarchy
    getHierarchy,
    getTeamMembers,
    getDeptMembers,
    getOrgMembers,

    // Config
    getStorePath: _getStorePath,
    getMaxOrgs: _getMaxOrgs,
    getMaxDepts: _getMaxDepts,
    getMaxTeams: _getMaxTeams,
    getMaxRoles: _getMaxRoles,
    // Hierarchical agent limits
    getMaxAgentsPerOrg: _getMaxAgentsPerOrg,
    getMaxAgentsPerDept: _getMaxAgentsPerDept,
    getMaxAgentsPerTeam: _getMaxAgentsPerTeam,
    getMaxReportsPerAgent: _getMaxReportsPerAgent,
    // Count helpers
    getOrgAgentCount: _countAgentsInOrg,
    getDeptAgentCount: _countAgentsInDept,
    getTeamAgentCount: _countAgentsInTeam,
    getAgentReportsCount: _countReportsTo,

    // Horcrux state
    gatherState,
    restoreState,
    migrateLegacyState,

    // (pass 53) Cross-node refresh seam: re-read the org model from disk
    // (merge-only) so a long-lived process sees other processes' writes.
    // _resetHydration is the test/ops reset (consensus/market naming).
    refresh,
    _resetHydration,
    _refreshSync
};

// ==================== HORCRUX GATHER/RESTORE ====================
function gatherState() {
    return {
        orgs: Array.from(_orgs.entries()),
        depts: Array.from(_depts.entries()),
        teams: Array.from(_teams.entries()),
        roles: Array.from(_roles.entries()),
        assignments: Array.from(_assignments.entries()),
        count: _orgs.size,
        gatheredAt: Date.now()
    };
}
// (pass 89 — prime #101) Stays SYNC, and now GUARANTEED to persist:
// _saveTeams() writes synchronously (store.write is sync), so by the time
// restoreState returns the store file is on disk — callers awaiting it
// (transform.restore) or not both see the write land before any exit.
// (The earlier async variant broke sync consumers: restoreState's result
// object and its synchronous E_LEGACY_FORMAT throw.)
function restoreState(data) {
    // (pass 27) STRICT single format: gatherState()'s Map-entries form
    // ([k, v] pairs) is the ONLY accepted input. The legacy store-file array
    // form (plain entity objects) is rejected — migrate it first with
    // teams.migrateLegacyState(). Per the no-legacy-code policy: no dual
    // parsing. Validation runs BEFORE the maps are cleared, so a rejected
    // payload leaves current state untouched.
    const COLLECTIONS = [
        ['orgs', _orgs, 'id'], ['depts', _depts, 'id'], ['teams', _teams, 'id'],
        ['roles', _roles, 'id'], ['assignments', _assignments, 'agentId']
    ];
    const problems = [];
    for (const [name] of COLLECTIONS) {
        const arr = data && data[name];
        if (arr === undefined) continue;
        if (!Array.isArray(arr)) { problems.push(name + ': not an array'); continue; }
        arr.forEach((o, i) => {
            const keyField = COLLECTIONS.find(c => c[0] === name)[2];
            if (!Array.isArray(o) || o.length !== 2 || !o[0] || !o[1] || o[0] !== o[1][keyField]) {
                problems.push(name + '[' + i + ']: not a [key, entity] entries pair with matching ' + keyField);
            }
        });
    }
    if (problems.length) {
        const err = new Error('teams.restoreState: legacy/invalid format rejected — ' +
            problems.slice(0, 3).join('; ') + '. Convert with teams.migrateLegacyState(legacyData) first.');
        err.code = 'E_LEGACY_FORMAT';
        throw err;
    }

    // Valid: wipe + rehydrate + persist
    _orgs.clear();
    _depts.clear();
    _teams.clear();
    _roles.clear();
    _assignments.clear();
    const count = (arr) => (Array.isArray(arr) ? arr.length : 0);
    if (data) {
        for (const [name, map] of COLLECTIONS) {
            const arr = data[name];
            if (!arr) continue;
            arr.forEach((o) => { map.set(o[0], o[1]); });
            // keep assignment key shape: entries are [agentId, assignment]
        }
    }
    // Persist the rehydrated state to the (brain-scoped) store — the save
    // is synchronous, so this line is the durability guarantee (pass 89,
    // prime #101).
    _saveTeams().catch(e => console.error('[teams] restoreState save failed:', e.message));
    return { restored: true, orgs: _orgs.size, depts: _depts.size, teams: _teams.size, roles: _roles.size, assignments: _assignments.size, input: { orgs: count(data && data.orgs), depts: count(data && data.depts), teams: count(data && data.teams) } };
}

/**
 * (pass 27) Migrate a legacy store-file shaped payload (plain entity
 * objects) into the strict gatherState() entries format. The bridge for
 * old horcruxes: migrateLegacyState(legacy).orgs etc. feed restoreState.
 * Pure — validates and converts without touching live state.
 *
 * @param {Object} legacy - { orgs?, depts?, teams?, roles?, assignments? }
 *        where each is an array of plain entity objects (or entries, which
 *        pass through unchanged)
 * @returns {{ converted: Object, counts: Object }} entries-shaped payload
 * @throws when a payload section is neither entries nor entity objects with ids
 */
function migrateLegacyState(legacy) {
    if (!legacy || typeof legacy !== 'object') {
        throw new Error('teams.migrateLegacyState: payload object required');
    }
    const KEY_BY_SECTION = { orgs: 'id', depts: 'id', teams: 'id', roles: 'id', assignments: 'agentId' };
    const converted = {};
    const counts = {};
    for (const [name, keyField] of Object.entries(KEY_BY_SECTION)) {
        const arr = legacy[name];
        if (arr === undefined) continue;
        if (!Array.isArray(arr)) throw new Error('migrateLegacyState: ' + name + ' must be an array');
        converted[name] = arr.map((o) => {
            if (Array.isArray(o) && o.length === 2 && o[0] && o[1] && o[0] === o[1].id) return o; // already entries
            const key = o && o[keyField];
            if (!key || typeof o !== 'object') {
                throw new Error('migrateLegacyState: ' + name + ' entry missing ' + keyField);
            }
            return [key, o];
        });
        counts[name] = converted[name].length;
    }
    return { converted, counts };
}
