/**
 * Vant ConfigFlag Class
 * 
 * Feature flags, runtime config
 * 
 * Usage:
 *   const config = require('./config-flag');
 *   
 *   // Set flag
 *   config.set('featureX', true);
 *   
 *   // Get flag
 *   const enabled = config.get('featureX');
 *   
 *   // Check
 *   config.isEnabled('featureX');
 *   
 *   // Check allowed
 *   config.isOperationAllowed('read');
 *   config.getLayerStatus();
 */

class ConfigFlag {
    constructor(options = {}) {
        this.options = { ...options };
        this._flags = new Map();
        this._startTime = Date.now();
    }
    
    /**
     * Set flag value
     */
    set(name, value) {
        this._flags.set(name, { value, timestamp: Date.now() });
    }
    
    /**
     * Get flag value
     */
    get(name, defaultValue = null) {
        const flag = this._flags.get(name);
        return flag ? flag.value : defaultValue;
    }
    
    /**
     * Check if flag is enabled
     */
    isEnabled(name) {
        return !!this.get(name);
    }
    
    /**
     * Delete flag
     */
    delete(name) {
        this._flags.delete(name);
    }
    
    /**
     * List flags
     */
    list() {
        return [...this._flags.keys()];
    }
    
    /**
     * Enable flag
     */
    enable(name) {
        this.set(name, true);
    }
    
    /**
     * Disable flag
     */
    disable(name) {
        this.set(name, false);
    }
    
    /**
     * Toggle flag
     */
    toggle(name) {
        this.set(name, !this.isEnabled(name));
    }
    
    getLayerStatus() {
        return {
            name: 'ConfigFlag',
            type: 'config',
            enabled: true,
            state: { flags: this._flags.size, uptime: Date.now() - this._startTime }
        };
    }
    
    isOperationAllowed(operationType, context = {}) {
        return {allowed: true, layer: 'ConfigFlag'};
    }
    
    getStatus() {
        return {enabled: true, flags: this._flags.size};
    }
}

const defaultConfigFlag = new ConfigFlag();

module.exports = {
    ConfigFlag,
    create(options) {
        return new ConfigFlag(options);
    },
    set(name, value) {
        return defaultConfigFlag.set(name, value);
    },
    get(name, defaultValue) {
        return defaultConfigFlag.get(name, defaultValue);
    },
    isEnabled(name) {
        return defaultConfigFlag.isEnabled(name);
    },
    delete(name) {
        return defaultConfigFlag.delete(name);
    },
    list() {
        return defaultConfigFlag.list();
    },
    enable(name) {
        return defaultConfigFlag.enable(name);
    },
    disable(name) {
        return defaultConfigFlag.disable(name);
    },
    toggle(name) {
        return defaultConfigFlag.toggle(name);
    },
    getLayerStatus() {
        return defaultConfigFlag.getLayerStatus();
    },
    isOperationAllowed(operationType, context) {
        return defaultConfigFlag.isOperationAllowed(operationType, context);
    },
    getStatus() {
        return defaultConfigFlag.getStatus();
    }
};