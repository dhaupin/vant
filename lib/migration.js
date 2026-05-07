/**
 * Vant Migration Class
 * Database migration manager
 */

const fs = require('fs');

class Migration {
    constructor(options = {}) {
        this.options = {
            table: options.table || '_migrations',
            ...options
        };
        this._migrations = [];
        this._startTime = Date.now();
    }
    
    /**
     * Add migration
     */
    add(name, up, down) {
        this._migrations.push({ name, up, down, applied: false });
        return this;
    }
    
    /**
     * Get pending migrations
     */
    pending() {
        return this._migrations.filter(m => !m.applied);
    }
    
    /**
     * Apply migration
     */
    async apply(name, conn) {
        const mig = this._migrations.find(m => m.name === name);
        if (!mig) throw new Error('Migration not found: ' + name);
        
        await mig.up(conn);
        mig.applied = true;
        
        return mig;
    }
    
    /**
     * Rollback migration
     */
    async rollback(name, conn) {
        const mig = this._migrations.find(m => m.name === name);
        if (!mig) throw new Error('Migration not found: ' + name);
        
        await mig.down(conn);
        mig.applied = false;
        
        return mig;
    }
    
    /**
     * Get applied migrations
     */
    applied() {
        return this._migrations.filter(m => m.applied);
    }
    
    getLayerStatus() { return { name: 'Migration', type: 'db', enabled: true, state: { total: this._migrations.length, applied: this._migrations.filter(m => m.applied).length, uptime: Date.now() - this._startTime } }; }
    isOperationAllowed(op) { return { allowed: true, layer: 'Migration' }; }
    getStatus() { return { enabled: true, total: this._migrations.length, applied: this._migrations.filter(m => m.applied).length }; }
}

module.exports = {
    Migration, create: (o) => new Migration(o),
    add: (n, u, d) => new Migration().add(n, u, d),
    pending: () => new Migration().pending(),
    apply: async (n, c) => new Migration().apply(n, c),
    getLayerStatus: () => ({ name: 'Migration', type: 'db', enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Migration' }),
    getStatus: () => ({ enabled: true })
};