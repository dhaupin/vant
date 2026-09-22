/**
 * Sudo - AI-first permission system (v0.8.6)
 * WITH EVENT EMISSIONS - escalation emits globally
 *
 * NOT user-based. Task-based, context-aware, auto-scaling.
 *
 * SCOPES (like OAuth):
 * - read: brain/file read
 * - write: brain/file write
 * - exec: shell commands
 * - network: HTTP requests
 * - spawn: create agents
 *
 * CONCEPTS:
 * - Tasks: What agent is working on
 * - Auto-scale: Permissions grow with task
 * - Least-ask: Prompt for new permissions
 * - Context-aware: Track usage, suggest
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

const fs = require('fs');
const path = require('path');
const errors = require('./error');

// Task state
let _tasks = new Map();        // taskId -> { scopes, history, escalated }
let _callbacks = new Map();     // pending escalations
let _locked = false;

// ==================== ESCALATION WHITELIST (prd-sudo.md §3) ====================
// Per-service policies define what scopes a service may request, how long an
// escalation may live (maxTTL), whether it is auto-approved or needs a user
// callback, and whether expiring grants are revalidated or revoked.
const ESCALATION_WHITELIST = {
    boot: {
        allowedScopes: ['write', 'network', 'spawn', 'exec'],
        maxTTL: 300000,           // 5 minutes
        autoApprove: ['write', 'network'],
        requiresCallback: ['exec', 'spawn'],
        revalidate: true
    },
    network: {
        allowedScopes: ['network'],
        maxTTL: 600000,           // 10 minutes
        autoApprove: ['network'],
        requiresCallback: [],
        revalidate: true
    },
    storage: {
        allowedScopes: ['write'],
        maxTTL: 300000,           // 5 minutes
        autoApprove: ['write'],
        requiresCallback: [],
        revalidate: true
    },
    mcp: {
        allowedScopes: ['read', 'write', 'network', 'exec'],
        maxTTL: 180000,           // 3 minutes
        autoApprove: ['read'],
        requiresCallback: ['write', 'network', 'exec'],
        revalidate: false
    },
    agents: {
        allowedScopes: ['spawn', 'write'],
        maxTTL: 300000,           // 5 minutes
        autoApprove: [],
        requiresCallback: ['spawn', 'write'],
        revalidate: false
    },
    trust: {
        allowedScopes: ['write'],
        maxTTL: 300000,           // 5 minutes
        autoApprove: ['write'],
        requiresCallback: [],
        revalidate: false
    },
    default: {
        allowedScopes: [],
        maxTTL: 60000,            // 1 minute
        autoApprove: [],
        requiresCallback: [],
        revalidate: false
    }
};

// TTL-granted scopes: taskId -> Map(scope -> { service, expiresAt, auto, revalidations })
let _grants = new Map();

// (prd-sudo: metrics) shared registry instrumentation — lazy accessor so
// module load order is untouched. Never throws into sudo paths.
let _metrics = null;
function _m() {
    try { if (!_metrics) _metrics = require('./metrics'); return _metrics; }
    catch (e) { return null; }
}
function _gaugeActive() {
    const m = _m(); if (!m) return;
    let n = 0;
    for (const grants of _grants.values()) n += grants.size;
    m.setGauge('vant_sudo_grants_active', n, { layer: 'sudo' });
}

// ==================== PERSISTENT ESCALATION AUDIT LOG (prd-sudo.md) ====================
// Every escalation decision (requested/granted/denied/revalidated) is appended
// to a JSONL file under models/private/ so the trail survives process exit.
// Routed through FileStorage for vaf containment; append semantics =
// read-modify-write to keep the atomic-write contract.
const _AUDIT_REL = 'models/private/sudo/escalations.jsonl';
const AUDIT_MAX_ENTRIES = parseInt(process.env.VANT_SUDO_AUDIT_MAX || '2000', 10);

function _appendAuditLog(entry) {
    try {
        const Storage = require('./storage');
        if (typeof Storage.FileStorage !== 'function') return;
        const store = new Storage.FileStorage({ basePath: path.resolve(__dirname, '..') });
        const existing = store.read(_AUDIT_REL);
        let lines = existing ? existing.split('\n').filter(l => l.trim()) : [];
        lines.push(JSON.stringify(entry));
        if (lines.length > AUDIT_MAX_ENTRIES) {
            lines = lines.slice(lines.length - AUDIT_MAX_ENTRIES); // keep newest
        }
        store.write(_AUDIT_REL, lines.join('\n') + '\n');
    } catch (e) {
        // Audit persistence must never break the escalation path itself.
        // The event-bus emit above still fires; this is best-effort disk.
    }
}

function getEscalationAuditLog(limit = 100) {
    try {
        const Storage = require('./storage');
        const store = new Storage.FileStorage({ basePath: path.resolve(__dirname, '..') });
        const raw = store.read(_AUDIT_REL);
        if (!raw) return [];
        const lines = raw.split('\n').filter(l => l.trim());
        return lines.slice(Math.max(0, lines.length - limit)).map(l => {
            try { return JSON.parse(l); } catch (e) { return { raw: l, parseError: true }; }
        });
    } catch (e) {
        return [];
    }
}

// ==================== PER-ESCALATION RATE LIMITING (prd-sudo.md) ====================
// Cap how often the same task+scope+service may escalate within a window.
// Prevents brute-forcing the auto-approve paths. Env-tunable, off beyond
// default caps.
const RATE_WINDOW_MS = parseInt(process.env.VANT_SUDO_RATE_WINDOW_MS || '60000', 10);
const RATE_MAX_PER_WINDOW = parseInt(process.env.VANT_SUDO_RATE_MAX || '20', 10);
const _rateCounts = new Map(); // key -> [timestamps]

function _rateLimitKey(taskId, scope, service) {
    return `${taskId}|${scope}|${service}`;
}

function _checkEscalationRate(taskId, scope, service) {
    const key = _rateLimitKey(taskId, scope, service);
    const now = Date.now();
    const hits = (_rateCounts.get(key) || []).filter(t => now - t < RATE_WINDOW_MS);
    if (hits.length >= RATE_MAX_PER_WINDOW) {
        _rateCounts.set(key, hits);
        return { allowed: false, reason: `rate_limited: ${hits.length} escalations in ${RATE_WINDOW_MS}ms` };
    }
    hits.push(now);
    _rateCounts.set(key, hits);
    return { allowed: true };
}

// ==================== ESCALATION TEMPLATES (prd-sudo.md) ====================
// Named, reusable escalation bundles for common workflows. A template pins
// service+scope+ttl(+reason) and is applied via escalate() so the whitelist,
// rate limiter, and audit log still govern every grant — templates are sugar,
// never a bypass. Persistence routes through FileStorage (vaf-contained).
const TEMPLATES_REL = process.env.VANT_SUDO_TEMPLATES_PATH || 'models/private/sudo/templates.json';
const TEMPLATE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

function _sudoStore() {
    const Storage = require('./storage');
    return new Storage.FileStorage({ basePath: path.resolve(__dirname, '..') });
}

function _loadTemplates() {
    try {
        const store = _sudoStore();
        if (!store.has(TEMPLATES_REL)) return {};
        const data = store.readJson(TEMPLATES_REL);
        return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
    } catch (e) {
        return {}; // unreadable store must never break escalation paths
    }
}

function _saveTemplates(templates) {
    _sudoStore().writeJson(TEMPLATES_REL, templates);
}

/**
 * Define (or redefine) an escalation template.
 * spec: { service, scope, ttl?, reason?, description? }
 */
