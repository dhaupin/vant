/**
 * Vant AuditLog Class
 * 
 * Audit logging - who did what when
 * Compliance requirement
 * 
 * Usage:
 *   const audit = require('./audit-log');
 *   
 *   // Log action
 *   await audit.log('user123', 'write', { file: 'brain' });
 *   
 *   // Query logs
 *   const logs = audit.query({ user: 'user123' });
 *   
 *   // Check allowed
 *   audit.isOperationAllowed('read');
 *   audit.getLayerStatus();
 */

/**
 * AuditLog Class
 */
class AuditLog {
    constructor(options = {}) {
        this.options = {
            maxEntries: options.maxEntries || 10000,
            retention: options.retention || 90 * 24 * 60 * 60 * 1000,
            ...options
        };
        
        this._entries = [];
        this._index = new Map(); // user → [entries]
        this._startTime = Date.now();
    }
    
    /**
     * Log action
     */
    async log(user, action, details = {}) {
        const entry = {
            id: `audit_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            user,
            action,
            details,
            timestamp: Date.now(),
            source: details.source || 'unknown'
        };
        
        this._entries.push(entry);
        
        // Index by user
        if (!this._index.has(user)) {
            this._index.set(user, []);
        }
        this._index.get(user).push(entry.id);
        
        // Trim if needed
        while (this._entries.length > this.options.maxEntries) {
            this._entries.shift();
        }
        
        return entry.id;
    }
    
    /**
     * Query logs
     */
    query(filter = {}) {
        let results = [...this._entries];
        
        if (filter.user) {
            results = results.filter(e => e.user === filter.user);
        }
        if (filter.action) {
            results = results.filter(e => e.action === filter.action);
        }
        if (filter.from) {
            results = results.filter(e => e.timestamp >= filter.from);
        }
        if (filter.to) {
            results = results.filter(e => e.timestamp <= filter.to);
        }
        if (filter.limit) {
            results = results.slice(-filter.limit);
        }
        
        return results;
    }
    
    /**
     * Get user activity
     */
    getUserActivity(user) {
        const ids = this._index.get(user) || [];
        return ids.map(id => this._entries.find(e => e.id === id)).filter(Boolean);
    }
    
    /**
     * Get stats
     */
    getStats() {
        return {
            entries: this._entries.length,
            maxEntries: this.options.maxEntries,
            uniqueUsers: this._index.size,
            oldest: this._entries[0]?.timestamp,
            newest: this._entries[this._entries.length - 1]?.timestamp
        };
    }
    
    /**
     * Get layer status
     */
    getLayerStatus() {
        return {
            name: 'AuditLog',
            type: 'audit',
            enabled: true,
            config: { maxEntries: this.options.maxEntries },
            state: { entries: this._entries.length, uptime: Date.now() - this._startTime }
        };
    }
    
    isOperationAllowed(operationType, context = {}) {
        return {allowed: true, layer: 'AuditLog'};
    }
    
    getStatus() {
        return {enabled: true, entries: this._entries.length};
    }
}

const defaultAuditLog = new AuditLog();

module.exports = {
    AuditLog,
    create(options) {
        return new AuditLog(options);
    },
    log(user, action, details) {
        return defaultAuditLog.log(user, action, details);
    },
    query(filter) {
        return defaultAuditLog.query(filter);
    },
    getUserActivity(user) {
        return defaultAuditLog.getUserActivity(user);
    },
    getStats() {
        return defaultAuditLog.getStats();
    },
    getLayerStatus() {
        return defaultAuditLog.getLayerStatus();
    },
    isOperationAllowed(operationType, context) {
        return defaultAuditLog.isOperationAllowed(operationType, context);
    },
    getStatus() {
        return defaultAuditLog.getStatus();
    }
};