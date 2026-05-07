/**
 * Vant SessionStore Class
 * Session storage
 */

class SessionStore {
    constructor(options = {}) {
        this.options = {
            ttl: options.ttl || 3600000, // 1 hour
            ...options
        };
        this._sessions = new Map();
        this._startTime = Date.now();
    }
    
    /**
     * Create session
     */
    create(data = {}) {
        const id = this._generateId();
        this._sessions.set(id, {
            data,
            createdAt: Date.now(),
            lastAccessedAt: Date.now()
        });
        return id;
    }
    
    /**
     * Get session
     */
    get(id) {
        const session = this._sessions.get(id);
        if (!session) return null;
        
        // Check TTL
        if (Date.now() - session.lastAccessedAt > this.options.ttl) {
            this._sessions.delete(id);
            return null;
        }
        
        session.lastAccessedAt = Date.now();
        return session.data;
    }
    
    /**
     * Set session data
     */
    set(id, data) {
        const session = this._sessions.get(id);
        if (session) {
            session.data = { ...session.data, ...data };
            session.lastAccessedAt = Date.now();
        }
        return this;
    }
    
    /**
     * Destroy session
     */
    destroy(id) {
        this._sessions.delete(id);
        return this;
    }
    
    /**
     * Touch session (extend TTL)
     */
    touch(id) {
        const session = this._sessions.get(id);
        if (session) {
            session.lastAccessedAt = Date.now();
        }
        return this;
    }
    
    /**
     * Clear expired sessions
     */
    prune() {
        const now = Date.now();
        for (const [id, session] of this._sessions) {
            if (now - session.lastAccessedAt > this.options.ttl) {
                this._sessions.delete(id);
            }
        }
        return this;
    }
    
    /**
     * Get session count
     */
    size() {
        return this._sessions.size;
    }
    
    _generateId() {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }
    
    getLayerStatus() { return { name: 'SessionStore', type: 'infra', enabled: true, config: { ttl: this.options.ttl }, state: { sessions: this._sessions.size, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'SessionStore' }; }
    getStatus() { return { enabled: true, sessions: this._sessions.size }; }
}

module.exports = {
    SessionStore, create: (o) => new SessionStore(o),
    create: (d) => new SessionStore().create(d),
    get: (id) => new SessionStore().get(id),
    set: (id, d) => new SessionStore().set(id, d),
    destroy: (id) => new SessionStore().destroy(id),
    getLayerStatus: () => ({ name: 'SessionStore', type: 'infra', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'SessionStore' }),
    getStatus: () => ({ enabled: true })
};