function defineTemplate(name, spec) {
    if (typeof name !== 'string' || !TEMPLATE_NAME_RE.test(name)) {
        throw new errors.Error('Invalid template name', {
            code: errors.CODES.INPUT_VALIDATION_FAILED,
            statusCode: 400,
            details: { name, pattern: TEMPLATE_NAME_RE.source }
        });
    }
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
        throw new errors.Error('Template spec must be an object', {
            code: errors.CODES.INPUT_VALIDATION_FAILED, statusCode: 400
        });
    }
    const { service, scope, ttl, reason, description } = spec;
    if (typeof service !== 'string' || !service.trim()) {
        throw new errors.Error('Template requires a service', {
            code: errors.CODES.INPUT_VALIDATION_FAILED, statusCode: 400
        });
    }
    if (typeof scope !== 'string' || !ALL_SCOPES.has(scope)) {
        throw new errors.Error(`Template scope must be one of: ${[...ALL_SCOPES].join(', ')}`, {
            code: errors.CODES.INPUT_VALIDATION_FAILED, statusCode: 400
        });
    }
    if (ttl !== undefined && (typeof ttl !== 'number' || !Number.isFinite(ttl) || ttl <= 0)) {
        throw new errors.Error('Template ttl must be a positive number (ms)', {
            code: errors.CODES.INPUT_VALIDATION_FAILED, statusCode: 400
        });
    }
    // Normalize ttl against the CURRENT effective policy so the stored value
    // is what will actually be granted; escalate() still clamps at apply time.
    const policy = ESCALATION_WHITELIST[service] || ESCALATION_WHITELIST.default;
    const effectiveTtl = Math.min(ttl || policy.maxTTL, policy.maxTTL);

    const template = {
        name,
        service: service.trim(),
        scope,
        ttl: effectiveTtl,
        reason: typeof reason === 'string' ? reason : '',
        description: typeof description === 'string' ? description : '',
        created: Date.now()
    };
    const templates = _loadTemplates();
    templates[name] = template;
    _saveTemplates(templates);
    _appendAuditLog({ time: Date.now(), kind: 'template_define', name, service: template.service, scope, ttl: effectiveTtl });
    _emit('sudo:template_defined', { name, service: template.service, scope });
    return template;
}

