/**
 * Rules (v0.8.6)
 * WITH EVENT EMISSIONS - rule checks emit globally
 * Global rules engine for Vant operations
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

const RULES_VERSION = require('./version');
const errors = require('./error');

// Default rule set
const DEFAULT_RULES = {
    version: RULES_VERSION,
    rules: {},
    meta: {
        created: Date.now(),
        updated: Date.now()
    }
};

let _rules = { ...DEFAULT_RULES };

/**
 * Load rules manifest
 */
function getRules() {
    return _rules;
}

/**
 * Get a specific rule
 */
function getRule(name) {
    return _rules.rules[name] || null;
}

/**
 * Add/update a rule
 */
function setRule(name, rule) {
    _rules.rules[name] = {
        ...rule,
        updated: Date.now()
    };
    _rules.meta.updated = Date.now();
    return { name, set: true };
}

/**
 * Remove a rule
 */
function deleteRule(name) {
    delete _rules.rules[name];
    _rules.meta.updated = Date.now();
    return { name, deleted: true };
}

/**
 * List all rules
 */
function listRules() {
    return Object.keys(_rules.rules);
}

// ==================== GRANT LEDGER (B0, issue #253) ====================
// Vant's real privilege records, separate from the legacy custom-rule map
// (whose entries fuse validates() into arbitrary callers). The ledger is
// what the discipline families grade, with four laws enforced IN THE
// DECISION ENGINE, not in callers:
//   1. PRECEDENCE — declared, deterministic: the max precedence wins the
//      (principal, capability) ask; a tie resolves deny (deny-wins).
//   2. REVOCATION CARRIES — a revoke is a TOMBSTONE deny entry, never a
//      delete: deleting a grant would resume default-allow, and the law
//      says deny carries until a HIGHER-precedence grant explicitly
//      overrides it.
//   3. SCOPE ISOLATION — a grant scoped to A authorizes exactly A; a
//      scoped ask with no covering grant fails closed. Shared parents
//      confer nothing.
//   4. TRUST FLOORS — a grant record carries the principal's trust; a
//      resolution context may carry the floor for the asked scope (the
//      documented vocabulary), and a principal below the floor is denied
//      even when a live allow grant exists.
// The legacy check() path is untouched: MCP/teams feed ARBITRARY params
// objects as context there, and fail-closed scope reads would deny every
// tool call whose params carry a 'scope' key. evaluate() is the
// privilege-resolution door for callers that HOLD a principal/scope ask.

let _grantSeq = 0;
let _grantLedger = [];

