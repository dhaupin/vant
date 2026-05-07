/**
 * Vant Sync Class
 * 
 * Wrapper for sync operations - provides class interface
 * Imports and re-exports existing sync.js functionality
 * 
 * Usage:
 *   const sync = require('./sync');
 *   
 *   // Class instance
 *   const sync = sync.create();
 *   
 *   // Operations
 *   await sync.pushAll();
 *   await sync.pullAny();
 *   
 *   // Check allowed
 *   sync.isOperationAllowed('read');
 *   sync.getLayerStatus();
 */

const existingSync = require('./sync');

/**
 * Sync Class
 * Provides class interface for sync operations
 */
class Sync {
    /**
     * Create Sync instance
     * @param {object} options - Configuration
     */
    constructor(options = {}) {
        this.options = {
            providers: options.providers || [],
            autoSync: options.autoSync !== false,
            mode: options.mode || 'raid'
        };
        
        // State
        this._startTime = Date.now();
        this._initialized = true;
    }
    
    /**
     * Broadcast to all providers
     */
    async pushAll() {
        return existingSync.pushAll();
    }
    
    /**
     * Pull from first available
     */
    async pullAny() {
        return existingSync.pullAny();
    }
    
    /**
     * Get sync status
     */
    getStatus() {
        return existingSync.getStatus();
    }
    
    /**
     * Is RAID mode
     */
    isRAID() {
        return existingSync.isRAID();
    }
    
    /**
     * Get provider count
     */
    getProviderCount() {
        return existingSync.getProviderCount();
    }
    
    /**
     * Get configured providers
     */
    getConfiguredProviders() {
        return existingSync.getConfiguredProviders();
    }
    
    /**
     * Rebase provider
     */
    async rebase(provider) {
        return existingSync.rebase(provider);
    }
    
    /**
     * Mark stale
     */
    markStale(provider) {
        return existingSync.markStale(provider);
    }
    
    /**
     * Get provider state
     */
    getProviderState(provider) {
        return existingSync.getProviderState(provider);
    }
    
    /**
     * Is circuit closed
     */
    isCircuitClosed(provider) {
        return existingSync.isCircuitClosed(provider);
    }
    
    /**
     * Record failure
     */
    recordFailure(provider) {
        return existingSync.recordFailure(provider);
    }
    
    /**
     * Record success
     */
    recordSuccess(provider) {
        return existingSync.recordSuccess(provider);
    }
    
    /**
     * Get all circuits
     */
    getAllCircuits() {
        return existingSync.getAllCircuits();
    }
    
    /**
     * Get layer status
     */
    getLayerStatus() {
        return {
            name: 'Sync',
            type: 'synchronization',
            enabled: this._initialized,
            config: {
                providers: this.options.providers,
                autoSync: this.options.autoSync,
                mode: this.options.mode
            },
            state: {
                providerCount: this.getProviderCount(),
                uptime: Date.now() - this._startTime
            }
        };
    }
    
    /**
     * Check if operation allowed
     */
    isOperationAllowed(operationType, context = {}) {
        // Always allowed if initialized
        return {allowed: true, layer: 'Sync'};
    }
    
    /**
     * Get status
     */
    getStatus() {
        return {
            enabled: this._initialized,
            providers: this.getProviderCount()
        };
    }
}

/**
 * Default Sync instance
 */
const defaultSync = new Sync();

module.exports = {
    // Class
    Sync,
    
    /**
     * Create Sync instance
     */
    create(options = {}) {
        return new Sync(options);
    },
    
    // Re-export existing functions
    pushAll: existingSync.pushAll,
    pullAny: existingSync.pullAny,
    getStatus: existingSync.getStatus,
    isRAID: existingSync.isRAID,
    getProviderCount: existingSync.getProviderCount,
    getConfiguredProviders: existingSync.getConfiguredProviders,
    rebase: existingSync.rebase,
    markStale: existingSync.markStale,
    getProviderState: existingSync.getProviderState,
    saveProviderState: existingSync.saveProviderState,
    isCircuitClosed: existingSync.isCircuitClosed,
    recordFailure: existingSync.recordFailure,
    recordSuccess: existingSync.recordSuccess,
    getAllCircuits: existingSync.getAllCircuits,
    
    // Class methods
    getLayerStatus() {
        return defaultSync.getLayerStatus();
    },
    
    isOperationAllowed(operationType, context) {
        return defaultSync.isOperationAllowed(operationType, context);
    },
    
    getStatus() {
        return defaultSync.getStatus();
    }
};