function getTemplate(name) {
    return _loadTemplates()[name] || null;
}

function listTemplates() {
    return Object.values(_loadTemplates()).sort((a, b) => a.name.localeCompare(b.name));
}

function deleteTemplate(name) {
    const templates = _loadTemplates();
    if (!templates[name]) return { deleted: false, error: 'not found' };
    delete templates[name];
    _saveTemplates(templates);
    _appendAuditLog({ time: Date.now(), kind: 'template_delete', name });
    _emit('sudo:template_deleted', { name });
    return { deleted: true };
}

/**
 * Apply a template: routes through escalate() with the template's pinned
 * service/scope/ttl — whitelist, rate limits, and audit apply as normal.
 */
async function applyTemplate(name, taskId, options = {}) {
    const template = _loadTemplates()[name];
    if (!template) {
        throw new errors.Error(`Template not found: ${name}`, {
            code: errors.CODES.NOT_FOUND, statusCode: 404
        });
    }
    return escalate(taskId, template.scope, {
        ...options,
        service: template.service,
        ttl: template.ttl,
        reason: options.reason || template.reason || `template:${name}`
    });
}

// ==================== POLICIES AS CODE (prd-sudo.md) ====================
// Optional, version-controlled policy overrides loaded from a JSON file
// (default models/private/sudo/policies.json, VANT_SUDO_POLICIES_PATH to
// override). Security invariant: overrides may only TIGHTEN the effective
// whitelist — scopes / auto-approve entries / callback requirements may be
// removed or added-as-stricter, TTLs lowered, revalidation forced on — never
// the reverse. An invalid or widening file is refused WHOLE (no partial
// application, no silent fallback).
const POLICIES_REL = process.env.VANT_SUDO_POLICIES_PATH || 'models/private/sudo/policies.json';
const POLICY_FIELDS = new Set(['allowedScopes', 'autoApprove', 'requiresCallback', 'maxTTL', 'revalidate']);

// Snapshot of the built-in whitelist so resetPolicies() can restore exactly
// what shipped (deep-copied at module load, before any file could override).
const _BUILTIN_WHITELIST = JSON.parse(JSON.stringify(ESCALATION_WHITELIST));

let _policiesApplied = false;
let _policiesSource = null;

function _resolvePoliciesPath() {
    // Keep the file inside the repo root (containment; same spirit as vaf).
    const root = path.resolve(__dirname, '..');
    const resolved = path.resolve(root, POLICIES_REL);
    const rel = path.relative(root, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new errors.Error('Policies path escapes repo root', {
            code: errors.CODES.PERMISSION_DENIED, statusCode: 403,
            details: { path: POLICIES_REL }
        });
    }
    return resolved;
}

function _readPoliciesFile() {
    const root = path.resolve(__dirname, '..');
    const store = _sudoStore();
    const rel = path.relative(root, _resolvePoliciesPath());
    if (!store.has(rel)) return null;
    const data = store.readJson(rel);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new errors.Error('Policies file must be a JSON object of service entries', {
            code: errors.CODES.INPUT_VALIDATION_FAILED, statusCode: 400
        });
    }
    return data;
}

/**
 * Validate a policies file against the CURRENT effective whitelist and return
 * the planned changes. Throws on ANY violation (whole-file refusal).
 * Layered tightening: each load validates against the current effective
 * policy, so a later file can never undo an earlier tightening.
 */
