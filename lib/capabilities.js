/**
 * Vant Capabilities (v0.8.7)
 * WITH EVENT EMISSIONS - capability checks emit globally
 * Runtime capability introspection + governance
 *
 * Usage:
 *   const caps = require('./capabilities');
 *   caps.can('read');     // Check if can read
 *   caps.list();       // List all capabilities
 *   caps.enable('write'); // Enable capability
 *   caps.disable('network'); // Disable capability
 */

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

// Capability definitions
const _capabilities = new Map();

// Default capability matrix
const DEFAULT_CAPABILITIES = {
    read: {
        enabled: true,
        description: 'Read from brain/storage',
        risk: 'low'
    },
    write: {
        enabled: true,
        description: 'Write to brain/storage',
        risk: 'medium'
    },
    delete: {
        enabled: true,
        description: 'Delete from storage',
        risk: 'high'
    },
    network: {
        enabled: true,
        description: 'Make network calls',
        risk: 'high'
    },
    exec: {
        enabled: false,
        description: 'Execute commands',
        risk: 'critical'
    },
    sandbox: {
        enabled: true,
        description: 'Access sandbox layer',
        risk: 'low'
    },
    mcp: {
        enabled: true,
        description: 'MCP tool access',
        risk: 'medium'
    },
    github: {
        enabled: true,
        description: 'GitHub API access',
        risk: 'medium'
    },
    linear: {
        enabled: true,
        description: 'Linear API access',
        risk: 'medium'
    },
    slack: {
        enabled: true,
        description: 'Slack API access',
        risk: 'medium'
    },
    telegram: {
        enabled: true,
        description: 'Telegram bot access',
        risk: 'medium'
    },
    docker: {
        enabled: false,
        description: 'Docker operations',
        risk: 'critical'
    },
    ssh: {
        enabled: false,
        description: 'SSH connections',
        risk: 'critical'
    },
    fork: {
        enabled: false,
        description: 'Fork processes',
        risk: 'critical'
    },
    eval: {
        enabled: false,
        description: 'Eval code',
        risk: 'critical'
    }
};

// Initialize defaults
for (const [name, def] of Object.entries(DEFAULT_CAPABILITIES)) {
    _capabilities.set(name, { ...def });
}

/**
 * Check if capability is enabled
 * @param {string} name - Capability name
 * @returns {boolean}
 */
function can(name) {
    const cap = _capabilities.get(name);
    const enabled = cap?.enabled ?? false;
    
    // EVENT: capability checked
    _emit('capability:check', { 
        name, 
        allowed: enabled,
        timestamp: Date.now() 
    });
    
    return enabled;
}

/**
 * Get capability definition
 * @param {string} name - Capability name
 * @returns {object}
 */
function get(name) {
    return _capabilities.get(name);
}

/**
 * List all capabilities
 * @returns {array}
 */
function list() {
    const result = [];
    for (const [name, def] of _capabilities) {
        result.push({ name, ...def });
    }
    return result;
}

/**
 * Enable a capability
 * @param {string} name - Capability name
 */
function enable(name) {
    const cap = _capabilities.get(name);
    if (cap) {
        cap.enabled = true;
        _capabilities.set(name, cap);
        
        // EVENT: capability enabled
        _emit('capability:enabled', { 
            name, 
            risk: cap.risk,
            timestamp: Date.now() 
        });
    }
}

/**
 * Disable a capability
 * @param {string} name - Capability name
 */
function disable(name) {
    const cap = _capabilities.get(name);
    if (cap) {
        cap.enabled = false;
        _capabilities.set(name, cap);
        
        // EVENT: capability disabled
        _emit('capability:disabled', { 
            name, 
            risk: cap.risk,
            timestamp: Date.now() 
        });
    }
}

/**
 * Set capability
 * @param {string} name - Capability name
 * @param {boolean} enabled - Enabled state
 * @param {string} description - Optional description
 */
function set(name, enabled, description = null) {
    const existing = _capabilities.get(name);
    if (existing) {
        existing.enabled = enabled;
        if (description) existing.description = description;
        _capabilities.set(name, existing);
    } else {
        _capabilities.set(name, { 
            enabled, 
            description: description || 'Custom capability',
            risk: 'medium'
        });
    }
    
    // EVENT: capability set
    _emit('capability:set', { 
        name, 
        enabled,
        timestamp: Date.now() 
    });
}

/**
 * Get capabilities by risk level
 * @param {string} risk - 'low' | 'medium' | 'high' | 'critical'
 * @returns {array}
 */
function getByRisk(risk) {
    const result = [];
    for (const [name, def] of _capabilities) {
        if (def.risk === risk) {
            result.push({ name, ...def });
        }
    }
    return result;
}

/**
 * Get all enabled capabilities
 * @returns {array}
 */
function getEnabled() {
    const result = [];
    for (const [name, def] of _capabilities) {
        if (def.enabled) {
            result.push(name);
        }
    }
    return result;
}

/**
 * Get security summary
 */
function getSecuritySummary() {
    return {
        total: _capabilities.size,
        enabled: getEnabled().length,
        disabled: _capabilities.size - getEnabled().length,
        byRisk: {
            critical: getByRisk('critical').filter(c => c.enabled).length,
            high: getByRisk('high').filter(c => c.enabled).length,
            medium: getByRisk('medium').filter(c => c.enabled).length,
            low: getByRisk('low').filter(c => c.enabled).length
        }
    };
}

module.exports = {
    can,
    get,
    list,
    enable,
    disable,
    set,
    getByRisk,
    getEnabled,
    getSecuritySummary,
    DEFAULT_CAPABILITIES
};