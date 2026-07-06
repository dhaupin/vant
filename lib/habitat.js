/**
 * Habitat (v0.9.0)
 * Framework for nature - boundaries, workspaces, RLS
 * 
 * The habitat creates the conditions where nature can run.
 * Like a garden: provides soil, water, sunlight for growth.
 * 
 * RLS (Row-Level Security):
 * - workspaces: isolated containers for multi-tenant
 * - roles: user roles within workspace
 * - boundaries: island-level access policies
 * - container: workspace isolation
 * 
 * Concepts:
 * - boundaries: what's allowed (RLS policies)
 * - workspaces: isolated containers (like Docker containers)
 * - roles: user roles within workspace
 * - container: workspace isolation
 * - inputs: chaos sources feeding nature
 * - context: user/role/workspace for RLS
 * - persistence: where state lives
 */

const EventEmitter = require('events');
const encrypt = require('./encrypt');

class Habitat extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // === RLS: Boundaries ===
        // { islandName: { readableBy: [], writableBy: [], filter: fn, mask: fn } }
        this.boundaries = options.boundaries || {};
        
        // === RLS: Workspaces (containers) ===
        // Isolated environments - like Docker containers
        // { workspaceId: { name, owner, roles: [], members: [] } }
        this.workspaces = options.workspaces || {};
        
        // === RLS: Roles ===
        // Role definitions per workspace
        // { workspaceId: { admin: [], editor: [], viewer: [] } }
        this.roles = options.roles || {};
        
        // === RLS: Default workspace ===
        this.defaultWorkspace = options.defaultWorkspace || 'default';
        
        // Current workspace context
        this.currentWorkspace = this.defaultWorkspace;
        
        // Input streams (chaos sources)
        this.inputs = [];
        
        // Persistence layer (brain)
        this.persistence = options.persistence || null;
        
        // User contexts cache
        this.contexts = new Map();
        
        // Default policies
        this.defaultPolicy = {
            readableBy: ['public'],
            writableBy: ['role:admin'],
            container: 'default'  // workspace/tenant isolation
        };
    }

    // ============================================
    // WORKSPACE (Container) MANAGEMENT
    // ============================================

    /**
     * Create a new workspace (container)
     * Optionally assign geometric address for spatial addressing
     */
    createWorkspace(workspaceId, options = {}) {
        // Get geometry for spatial addressing (lazy load)
        let geometry = null;
        try {
            geometry = require('./geometry');
        } catch (e) {
            // Geometry module not available
        }
        
        // Generate geometric address if geometry available
        const geoAddress = geometry?.workspaceAddress 
            ? geometry.workspaceAddress(workspaceId, options.facility)
            : null;
        
        const workspace = {
            id: workspaceId,
            name: options.name || workspaceId,
            owner: options.owner,
            created: Date.now(),
            policy: options.policy || { ...this.defaultPolicy },
            // Geometric addressing for spatial/multi-tenant
            geometry: geoAddress || null
        };
        
        this.workspaces[workspaceId] = workspace;
        
        // Initialize roles for workspace
        this.roles[workspaceId] = {
            admin: [options.owner].filter(Boolean),
            editor: [],
            viewer: []
        };
        
        return workspace;
    }

    /**
     * Get workspace
     */
    getWorkspace(workspaceId) {
        return this.workspaces[workspaceId] || this.workspaces[this.defaultWorkspace];
    }

    /**
     * List workspaces
     */
    listWorkspaces() {
        return Object.values(this.workspaces);
    }
    
    /**
     * Get workspaces as geometric map
     * Returns workspace IDs with their geometric addresses
     */
    getGeometricMap() {
        let geometry = null;
        try {
            geometry = require('./geometry');
        } catch (e) {
            return null;
        }
        
        const workspaces = Object.values(this.workspaces);
        return geometry.workspaceMap(workspaces);
    }

    /**
     * Set current workspace context
     */
    setWorkspace(workspaceId) {
        if (this.workspaces[workspaceId]) {
            this.currentWorkspace = workspaceId;
            return true;
        }
        return false;
    }

    /**
     * Get current workspace
     */
    getCurrentWorkspace() {
        return this.currentWorkspace;
    }

    // ============================================
    // ROLE MANAGEMENT
    // ============================================

    /**
     * Add role to workspace
     */
    addRole(workspaceId, role, userId) {
        if (!this.roles[workspaceId]) {
            this.roles[workspaceId] = { admin: [], editor: [], viewer: [] };
        }
        
        if (this.roles[workspaceId][role]) {
            if (!this.roles[workspaceId][role].includes(userId)) {
                this.roles[workspaceId][role].push(userId);
            }
        }
        
        return this.roles[workspaceId];
    }

    /**
     * Remove role from workspace
     */
    removeRole(workspaceId, role, userId) {
        if (this.roles[workspaceId] && this.roles[workspaceId][role]) {
            this.roles[workspaceId][role] = this.roles[workspaceId][role].filter(u => u !== userId);
        }
        return this.roles[workspaceId];
    }

    /**
     * Get user roles in workspace
     */
    getUserRoles(workspaceId, userId) {
        const workspaceRoles = this.roles[workspaceId] || {};
        const userRoles = [];
        
        for (const [role, members] of Object.entries(workspaceRoles)) {
            if (members.includes(userId)) {
                userRoles.push(role);
            }
        }
        
        return userRoles;
    }

    /**
     * Check if user has role in workspace
     */
    hasRole(workspaceId, userId, role) {
        const workspaceRoles = this.roles[workspaceId] || {};
        return workspaceRoles[role]?.includes(userId) || false;
    }

    /**
     * Feed chaos into the system
     * This is how entropy enters the habitat
     */
    feed(event) {
        const chaos = event.chaos || 1;
        const type = event.type || 'unknown';
        
        // Emit for listeners (nature will listen)
        this.emit('chaos', {
            type,
            chaos,
            timestamp: Date.now(),
            data: event.data
        });
        
        return chaos;
    }

    /**
     * Add an input source
     */
    addInput(source) {
        this.inputs.push(source);
        
        // Wire up the source to feed() 
        if (source.on && typeof source.on === 'function') {
            source.on('event', (e) => this.feed(e));
        }
    }
    
    /**
     * Feed cosmic entropy from encrypt module
     * This is the main entry point for cosmic entropy during boot
     */
    async feedCosmicEntropy() {
        try {
            const encrypt = require('./encrypt');
            const entropy = await encrypt.default.getCosmicEntropy();
            
            // Feed the chaos into habitat
            const chaos = this._computeChaos(entropy);
            this.feed({
                type: 'cosmic-entropy',
                chaos,
                data: entropy
            });
            
            return chaos;
        } catch (e) {
            // Fallback - feed minimal chaos
            this.feed({ type: 'cosmic-fallback', chaos: 1 });
            return 1;
        }
    }
    
    /**
     * Compute chaos value from entropy data
     */
    _computeChaos(entropy) {
        const str = JSON.stringify(entropy.data || entropy);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash % 10) + 1;
    }

    /**
     * Get user context from token
     * This is used for RLS (Row-Level Security)
     * Includes workspace/container context
     */
    async context(token) {
        if (!token) {
            return { 
                userId: 'anonymous', 
                roles: [], 
                scopes: [],
                workspace: this.currentWorkspace 
            };
        }
        
        // Check cache
        if (this.contexts.has(token)) {
            const ctx = this.contexts.get(token);
            // Always use current workspace
            ctx.workspace = this.currentWorkspace;
            return ctx;
        }
        
        try {
            // Verify and decode token
            const payload = await encrypt.default.verifyToken(token);
            const ctx = {
                userId: payload.userId,
                roles: payload.roles || [],
                scopes: payload.scopes || [],
                team: payload.team,
                workspace: payload.workspace || this.currentWorkspace
            };
            
            // Also get roles from workspace
            if (ctx.workspace) {
                ctx.roles = [...ctx.roles, ...this.getUserRoles(ctx.workspace, ctx.userId)];
            }
            
            this.contexts.set(token, ctx);
            return ctx;
        } catch (e) {
            return { 
                userId: 'anonymous', 
                roles: [], 
                scopes: [],
                workspace: this.currentWorkspace 
            };
        }
    }

    /**
     * Check if user can access resource
     * RLS: readableBy, writableBy + workspace isolation
     */
    async can(userCtx, resource, mode = 'read') {
        // First: Check workspace/container isolation
        const policy = this.boundaries[resource] || this.defaultPolicy;
        const resourceContainer = policy.container || 'default';
        
        // If resource is in a different container, deny
        if (userCtx.workspace && userCtx.workspace !== resourceContainer) {
            // Cross-container access denied
            if (resourceContainer !== 'public') {
                return false;
            }
        }
        
        // Second: Check boundary policies
        if (mode === 'read') {
            return this._matches(policy.readableBy || [], userCtx);
        } else if (mode === 'write') {
            return this._matches(policy.writableBy || [], userCtx);
        }
        
        return false;
    }

    /**
     * Check if user matches any policy rule
     */
    _matches(rules, userCtx) {
        if (!rules || rules.length === 0) return true;
        
        for (const rule of rules) {
            // Public is readable by anyone
            if (rule === 'public') return true;
            
            // Container/workspace check
            if (rule.startsWith('container:')) {
                const container = rule.slice(10);
                if (userCtx.workspace === container) return true;
            }
            
            // Role check
            if (rule.startsWith('role:')) {
                const role = rule.slice(5);
                if (userCtx.roles.includes(role)) return true;
            }
            
            // User check
            if (rule.startsWith('user:')) {
                const userId = rule.slice(5);
                if (userCtx.userId === userId) return true;
            }
            
            // Team check
            if (rule.startsWith('team:')) {
                const team = rule.slice(5);
                if (userCtx.team === team) return true;
            }
        }
        
        return false;
    }

    /**
     * Set boundary policy for a resource
     */
    setPolicy(resource, policy) {
        this.boundaries[resource] = { ...this.defaultPolicy, ...policy };
    }

    /**
     * Get all boundaries
     */
    getBoundaries() {
        return this.boundaries;
    }

    // ============================================
    // PERSISTENCE (save/load workspace state)
    // ============================================

    /**
     * Save state to brain
     */
    async save() {
        if (!this.persistence) return null;
        
        const state = {
            workspaces: this.workspaces,
            roles: this.roles,
            boundaries: this.boundaries,
            defaultWorkspace: this.defaultWorkspace,
            savedAt: Date.now()
        };
        
        if (this.persistence.learn) {
            await this.persistence.learn('_habitat', state, { 
                ttl: 100 * 365 * 24 * 60 * 60 * 1000 
            });
        }
        
        return state;
    }

    /**
     * Restore state from brain
     */
    async restore() {
        if (!this.persistence) return null;
        
        try {
            if (this.persistence.remember) {
                const state = await this.persistence.remember('_habitat');
                if (state) {
                    this.workspaces = state.workspaces || {};
                    this.roles = state.roles || {};
                    this.boundaries = state.boundaries || {};
                    this.defaultWorkspace = state.defaultWorkspace || 'default';
                    return state;
                }
            }
        } catch (e) {
            // No saved state
        }
        
        return null;
    }

    /**
     * Get entropy from cosmic sources
     * Uses encrypt.getCosmicEntropy() for true randomness
     */
    async getEntropy() {
        try {
            const cosmic = await encrypt.default.getCosmicEntropy();
            return {
                source: cosmic.source,
                timestamp: cosmic.timestamp,
                chaos: this._computeChaos(cosmic)
            };
        } catch (e) {
            // Fallback to crypto
            return {
                source: 'fallback',
                timestamp: Date.now(),
                chaos: 1
            };
        }
    }

    /**
     * Compute chaos weight from entropy
     */
    _computeChaos(entropy) {
        // Use entropy data as chaos seed
        const str = JSON.stringify(entropy.data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        // Normalize to 1-10 range
        return Math.abs(hash % 10) + 1;
    }

    /**
     * Status
     */
    status() {
        return {
            inputs: this.inputs.length,
            boundaries: Object.keys(this.boundaries).length,
            contexts: this.contexts.size
        };
    }
}

module.exports = Habitat;