function _planPolicies(file) {
    const changes = [];
    for (const [service, patch] of Object.entries(file)) {
        const current = ESCALATION_WHITELIST[service];
        if (!current) {
            throw new errors.Error(`Policies: unknown service '${service}' (adding services is not allowed)`, {
                code: errors.CODES.PERMISSION_DENIED, statusCode: 403
            });
        }
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
            throw new errors.Error(`Policies: '${service}' entry must be an object`, {
                code: errors.CODES.INPUT_VALIDATION_FAILED, statusCode: 400
            });
        }
        for (const key of Object.keys(patch)) {
            if (!POLICY_FIELDS.has(key)) {
                throw new errors.Error(`Policies: unknown field '${key}' on '${service}' (typo?)`, {
                    code: errors.CODES.INPUT_VALIDATION_FAILED, statusCode: 400
                });
            }
        }
        const plan = { service, from: { ...current, allowedScopes: [...current.allowedScopes], autoApprove: [...current.autoApprove], requiresCallback: [...current.requiresCallback] } };

        // allowedScopes: may only narrow the current set
        if (patch.allowedScopes !== undefined) {
            if (!Array.isArray(patch.allowedScopes)) {
                throw new errors.Error(`Policies: allowedScopes on '${service}' must be an array`, {
                    code: errors.CODES.INPUT_VALIDATION_FAILED, statusCode: 400
                });
            }
            for (const s of patch.allowedScopes) {
                if (!current.allowedScopes.includes(s)) {
                    throw new errors.Error(`Policies: cannot add scope '${s}' to '${service}' (not currently allowed)`, {
                        code: errors.CODES.PERMISSION_DENIED, statusCode: 403
                    });
                }
            }
            plan.allowedScopes = [...new Set(patch.allowedScopes)];
        }
        const effAllowed = plan.allowedScopes || current.allowedScopes;

        // autoApprove: may only remove; entries must stay within effective scopes
        if (patch.autoApprove !== undefined) {
            if (!Array.isArray(patch.autoApprove)) {
                throw new errors.Error(`Policies: autoApprove on '${service}' must be an array`, {
                    code: errors.CODES.INPUT_VALIDATION_FAILED, statusCode: 400
                });
            }
            for (const s of patch.autoApprove) {
                if (!current.autoApprove.includes(s)) {
                    throw new errors.Error(`Policies: cannot auto-approve '${s}' on '${service}' (not currently auto-approved)`, {
                        code: errors.CODES.PERMISSION_DENIED, statusCode: 403
                    });
                }
                if (!effAllowed.includes(s)) {
                    throw new errors.Error(`Policies: autoApprove '${s}' on '${service}' is outside effective allowedScopes`, {
                        code: errors.CODES.INPUT_VALIDATION_FAILED, statusCode: 400
                    });
                }
            }
            plan.autoApprove = [...new Set(patch.autoApprove)];
        }

        // requiresCallback: may only add (stricter); must keep every current
        // callback requirement that survives in the effective scope set.
        if (patch.requiresCallback !== undefined) {
            if (!Array.isArray(patch.requiresCallback)) {
                throw new errors.Error(`Policies: requiresCallback on '${service}' must be an array`, {
                    code: errors.CODES.INPUT_VALIDATION_FAILED, statusCode: 400
                });
            }
            for (const s of patch.requiresCallback) {
                if (!effAllowed.includes(s)) {
                    throw new errors.Error(`Policies: requiresCallback '${s}' on '${service}' is outside effective allowedScopes`, {
                        code: errors.CODES.INPUT_VALIDATION_FAILED, statusCode: 400
                    });
                }
            }
            const mustKeep = current.requiresCallback.filter(s => effAllowed.includes(s));
            for (const s of mustKeep) {
                if (!patch.requiresCallback.includes(s)) {
                    throw new errors.Error(`Policies: cannot remove callback requirement for '${s}' on '${service}'`, {
                        code: errors.CODES.PERMISSION_DENIED, statusCode: 403
                    });
                }
            }
            plan.requiresCallback = [...new Set(patch.requiresCallback)];
        }

        // maxTTL: may only lower
        if (patch.maxTTL !== undefined) {
            if (typeof patch.maxTTL !== 'number' || !Number.isFinite(patch.maxTTL) || patch.maxTTL <= 0) {
                throw new errors.Error(`Policies: maxTTL on '${service}' must be a positive number`, {
                    code: errors.CODES.INPUT_VALIDATION_FAILED, statusCode: 400
                });
            }
            if (patch.maxTTL > current.maxTTL) {
                throw new errors.Error(`Policies: cannot raise maxTTL on '${service}' (${patch.maxTTL} > ${current.maxTTL})`, {
                    code: errors.CODES.PERMISSION_DENIED, statusCode: 403
                });
            }
            plan.maxTTL = patch.maxTTL;
        }

        // revalidate: forcing ON is stricter (allowed); turning OFF is not
        if (patch.revalidate !== undefined) {
            if (typeof patch.revalidate !== 'boolean') {
                throw new errors.Error(`Policies: revalidate on '${service}' must be a boolean`, {
                    code: errors.CODES.INPUT_VALIDATION_FAILED, statusCode: 400
                });
            }
            if (current.revalidate === true && patch.revalidate === false) {
                throw new errors.Error(`Policies: cannot disable revalidation on '${service}'`, {
                    code: errors.CODES.PERMISSION_DENIED, statusCode: 403
                });
            }
            plan.revalidate = patch.revalidate;
        }

        changes.push(plan);
    }
    return changes;
}

/**
 * Load policies-as-code from disk. Missing file = no-op (policies-as-code is
 * optional). Invalid/widening file throws WITHOUT mutating anything.
 */
function loadPolicies(options = {}) {
    const file = _readPoliciesFile();
    if (!file) return { applied: false, source: null, reason: 'no policies file' };
    const source = options.source || POLICIES_REL;
    const changes = _planPolicies(file); // validates whole file first

    for (const plan of changes) {
        const policy = ESCALATION_WHITELIST[plan.service];
        if (plan.allowedScopes) policy.allowedScopes = plan.allowedScopes;
        if (plan.autoApprove) policy.autoApprove = plan.autoApprove;
        if (plan.requiresCallback) policy.requiresCallback = plan.requiresCallback;
        if (plan.maxTTL !== undefined) policy.maxTTL = plan.maxTTL;
        if (plan.revalidate !== undefined) policy.revalidate = plan.revalidate;
    }
    _policiesApplied = true;
    _policiesSource = source;
    const record = { time: Date.now(), kind: 'policies_load', source, services: changes.map(c => c.service) };
    _appendAuditLog(record);
    _emit('sudo:policies_loaded', { source, services: record.services });
    return { applied: true, source, changes: changes.length, services: record.services };
}

