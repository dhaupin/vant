/**
 * Vant Resolution Class
 * 
 * Wrapper for resolution operations - provides class interface
 * Imports and re-exports existing resolution.js functionality
 * 
 * Usage:
 *   const resolution = require('./resolution');
 *   
 *   // Class instance
 *   const resolution = resolution.create();
 *   
 *   // Operations
 *   const status = resolution.getStatus(entryId);
 *   resolution.setStatus(entryId, 'resolved');
 *   const history = resolution.getHistory();
 *   
 *   // Check allowed
 *   resolution.isOperationAllowed('read');
 *   resolution.getLayerStatus();
 */

const existingResolution = require('./resolution');

/**
 * Resolution Class
 * Provides class interface for resolution operations
 */
class Resolution {
    /**
     * Create Resolution instance
     * @param {object} options - Configuration
     */
    constructor(options = {}) {
        this.options = {
            path: options.path || null,
            autoLoad: options.autoLoad !== false
        };
        
        // State
        this._startTime = Date.now();
        this._initialized = true; // Resolutions always available
    }
    
    /**
     * Get status of an entry
     */
    getStatus(entryId) {
        return existingResolution.getStatus(entryId);
    }
    
    /**
     * Set status of an entry
     */
    setStatus(entryId, status, notes) {
        return existingResolution.setStatus(entryId, status, notes);
    }
    
    /**
     * Get resolution history
     */
    getHistory(options) {
        return existingResolution.getHistory(options);
    }
    
    /**
     * Get stats
     */
    getStats() {
        return existingResolution.getStats();
    }
    
    /**
     * Is deprecated
     */
    isDeprecated(entryId) {
        return existingResolution.isDeprecated(entryId);
    }
    
    /**
     * Get deprecated entries
     */
    getDeprecated() {
        return existingResolution.getDeprecated();
    }
    
    /**
     * Load resolutions from storage
     */
    load() {
        return existingResolution.load();
    }
    
    /**
     * Get layer status
     */
    getLayerStatus() {
        return {
            name: 'Resolution',
            type: 'tracking',
            enabled: true,
            config: {
                path: this.options.path,
                autoLoad: this.options.autoLoad
            },
            state: {
                uptime: Date.now() - this._startTime
            }
        };
    }
    
    /**
     * Check if operation allowed
     */
    isOperationAllowed(operationType, context = {}) {
        // Resolution is always allowed
        return {allowed: true, layer: 'Resolution'};
    }
    
    /**
     * Get status
     */
    getStatus() {
        return {
            enabled: true,
            type: 'tracking'
        };
    }
}

/**
 * Default Resolution instance
 */
const defaultResolution = new Resolution();

module.exports = {
    // Class
    Resolution,
    
    /**
     * Create Resolution instance
     */
    create(options = {}) {
        return new Resolution(options);
    },
    
    // Re-export existing functions
    getStatus: existingResolution.getStatus,
    setStatus: existingResolution.setStatus,
    getHistory: existingResolution.getHistory,
    getStats: existingResolution.getStats,
    isDeprecated: existingResolution.isDeprecated,
    getDeprecated: existingResolution.getDeprecated,
    load: existingResolution.load,
    
    // New class methods
    getLayerStatus() {
        return defaultResolution.getLayerStatus();
    },
    
    isOperationAllowed(operationType, context) {
        return defaultResolution.isOperationAllowed(operationType, context);
    },
    
    getStatus() {
        return defaultResolution.getStatus();
    }
};