function _validateLedgerEntry(entry) {
    if (!entry || typeof entry !== 'object') throw new errors.VantError('grant entry required', { code: errors.CODES.VAF_REQUIRED_FIELD, retryable: false });
    if (typeof entry.principal !== 'string' || !entry.principal) throw new errors.VantError('grant principal required', { code: errors.CODES.VAF_REQUIRED_FIELD, retryable: false });
    if (typeof entry.capability !== 'string' || !entry.capability) throw new errors.VantError('grant capability required', { code: errors.CODES.VAF_REQUIRED_FIELD, retryable: false });
    if (!entry.revoked && entry.permit !== 'allow' && entry.permit !== 'deny') {
        throw new errors.VantError('grant permit must be allow or deny', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
    }
    return entry;
}

/**
 * Write a grant record into vant's ledger.
 * @param {object} entry - { principal, capability, scope?, permit,
 *   precedence?, trust?, role? }
 */
function grantLedger(entry) {
    _validateLedgerEntry(entry);
    const record = {
        id: `${entry.principal}:${entry.capability}#${++_grantSeq}`,
        principal: entry.principal,
        capability: entry.capability,
        scope: (entry.scope != null && entry.scope !== '') ? String(entry.scope).slice(0, 120) : null,
        permit: entry.permit,
        precedence: Number(entry.precedence) || 0,
        trust: (Number(entry.trust) > 0 || entry.trust === 0) ? Number(entry.trust) : null,
        role: entry.role ? String(entry.role).slice(0, 40) : null,
        revoked: false,
        at: Date.now()
    };
    _grantLedger.push(record);
    _emit('rules:granted', { principal: record.principal, capability: record.capability, permit: record.permit, precedence: record.precedence });
    return record;
}

/**
 * Revoke a principal's grants for a capability: tombstone deny at a
 * precedence above everything the revokee held. Never a silent delete.
 * @returns {object} the tombstone record
 */
function revokeGrants({ principal, capability, scope = null } = {}) {
    if (!principal || !capability) throw new errors.VantError('revoke needs principal and capability', { code: errors.CODES.VAF_REQUIRED_FIELD, retryable: false });
    const held = _grantLedger.filter((g) => g.principal === principal && g.capability === capability);
    const tombstone = grantLedger({
        principal, capability, scope,
        permit: 'deny',
        precedence: held.length ? Math.max(...held.map((g) => g.precedence)) + 1 : 99,
        revoked: true
    });
    _emit('rules:revoked', { principal, capability, tombstone: tombstone.id });
    return tombstone;
}

function getGrants({ principal, capability } = {}) {
    return _grantLedger.filter((g) =>
        (principal == null || g.principal === principal)
        && (capability == null || g.capability === capability));
}

/**
 * THE DECISION ENGINE. Resolves a (principal?, scope?) ask against the
 * grant ledger: trust floor -> precedence (deny-wins) -> scope
 * fail-closed -> successor resolution. Returns
 * { allowed, rule?, reason?, principal? }.
 */
function evaluate(operation, context = {}) {
    // Baseline: the same reviewed default-deny + allowlist posture check()
    // carries - grant records never override the dangerous-name floor.
    if (!SAFE_TOOL_ALLOWLIST.includes(operation)) {
        const dangerous = ['shell', 'exec', 'cmd', 'system', 'fork', 'run'];
        for (const danger of dangerous) {
            if (String(operation).toLowerCase().includes(danger)) {
                return _verdict(operation, false, 'default', 'Default deny: dangerous operation');
            }
        }
    }

    const askScope = context.scope != null && context.scope !== '' ? String(context.scope) : null;
    const askFloor = context.trustFloor != null && Number(context.trustFloor) > 0 ? Number(context.trustFloor) : null;

    // Capability candidates: everyone whose grant record covers the asked
    // capability, narrowed by principal when the ask names one.
    let candidates = _grantLedger.filter((g) => g.capability === operation);
    if (context.principal) candidates = candidates.filter((g) => g.principal === context.principal);

    // (Law 4) TRUST FLOOR: the asked scope carries a floor; a principal
    // whose grant trust sits below it is denied even with a live allow.
    if (askFloor !== null && candidates.length) {
        const trustOf = candidates.map((g) => g.trust == null ? 0 : g.trust);
        const strongest = Math.max(...trustOf);
        if (strongest < askFloor) {
            return _verdict(operation, false, null, `trust floor: grant trust ${strongest} below floor ${askFloor} for scope ${askScope || '(none)'}`);
        }
    }

    // (Law 3) SCOPE ISOLATION: covers = exact-scope grants, or scope-null
    // grants (unscoped grant = any-scope). A scoped ask nobody covers is
    // fail-closed; a scopeless ask covered only by scoped grants too.
    const covering = candidates.filter((g) => g.scope === null || (askScope !== null && g.scope === askScope));
    if (askScope !== null && covering.length === 0) {
        return _verdict(operation, false, null, `no grant covers scope ${askScope} (scope isolation: no sideways, no parent derivation)`);
    }
    if (askScope === null && candidates.length > 0 && covering.length === 0) {
        return _verdict(operation, false, null, 'no unscoped grant covers this capability (scope isolation)');
    }

    if (covering.length === 0) {
        // No grants at all: the legacy posture answers (allowed), matching
        // check()'s default-allow fallthrough for unlisted operations.
        return _verdict(operation, true, null, null);
    }

    // (Law 1) PRECEDENCE: the declared max wins; a tie is deny-wins.
    const top = Math.max(...covering.map((g) => g.precedence));
    const winners = covering.filter((g) => g.precedence === top);
    const winner = winners.some((g) => g.permit === 'deny')
        ? winners.find((g) => g.permit === 'deny')
        : winners[0];
    const allowed = winner.permit === 'allow';
    const v = _verdict(operation, allowed, winner.id, allowed ? null : `denied by grant: ${winner.principal}`);
    // (succession) a winner named that way reads as the resolved heir.
    if (allowed) v.principal = winner.principal;
    return v;
}

function _verdict(operation, allowed, rule, reason) {
    _emit('rules:checked', { operation, allowed, rule, timestamp: Date.now() });
    return { allowed, rule: rule || null, reason: reason || null };
}

/**
 * Check if operation passes rules
 */
// (Wave U2) Vetted-registry allowlist. The default-deny substring loop
// below is a blunt instrument: `vant_universe_fork` (a SEED fork via
// SeedChain prefix folding — no process forking involved) was refused at
// the rules door purely because the tool NAME contains 'fork'. These
// exact tool names were reviewed and are allowed BY NAME, not by
// substring — adding a new tool here is a deliberate review act, never a
// glob. Custom rules below can still deny these.
const SAFE_TOOL_ALLOWLIST = [
    'vant_universe_snapshot',
    'vant_universe_fork',
    'vant_universe_status',
    'vant_universe_record',
    'vant_universe_diff',
    'vant_universe_resume',
    // (Wave U3) governance scenario playbook — reviewed by name; note
    // 'scenario_task' contains no dangerous substring and the gates
    // (quarantine/escrow/consensus) run INSIDE the handler.
    'vant_scenario_crew',
    'vant_scenario_task',
    'vant_scenario_status'
];

function check(operation, context = {}) {
    // (Wave U2) Exact-name allowlist first: a registered-and-reviewed MCP
    // tool skips the substring default-deny (which only ever matched the
    // NAME, not the behavior). Rules-based denials below still apply.
    if (SAFE_TOOL_ALLOWLIST.includes(operation)) {
        // fall through to custom-rule evaluation
    } else {
    // DEFAULT DENY: Block dangerous operations until proven safe
    // NOTE: 'spawn' removed - agent spawning is safe via MCP
    // NOTE: 'eval' removed - vant_compute_eval is safe code evaluation
    const dangerous = ['shell', 'exec', 'cmd', 'system', 'fork', 'run'];
    for (const danger of dangerous) {
        if (operation.toLowerCase().includes(danger)) {
            return { allowed: false, rule: 'default', reason: 'Default deny: dangerous operation' };
        }
    }
    }

    const ruleNames = Object.keys(_rules.rules);
    for (const name of ruleNames) {
        const rule = _rules.rules[name];
        if (rule.appliesTo && rule.appliesTo(operation)) {
            if (rule.validate && !rule.validate(operation, context)) {
                return { allowed: false, rule: name, reason: rule.reason };
            }
        }
    }

    // EVENT: rule checked (security gate)
    _emit('rules:checked', {
        operation,
        allowed: true,
        timestamp: Date.now()
    });

    return { allowed: true };
}

/**
 * Module exports
 */
module.exports = {
    gatherState,
    restoreState,
    RULES_VERSION,
    getRules,
    getRule,
    setRule,
    deleteRule,
    listRules,
    check,

    // Grant ledger (B0, #253): precedence, tombstone revocation, scope
    // isolation, trust floors
    grantLedger,
    revokeGrants,
    getGrants,
    evaluate,

    // Multibrain
    getBrainRulesConfig,
    setBrainRulesConfig,
    getStackRulesConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainRulesConfigs = {};

function getBrainRulesConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainRulesConfigs[brainName] || { strict: false };
}

function setBrainRulesConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainRulesConfigs[brainName] = config;
    return true;
}

function getStackRulesConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainRulesConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}

// ==================== HORCRUX GATHER/RESTORE ====================
function gatherState() {
    return { configs: Object.assign({}, _brainRulesConfigs), count: Object.keys(_brainRulesConfigs).length, gatheredAt: Date.now() };
}
function restoreState(data) {
    if (data && data.configs) Object.assign(_brainRulesConfigs, data.configs);
    return { restored: true, configs: Object.keys(_brainRulesConfigs).length };
}
