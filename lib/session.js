/**
 * Vant Session Class
 * 
 * Request context, correlation IDs
 * 
 * Usage:
 *   const session = require('./session');
 *   
 *   // Create session
 *   const ctx = session.create({ user: 'user123' });
 *   
 *   // Get/set context
 *   const user = ctx.get('user');
 *   ctx.set('action', 'write');
 *   
 *   // Check allowed
 *   session.isOperationAllowed('read');
 *   session.getLayerStatus();
 */

class Session {
    constructor(options = {}) {
        this.options = {
            ttl: options.ttl || 3600000,
            ...options
        };
        
        this._sessions = new Map(); // id → { data, createdAt }
        this._current = null;
        this._startTime = Date.now();
    }
    
    /**
     * Create new session
     */
    create(data = {}) {
        const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        
        const sess = {
            id,
            data: { ...data },
            createdAt: Date.now(),
            correlationId: data.correlationId || `corr_${id}`
        };
        
        this._sessions.set(id, sess);
        this._current = id;
        
        return this;
    }
    
    /**
     * Get current session
     */
    current() {
        if (!this._current) return null;
        return this._sessions.get(this._current);
    }
    
    /**
     * Get session by ID
     */
    get(id) {
        return this._sessions.get(id);
    }
    
    /**
     * Get value from current session
     */
    get(key) {
        const sess = this.current();
        return sess ? sess.data[key] : null;
    }
    
    /**
     * Set value in current session
     */
    set(key, value) {
        const sess = this.current();
        if (sess) {
            sess.data[key] = value;
        }
        return this;
    }
    
    /**
     * Get correlation ID
     */
    correlationId() {
        const sess = this.current();
        return sess ? sess.correlationId : null;
    }
    
    /**
     * End session
     */
    end(id = this._current) {
        if (id) {
            this._sessions.delete(id);
            if (this._current === id) {
                this._current = null;
            }
        }
    }
    
    /**
     * End all sessions
     */
    endAll() {
        this._sessions.clear();
        this._current = null;
    }
    
    /**
     * List sessions
     */
    list() {
        return [...this._sessions.keys()];
    }
    
    /**
     * Get stats
     */
    getStats() {
        return {
            sessions: this._sessions.size,
            current: this._current
        };
    }
    
    getLayerStatus() {
        return {
            name: 'Session',
            type: 'session',
            enabled: true,
            config: { ttl: this.options.ttl },
            state: { sessions: this._sessions.size, uptime: Date.now() - this._startTime }
        };
    }
    
    isOperationAllowed(operationType, context = {}) {
        return {allowed: true, layer: 'Session'};
    }
    
    getStatus() {
        return {enabled: true, sessions: this._sessions.size};
    }
}

const defaultSession = new Session();

module.exports = {
    Session,
    create(options) {
        return new Session(options);
    },
    createSession(data) {
        return defaultSession.create(data);
    },
    current() {
        return defaultSession.current();
    },
    get(id) {
        return defaultSession.get(id);
    },
    getValue(key) {
        return defaultSession.get(key);
    },
    setValue(key, value) {
        return defaultSession.set(key, value);
    },
    correlationId() {
        return defaultSession.correlationId();
    },
    end(id) {
        return defaultSession.end(id);
    },
    endAll() {
        return defaultSession.endAll();
    },
    list() {
        return defaultSession.list();
    },
    getStats() {
        return defaultSession.getStats();
    },
    getLayerStatus() {
        return defaultSession.getLayerStatus();
    },
    isOperationAllowed(operationType, context) {
        return defaultSession.isOperationAllowed(operationType, context);
    },
    getStatus() {
        return defaultSession.getStatus();
    }
};