/** Restore the shipped whitelist (undoes every override). */
function resetPolicies() {
    for (const [service, policy] of Object.entries(_BUILTIN_WHITELIST)) {
        ESCALATION_WHITELIST[service] = JSON.parse(JSON.stringify(policy));
    }
    _policiesApplied = false;
    _policiesSource = null;
    _appendAuditLog({ time: Date.now(), kind: 'policies_reset' });
    return { reset: true };
}

function getPoliciesStatus() {
    return {
        applied: _policiesApplied,
        source: _policiesSource,
        file: POLICIES_REL,
        services: JSON.parse(JSON.stringify(ESCALATION_WHITELIST))
    };
}

// Resolve the task context escalations should attach to: an explicit taskId
// wins; otherwise the boot task (sandbox.can checks that same task); otherwise
// 'default'.
function _resolveBootTaskId(explicit) {
    if (explicit) return explicit;
    try {
        const boot = require('./boot');
        const st = boot.getBootState && boot.getBootState();
        if (st && st.taskId) return st.taskId;
    } catch (e) { /* boot unavailable */ }
    return 'default';
}

// Revalidation loop handle
let _revalidateTimer = null;
// Revalidation cadence (P3: tunable via env, follows the VANT_* convention)
const REVALIDATE_INTERVAL_MS = parseInt(process.env.VANT_SUDO_REVALIDATE_INTERVAL_MS || '30000', 10);

// DEFAULT SCOPES (minimal)
const DEFAULT_SCOPES = new Set(['read']);

// ALL AVAILABLE SCOPES
const ALL_SCOPES = new Set([
    'read',      // brain/file read
    'write',     // brain/file write
    'exec',     // shell exec
    'network',  // HTTP requests
    'spawn',    // create agents
    'sudo',     // grant permissions
    'admin'     // full access
]);

/**
 * Create new task context
 */
function createTask(taskId, scopes = DEFAULT_SCOPES) {
    if (_locked) throw new errors.Error('ELOCKED', { code: errors.CODES.ELOCKED, retryable: true });

    const task = {
        id: taskId,
        scopes: new Set(typeof scopes === 'string' ? [scopes] : scopes),
        level: calculateLevel(scopes),
        history: [],       // what was used
        escalated: [],    // escalations made
        created: Date.now()
    };

    _tasks.set(taskId, task);
    _log(taskId, 'create', { scopes: Array.from(task.scopes) });

    return { task: taskId, scopes: Array.from(task.scopes) };
}

/**
 * Get task state
 */
function getTask(taskId) {
    return _tasks.get(taskId) || null;
}

/**
 * Check if task can do action
 * Honors static scopes, admin, and unexpired TTL escalation grants.
 */
function can(taskId, scope) {
    const task = _tasks.get(taskId);
    if (!task) return false;

    // Check scope
    if (task.scopes.has(scope)) return true;
    if (task.scopes.has('admin')) return true;

    // Check unexpired TTL escalation grants (prd-sudo.md §5)
    const grants = _grants.get(taskId);
    if (grants && grants.has(scope)) {
        const g = grants.get(scope);
        if (g.expiresAt > Date.now()) return true;
        // Expired - lazy revoke; the revalidation loop handles the rest
        grants.delete(scope);
    }

    return false;
}

/**
 * Grant scope to task (auto-scale)
 */
function grant(taskId, scope) {
    if (_locked) throw new errors.Error('ELOCKED', { code: errors.CODES.ELOCKED, retryable: true });

    let task = _tasks.get(taskId);
    if (!task) {
        task = { id: taskId, scopes: new Set(), history: [], escalated: [], created: Date.now() };
        _tasks.set(taskId, task);
    }

    task.scopes.add(scope);
    task.level = calculateLevel(task.scopes);
    _log(taskId, 'grant', { scope });

    // Process pending escalations
    if (_callbacks.has(taskId)) {
        const cb = _callbacks.get(taskId);
        cb(null, { granted: scope });
        _callbacks.delete(taskId);
    }

    return { task: taskId, granted: scope };
}

/**
 * Revoke scope from task
 */
function revoke(taskId, scope) {
    if (_locked) throw new errors.Error('ELOCKED', { code: errors.CODES.ELOCKED, retryable: true });

    const task = _tasks.get(taskId);
    if (!task) return { error: 'not found' };

    task.scopes.delete(scope);
    // (3b companion) revoke also clears TTL grants for the scope — otherwise
    // an auto-approved escalation stays valid until expiry regardless of
    // revoke, and escalate() short-circuits on can() forever.
    const grants = _grants.get(taskId);
    if (grants) grants.delete(scope);
    task.level = calculateLevel(task.scopes);
    _log(taskId, 'revoke', { scope });
    const _mr = _m(); if (_mr) _gaugeActive();

    return { task: taskId, revoked: scope };
}

