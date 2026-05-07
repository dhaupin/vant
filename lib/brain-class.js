/**
 * Vant Brain Class
 * 
 * Wrapper for brain operations - provides class interface
 * Imports and re-exports existing brain.js functionality
 * 
 * Usage:
 *   const brain = require('./brain');
 *   
 *   // Class instance
 *   const brain = brain.create();
 *   
 *   // Operations
 *   await brain.load();
 *   const identity = brain.getIdentity();
 *   const learnings = brain.get('learnings', 'lesson-1');
 *   await brain.write('lessings', 'new', content);
 *   
 *   // Check allowed
 *   brain.isOperationAllowed('read');
 *   brain.getLayerStatus();
 */

const existingBrain = require('./brain');

/**
 * Brain Class
 * Provides class interface for brain operations
 */
class Brain {
    /**
     * Create Brain instance
     * @param {object} options - Configuration
     */
    constructor(options = {}) {
        this.options = {
            path: options.path || null,
            autoLoad: options.autoLoad !== false,
            version: options.version || 'v0.5.0'
        };
        
        // State
        this._loaded = false;
        this._startTime = Date.now();
    }
    
    /**
     * Load brain (passthrough to existing)
     */
    async load() {
        await existingBrain.load();
        this._loaded = true;
    }
    
    /**
     * Get identity
     */
    getIdentity() {
        return existingBrain.getIdentity();
    }
    
    /**
     * Get from brain
     */
    get(category, key) {
        return existingBrain.get(category, key);
    }
    
    /**
     * Write to brain
     */
    async write(category, key, content) {
        return existingBrain.write(category, key, content);
    }
    
    /**
     * Append to brain
     */
    async append(category, key, content) {
        return existingBrain.append(category, key, content);
    }
    
    /**
     * Has entry
     */
    has(category, key) {
        return existingBrain.has(category, key);
    }
    
    /**
     * Get all entries in category
     */
    getAll(category) {
        return existingBrain.getAll(category);
    }
    
    /**
     * Get version
     */
    getVersion() {
        return existingBrain.getVersion();
    }
    
    /**
     * Get layer status
     */
    getLayerStatus() {
        return {
            name: 'Brain',
            type: 'storage',
            enabled: true,
            config: {
                path: this.options.path,
                autoLoad: this.options.autoLoad,
                version: this.options.version
            },
            state: {
                loaded: this._loaded,
                uptime: Date.now() - this._startTime
            }
        };
    }
    
    /**
     * Check if operation allowed
     */
    isOperationAllowed(operationType, context = {}) {
        // Brain is always allowed if loaded
        if (!this._loaded) {
            return {allowed: false, reason: 'not_loaded', layer: 'Brain'};
        }
        
        // Check specific operation types
        if (operationType === 'write' && context.requireLock) {
            return {allowed: true, reason: 'lock_may_be_required', layer: 'Brain'};
        }
        
        return {allowed: true, layer: 'Brain'};
    }
    
    /**
     * Get status
     */
    getStatus() {
        return {
            loaded: this._loaded,
            version: this.getVersion()
        };
    }
}

/**
 * Default Brain instance
 */
const defaultBrain = new Brain();

module.exports = {
    // Class
    Brain,
    
    /**
     * Create Brain instance
     */
    create(options = {}) {
        return new Brain(options);
    },
    
    // Re-export existing brain functions
    load: existingBrain.load,
    getIdentity: existingBrain.getIdentity,
    get: existingBrain.get,
    getAll: existingBrain.getAll,
    getVersion: existingBrain.getVersion,
    write: existingBrain.write,
    append: existingBrain.append,
    has: existingBrain.has,
    version: existingBrain.version,
    toJSON: existingBrain.toJSON,
    fromJSON: existingBrain.fromJSON,
    compress: existingBrain.compress,
    decompress: existingBrain.decompress,
    embedConfig: existingBrain.embedConfig,
    extractEmbeddedConfig: existingBrain.extractEmbeddedConfig,
    
    // New class methods
    getLayerStatus() {
        return defaultBrain.getLayerStatus();
    },
    
    isOperationAllowed(operationType, context) {
        return defaultBrain.isOperationAllowed(operationType, context);
    },
    
    getStatus() {
        return defaultBrain.getStatus();
    }
};