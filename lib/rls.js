/**
 * RLS Middleware (v0.8.6)
 * Row-Level Security integration for Vant OS
 *
 * This wraps habitat RLS around Vant operations:
 * - sandbox: capability gates
 * - brain: memory read/write
 * - islands: island loading
 * - storage: file access
 * - escrow: operation approval
 *
 * Usage:
 *   const rls = require('./rls');
 *   rls.init(habitat);
 *
 *   // Then in operations:
 *   rls.checkRead(userCtx, 'brain', 'memory-key');
 *   rls.checkWrite(userCtx, 'island', 'my-island');
 */

let _habitat = null;
let _event = null;
function _getEvent() {
    if (!_event) {
        try { _event = require('./event'); } catch (e) {}
    }
    return _event;
}
function _emit(event, data) {
    const ev = _getEvent();
    if (ev && ev.emit) {
        ev.emit(event, data);
    }
}

/**
 * Initialize RLS with habitat instance
 * Call this once at boot
 */
function init(habitat) {
    _habitat = habitat;
    return rls;
}

/**
 * (pass 82) Auto-claim the shared habitat when no instance was injected.
 * Previously getHabitat() returned null and every checkRead/checkWrite
 * silently returned true whenever boot had not called initRLS() — RLS was
 * "configured" but asleep. With habitat.getShared() (pass 81) there is no
 * reason to stay asleep: claim the singleton and enforce.
 */
function _ensureHabitat() {
    if (_habitat) return _habitat;
    try {
        const habitat = require('./habitat');
        if (habitat.getShared) _habitat = habitat.getShared();
    } catch (e) {
        // Habitat unavailable — checks stay pass-through (documented behavior)
    }
    return _habitat;
}

/**
 * Get current habitat (auto-claims the shared instance when possible)
 */
function getHabitat() {
    return _ensureHabitat();
}

/**
 * Set workspace context
 */
function setWorkspace(workspaceId) {
    if (_habitat) {
        _habitat.setWorkspace(workspaceId);
    }
}

/**
 * Get workspace context
 */
function getWorkspace() {
    if (_habitat) {
        return _habitat.getCurrentWorkspace();
    }
    return 'default';
}

/**
 * Get user context from token
 */
async function context(token) {
    if (!_habitat) {
        return { userId: 'anonymous', roles: [], workspace: 'default' };
    }
    return _habitat.context(token);
}

/**
 * Check if user can READ a resource
 * Throws on denial
 */
async function checkRead(userCtx, resource, operation = 'read') {
    _ensureHabitat();
    if (!_habitat) {
        return true; // No RLS configured (no habitat anywhere)
    }

    // (pass 82) Delegate to the habitat's own throwing check so the denial
    // contract (RLS_DENIED) has ONE source. Events preserved.
    try {
        await _habitat.check(userCtx, resource, 'read');
        _emit('rls:allowed', { resource, operation });
        return true;
    } catch (e) {
        _emit('rls:denied', { resource, operation });
        throw e;
    }
}

/**
 * Check if user can WRITE a resource
 * Throws on denial
 */
async function checkWrite(userCtx, resource, operation = 'write') {
    _ensureHabitat();
    if (!_habitat) {
        return true; // No RLS configured (no habitat anywhere)
    }

    try {
        await _habitat.check(userCtx, resource, 'write');
        return true;
    } catch (e) {
        _emit('rls:denied', { resource, operation });
        throw e;
    }
}

/**
 * (pass 82) Non-throwing allow/deny for CLI/diagnostics. Maps an operation
 * word to a read/write mode and asks the habitat. This was already called
 * by bin/rls.js but never exported — the subcommand could only crash.
 */
async function isOperationAllowed(op, resource, userCtx = {}) {
    _ensureHabitat();
    if (!_habitat) return true;
    const mode = ['write', 'create', 'update', 'delete', 'commit'].includes(op) ? 'write' : 'read';
    return _habitat.can(userCtx, resource, mode);
}

/**
 * Create sandbox capabilities from user context
 * DELEGATED to sandbox.generateCaps - single source of truth
 */
function createSandboxCaps(userCtx, baseCaps = {}) {
    // Delegate to sandbox (single source of truth for caps)
    const sandbox = require('./sandbox');
    return sandbox.generateCaps(userCtx, baseCaps);
}

/**
 * Check brain access
 * Wraps brain.remember() and brain.learn()
 */
async function checkBrain(userCtx, key, mode = 'read') {
    // Brain keys are namespaced by workspace
    const resource = `_brain:${key}`;

    if (mode === 'read') {
        return checkRead(userCtx, resource);
    } else {
        return checkWrite(userCtx, resource);
    }
}

/**
 * Check island access
 * Wraps islands loading
 */
async function checkIsland(userCtx, islandName, mode = 'read') {
    return mode === 'read'
        ? checkRead(userCtx, `_island:${islandName}`)
        : checkWrite(userCtx, `_island:${islandName}`);
}

/**
 * Check storage access
 * Wraps file operations
 */
async function checkStorage(userCtx, path, mode = 'read') {
    // Storage paths are namespaced by container
    const resource = `_storage:${path}`;

    return mode === 'read'
        ? checkRead(userCtx, resource)
        : checkWrite(userCtx, resource);
}

/**
 * Middleware for API handlers
 * Use in express/vanilla routes
 */
function middleware(options = {}) {
    const resource = options.resource || 'api';
    const mode = options.mode || 'read';

    return async (req, res, next) => {
        try {
            const auth = req.headers.authorization;
            // (pass 82) Pass the token (or null for anonymous) — context()
            // was previously called with NO argument, so even valid Bearer
            // tokens always resolved to the anonymous context.
            const token = auth ? auth.replace('Bearer ', '') : null;
            const userCtx = await context(token);

            // Set workspace from header or context
            const workspace = req.headers['x-workspace'] || userCtx.workspace;
            if (workspace) {
                setWorkspace(workspace);
            }

            // Attach user context to request
            req.userCtx = userCtx;

            // Check access
            await (mode === 'read'
                ? checkRead(userCtx, resource)
                : checkWrite(userCtx, resource)
            );

            next();
        } catch (e) {
            if (e.code === 'RLS_DENIED') {
                res.status(403).json({ error: e.message });
            } else {
                next(e);
            }
        }
    };
}

/**
 * Workspace-scoped operations helper
 */
function forWorkspace(workspaceId, fn) {
    const original = getWorkspace();
    try {
        setWorkspace(workspaceId);
        return fn();
    } finally {
        setWorkspace(original);
    }
}

const rls = {
    init,
    getHabitat,
    setWorkspace,
    getWorkspace,
    context,
    checkRead,
    checkWrite,
    createSandboxCaps,
    checkBrain,
    checkIsland,
    checkStorage,
    middleware,
    forWorkspace,
    isOperationAllowed
};

module.exports = rls;