/**
 * Request escalation (prd-sudo.md §4/§5)
 *
 * Flow: whitelist check → auto-approve | callback | pending
 * All grants are time-bounded (TTL capped by policy maxTTL).
 *
 * @param {string} taskId - Task requesting escalation
 * @param {string} scope - Scope requested
 * @param {Object} options - { service, reason, ttl, autoGrant, callback }
 * @returns {Object} { granted, expiresAt, auto? } | { pending } | { denied, reason }
 */
async function escalate(taskId, scope, options = {}) {
    const service = options.service || 'default';
    const policy = ESCALATION_WHITELIST[service] || ESCALATION_WHITELIST.default;
    // Resolve to the process-wide boot task unless explicitly named, so grants
    // line up with what sandbox.can(agentId) checks (prd-sudo.md: can(cap) →
    // sudo.can()). Falls back to 'default' when boot hasn't run.
    taskId = options.taskId || _resolveBootTaskId(taskId);
    const task = _tasks.get(taskId);

    // Already have permission (static scope or unexpired grant)
    if (can(taskId, scope)) {
        return { granted: scope };
    }

    // Force grant (admin only) - bypasses whitelist, no TTL
    if (options.autoGrant) {
        grant(taskId, scope);
        return { granted: scope };
    }

    const auditEntry = {
        time: Date.now(),
        kind: 'escalation',
        taskId, scope, service,
        reason: options.reason || null,
        outcome: null // filled below: granted | denied | pending
    };

    _emit('sudo:escalation_requested', {
        taskId, scope, service,
        ttl: options.ttl || policy.maxTTL,
        policy: policy.allowedScopes
    });
    const _mm = _m();
    if (_mm) {
        _mm.inc('vant_sudo_escalations_total', { outcome: 'requested' });
        var _escTimer = _mm.startTimer('vant_sudo_escalation_duration_ms', {});
    }

    // (3b) Per-escalation rate limit: same task+scope+service may only
    // escalate RATE_MAX_PER_WINDOW times per window (auto-approve brute-force
    // guard). Not applied to already-authorized no-op requests above.
    const rate = _checkEscalationRate(taskId, scope, service);
    if (!rate.allowed) {
        auditEntry.outcome = 'denied';
        auditEntry.deniedReason = rate.reason;
        _appendAuditLog(auditEntry);
        _emit('sudo:escalation_denied', { taskId, scope, service, reason: rate.reason });
        const _mm = _m(); if (_mm) _mm.inc('vant_sudo_escalations_total', { outcome: 'denied', reason: 'rate_limited' });
        return { denied: scope, reason: rate.reason };
    }

    // Whitelist: service must be allowed to request this scope
    if (!policy.allowedScopes.includes(scope)) {
        auditEntry.outcome = 'denied';
        auditEntry.deniedReason = 'not_in_whitelist';
        _appendAuditLog(auditEntry);
        _emit('sudo:escalation_denied', { taskId, scope, service, reason: 'not_in_whitelist' });
        const _mm = _m(); if (_mm) _mm.inc('vant_sudo_escalations_total', { outcome: 'denied', reason: 'not_in_whitelist' });
        return { denied: scope, reason: 'not_in_whitelist' };
    }

    // TTL capped by policy
    const ttl = Math.min(options.ttl || policy.maxTTL, policy.maxTTL);
    const expiresAt = Date.now() + ttl;

    const finishGrant = (auto) => {
        // Record ONLY a TTL grant - not a static scope - so expiry is exact
        // (no 30s revoke window) and can() is purely time-bounded.
        if (!_grants.has(taskId)) _grants.set(taskId, new Map());
        _grants.get(taskId).set(scope, { service, expiresAt, auto, revalidations: 0 });
        auditEntry.outcome = 'granted';
        auditEntry.auto = auto;
        auditEntry.expiresAt = expiresAt;
        _appendAuditLog(auditEntry);
        _emit('sudo:escalation_granted', { taskId, scope, service, ttl, auto, expiresAt });
        if (typeof _escTimer === 'function') _escTimer();
        const _mg = _m(); if (_mg) {
            _mg.inc('vant_sudo_escalations_total', { outcome: 'granted', service });
            _gaugeActive();
        }
        return auto ? { granted: scope, expiresAt, auto: true } : { granted: scope, expiresAt };
    };

    // Auto-approve path
    if (policy.autoApprove.includes(scope)) {
        return finishGrant(true);
    }

    // Callback path
    if (policy.requiresCallback.includes(scope)) {
        if (typeof options.callback === 'function') {
            const approved = await new Promise(resolve => {
                options.callback(
                    { task: taskId, scope, service, reason: options.reason || '', time: Date.now() },
                    resolve
                );
            });
            if (approved) {
                return finishGrant(false);
            }
            auditEntry.outcome = 'denied';
            auditEntry.deniedReason = 'callback_denied';
            _appendAuditLog(auditEntry);
            _emit('sudo:escalation_denied', { taskId, scope, service, reason: 'callback_denied' });
            return { denied: scope, reason: 'callback_denied' };
        }
        auditEntry.outcome = 'denied';
        auditEntry.deniedReason = 'callback_required';
        _appendAuditLog(auditEntry);
        _emit('sudo:escalation_denied', { taskId, scope, service, reason: 'callback_required' });
        return { denied: scope, reason: 'callback_required' };
    }

    // Queue pending (neither auto-approve nor callback-required)
    auditEntry.outcome = 'pending';
    _appendAuditLog(auditEntry);
    if (task) {
        task.escalated.push({ task: taskId, scope, service, reason: options.reason || '', time: Date.now() });
    }
    return { pending: scope, expiresAt };
}

