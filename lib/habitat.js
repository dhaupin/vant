/**
 * Habitat (v0.9.0)
 * Framework for nature - boundaries, input streams, RLS
 * 
 * The habitat creates the conditions where nature can run.
 * Like a garden: provides soil, water, sunlight for growth.
 * 
 * Concepts:
 * - boundaries: what's allowed (RLS policies)
 * - inputs: chaos sources feeding nature
 * - context: user/role/team for RLS
 * - persistence: where state lives
 */

const EventEmitter = require('events');
const encrypt = require('./encrypt');

class Habitat extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Boundaries: RLS policies
        // { islandName: { readableBy: [], writableBy: [], filter: fn, mask: fn } }
        this.boundaries = options.boundaries || {};
        
        // Input streams (chaos sources)
        this.inputs = [];
        
        // Persistence layer (brain)
        this.persistence = options.persistence || null;
        
        // User contexts cache
        this.contexts = new Map();
        
        // Default policies
        this.defaultPolicy = {
            readableBy: ['public'],
            writableBy: ['role:admin']
        };
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
     * Get user context from token
     * This is used for RLS (Row-Level Security)
     */
    async context(token) {
        if (!token) {
            return { userId: 'anonymous', roles: [], scopes: [] };
        }
        
        // Check cache
        if (this.contexts.has(token)) {
            return this.contexts.get(token);
        }
        
        try {
            // Verify and decode token
            const payload = await encrypt.default.verifyToken(token);
            const ctx = {
                userId: payload.userId,
                roles: payload.roles || [],
                scopes: payload.scopes || [],
                team: payload.team
            };
            
            this.contexts.set(token, ctx);
            return ctx;
        } catch (e) {
            return { userId: 'anonymous', roles: [], scopes: [] };
        }
    }

    /**
     * Check if user can access resource
     * RLS: readableBy, writableBy
     */
    async can(userCtx, resource, mode = 'read') {
        const policy = this.boundaries[resource] || this.defaultPolicy;
        
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
