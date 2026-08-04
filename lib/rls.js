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
 * Get current habitat
 */
function getHabitat() {
    return _habitat;
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
    if (!_habitat) {
        return true; // No RLS configured
    }
    
    const allowed = await _habitat.can(userCtx, resource, 'read');
    
    if (allowed) _emit('rls:allowed', { resource, operation });
    if (!allowed) {
        const error = require('./error');
        _emit('rls:denied', { resource, operation });
        throw new error.Error(
            `Access denied: cannot read ${resource}`,
            { code: error.CODES.RLS_DENIED, retryable: false }
        );
    }
    
    return true;
}

/**
 * Check if user can WRITE a resource
 * Throws on denial
 */
async function checkWrite(userCtx, resource, operation = 'write') {
    if (!_habitat) {
        return true; // No RLS configured
    }
    
    const allowed = await _habitat.can(userCtx, resource, 'write');
    
    if (!allowed) {
        const error = require('./error');
        throw new error.Error(
            `Access denied: cannot write ${resource}`,
            { code: error.CODES.RLS_DENIED, retryable: false }
        );
    }
    
    return true;
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
            const token = req.headers.authorization?.replace('Bearer ', '');
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
    forWorkspace
};

module.exports = rls;