/**
 * Manual revalidation check - extend an unexpired/expired grant if the
 * service policy allows revalidation (prd-sudo.md §4)
 */
function revalidateEscalation(taskId, scope) {
    const grants = _grants.get(taskId);
    if (!grants || !grants.has(scope)) return { revalidated: false, reason: 'no_grant' };

    const g = grants.get(scope);
    const policy = ESCALATION_WHITELIST[g.service] || ESCALATION_WHITELIST.default;
    if (!policy.revalidate) return { revalidated: false, reason: 'not_revalidatable' };

    g.expiresAt = Date.now() + policy.maxTTL;
    g.revalidations++;
    _emit('sudo:escalation_revalidated', {
        taskId, scope, service: g.service,
        newExpiresAt: g.expiresAt, revalidationCount: g.revalidations
    });
    const _me = _m(); if (_me) _me.inc('vant_sudo_revalidations_total', { outcome: 'extended' });
    return { revalidated: true, expiresAt: g.expiresAt };
}

/**
 * Background revalidation loop (default 30s, prd-sudo.md §5):
 * - revalidate: true services → extend expiresAt
 * - revalidate: false services → revoke the grant (and the static scope it added)
 */
function startRevalidationLoop(intervalMs = REVALIDATE_INTERVAL_MS) {
    if (_revalidateTimer) return { running: true, intervalMs };

    // v0.9.0-axolotl: registered with boot's timer lifecycle (was bare setInterval)
    const _bootMod = (() => { try { return require('./boot'); } catch (e) { return null; } })();
    const _revalidateTick = () => {
        const now = Date.now();
        for (const [taskId, grants] of _grants) {
            for (const [scope, g] of grants) {
                if (g.expiresAt > now) continue;

                const policy = ESCALATION_WHITELIST[g.service] || ESCALATION_WHITELIST.default;
                if (g.auto && policy.revalidate) {
                    g.expiresAt = now + policy.maxTTL;
                    g.revalidations++;
                    _emit('sudo:escalation_revalidated', {
                        taskId, scope, service: g.service,
                        newExpiresAt: g.expiresAt, revalidationCount: g.revalidations
                    });
                    const _mt = _m(); if (_mt) _mt.inc('vant_sudo_revalidations_total', { outcome: 'extended' });
                } else {
                    grants.delete(scope);
                    _emit('sudo:escalation_expired', { taskId, scope, service: g.service });
                    const _mt = _m(); if (_mt) {
                        _mt.inc('vant_sudo_revalidations_total', { outcome: 'expired' });
                        _gaugeActive();
                    }
                }
            }
        }
    };
    if (_bootMod && _bootMod.registerTimer) {
        _bootMod.registerTimer('sudo.revalidate', _revalidateTick, intervalMs, { unref: true });
        _revalidateTimer = true; // handled by boot registry
    } else {
        _revalidateTimer = setInterval(_revalidateTick, intervalMs);
        // Never keep the process alive just for the loop
        if (_revalidateTimer.unref) _revalidateTimer.unref();
    }
    return { running: true, intervalMs };
}

function stopRevalidationLoop() {
    if (_revalidateTimer) {
        // v0.9.0-axolotl: timer lives in boot's registry when available
        const _bootMod = (() => { try { return require('./boot'); } catch (e) { return null; } })();
        if (_bootMod && _bootMod.unregisterTimer) _bootMod.unregisterTimer('sudo.revalidate');
        else if (typeof _revalidateTimer === 'object' && _revalidateTimer) clearInterval(_revalidateTimer);
        _revalidateTimer = null;
    }
    return { running: false };
}

/**
 * Get TTL grants for a task (inspection/testing)
 */
function getGrants(taskId) {
    const grants = _grants.get(taskId);
    if (!grants) return {};
    const out = {};
    for (const [scope, g] of grants) out[scope] = { ...g };
    return out;
}

/**
 * Calculate permission level (0-10)
 */
function calculateLevel(scopes) {
    let level = 0;
    const scopeArray = scopes instanceof Set ? Array.from(scopes) : scopes;

    if (scopeArray.includes('admin')) level = 10;
    else if (scopeArray.includes('sudo')) level = 8;
    else if (scopeArray.includes('spawn')) level = 7;
    else if (scopeArray.includes('exec')) level = 6;
    else if (scopeArray.includes('network')) level = 5;
    else if (scopeArray.includes('write')) level = 3;
    else if (scopeArray.includes('read')) level = 1;

    return level;
}

/**
 * Get available scopes
 */
function getScopes() {
    return Array.from(ALL_SCOPES);
}

/**
 * List tasks
 */
function listTasks() {
    return { tasks: Array.from(_tasks.keys()).map(id => ({
        id,
        scopes: Array.from(_tasks.get(id).scopes),
        level: _tasks.get(id).level,
        history: _tasks.get(id).history.length
    })) };
}

/**
 * Log action
 */
function _log(taskId, action, data) {
    const task = _tasks.get(taskId);
    if (task) {
        task.history.push({ action, data, time: Date.now() });
        if (task.history.length > 100) task.history.shift();
    }
}

/**
 * Track usage (context-aware)
 */
function used(taskId, action) {
    const task = _tasks.get(taskId);
    if (task) {
        task.history.push({ action, time: Date.now() });
    }
}

/**
 * Suggest based on history
 */
function suggest(taskId) {
    const task = _tasks.get(taskId);
    if (!task) return { suggestions: [] };

    const history = task.history;
    const counts = {};

    history.forEach(h => {
        const action = h.action || h.data?.scope || 'unknown';
        counts[action] = (counts[action] || 0) + 1;
    });

    // Suggest scopes based on usage
    const suggestions = [];
    if (counts['shell.exec'] > 5) suggestions.push({ scope: 'exec', reason: 'frequently executes shell' });
    if (counts['network.fetch'] > 3) suggestions.push({ scope: 'network', reason: 'frequently makes HTTP requests' });
    if (counts['brain.write'] > 2) suggestions.push({ scope: 'write', reason: 'frequently writes to brain' });

    return { task: taskId, suggestions };
}

/**
 * Lock sudo
 */
function lock() {
    _locked = true;
    return { locked: true };
}

/**
 * Unlock sudo
 */
function unlock() {
    _locked = false;
    return { unlocked: true };
}

/**
 * Is locked
 */
function isLocked() {
    return _locked;
}

/**
 * Delete task
 */
function deleteTask(taskId) {
    _tasks.delete(taskId);
    _callbacks.delete(taskId);
    return { deleted: taskId };
}

/**
 * Clear all
 */
function reset() {
    _tasks = new Map();
    _grants = new Map();
    _callbacks = new Map();
    _rateCounts.clear();
    _locked = false;
    const _mx = _m(); if (_mx) _mx.setGauge('vant_sudo_grants_active', 0, { layer: 'sudo' });
    return { reset: true };
}

/** (prd-sudo: metrics) Aggregated sudo metrics: registry snapshot + live
 * grant count per task/service. In-process by design. */
function getSudoMetrics() {
    const m = _m();
    let grantsActive = 0;
    const byTask = {};
    for (const [tid, grants] of _grants) {
        grantsActive += grants.size;
        byTask[tid] = grants.size;
    }
    const byService = {};
    for (const [, grants] of _grants) {
        for (const [, g] of grants) byService[g.service] = (byService[g.service] || 0) + 1;
    }
    return {
        grantsActive,
        byTask,
        byService,
        registry: m ? m.snapshot() : { counters: [], gauges: [], histograms: [] }
    };
}

module.exports = {
    getSudoMetrics,
    createTask,
    getTask,
    can,
    grant,
    revoke,
    escalate,
    calculateLevel,
    getScopes,
    listTasks,
    used,
    suggest,
    lock,
    unlock,
    isLocked,
    deleteTask,
    reset,
    // Whitelist-governed escalation (prd-sudo.md)
    ESCALATION_WHITELIST,
    revalidateEscalation,
    startRevalidationLoop,
    stopRevalidationLoop,
    getGrants,
    // Persistent escalation audit + rate limiting (prd-sudo.md)
    getEscalationAuditLog,
    // Escalation templates (prd-sudo.md)
    defineTemplate,
    getTemplate,
    listTemplates,
    deleteTemplate,
    applyTemplate,
    // Policies as code (prd-sudo.md)
    loadPolicies,
    resetPolicies,
    getPoliciesStatus,
    getLayerStatus: () => ({ name: 'Sudo', type: 'sudo', version: require('./version'), enabled: true }),

    // Multibrain
    getBrainSudoConfig,
    setBrainSudoConfig,
    getStackSudoConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainSudoConfigs = {};

function getBrainSudoConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainSudoConfigs[brainName] || { timeout: 300000 };
}

function setBrainSudoConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainSudoConfigs[brainName] = config;
    return true;
}

function getStackSudoConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainSudoConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}
