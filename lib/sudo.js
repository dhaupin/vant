/**
 * Sudo - Permission layer for runtime (like Linux sudo)
 * 
 * Controls agent permissions, command execution, delegation
 * - Who can execute what
 * - What commands are allowed
 * - Delegation chains
 * - User/agent capabilities
 * 
 * Similar to Linux sudo but for agent runtime.
 */

const fs = require('fs');
const path = require('path');

// State
let _permissions = new Map();
let _users = new Map();
let _commands = new Set();
let _locked = false;

// Default config
const DEFAULT_CONFIG = {
    allowShell: false,        // Shell execution off by default
    allowExec: false,        // Command exec off by default  
    allowDelegate: false,     // Delegation off by default
    allowTmp: false,         // tmp access off by default
    maxBudget: 100,          // Default budget
    timeout: 30000          // Default 30s timeout
};

/**
 * Initialize sudo config
 */
function init(config = {}) {
    _permissions = new Map();
    _users = new Map();
    _commands = new Set();
    _locked = false;
    
    const cfg = { ...DEFAULT_CONFIG, ...config };
    
    // Set defaults for 'root' agent
    _users.set('root', {
        allowShell: cfg.allowShell,
        allowExec: cfg.allowExec,
        allowDelegate: cfg.allowDelegate,
        allowTmp: cfg.allowTmp,
        maxBudget: cfg.maxBudget,
        timeout: cfg.timeout
    });
    
    return { initialized: true, config: cfg };
}

/**
 * Add user/agent
 */
function addUser(name, config = {}) {
    if (_locked) throw new Error('ELOCKED: sudo is locked');
    
    const parent = _users.get(config.as || 'root');
    _users.set(name, {
        allowShell: config.allowShell ?? parent?.allowShell ?? false,
        allowExec: config.allowExec ?? parent?.allowExec ?? false,
        allowDelegate: config.allowDelegate ?? parent?.allowDelegate ?? false,
        allowTmp: config.allowTmp ?? parent?.allowTmp ?? false,
        maxBudget: config.maxBudget ?? parent?.maxBudget ?? 100,
        timeout: config.timeout ?? parent?.timeout ?? 30000
    });
    
    return { user: name };
}

/**
 * Remove user/agent
 */
function removeUser(name) {
    if (_locked) throw new Error('ELOCKED: sudo is locked');
    if (name === 'root') throw new Error('ECANT: cannot remove root');
    _users.delete(name);
    return { removed: name };
}

/**
 * Check if agent can do action
 */
function can(agent, action) {
    const user = _users.get(agent);
    if (!user) return false;
    
    switch (action) {
        case 'shell': return user.allowShell;
        case 'exec': return user.allowExec;
        case 'delegate': return user.allowDelegate;
        case 'tmp': return user.allowTmp;
        default: return false;
    }
}

/**
 * Get agent config
 */
function getConfig(agent) {
    return _users.get(agent) || null;
}

/**
 * Allow command
 */
function allowCommand(cmd) {
    if (_locked) throw new Error('ELOCKED: sudo is locked');
    _commands.add(cmd);
    return { allowed: cmd };
}

/**
 * Block command
 */
function blockCommand(cmd) {
    if (_locked) throw new Error('ELOCKED: sudo is locked');
    _commands.delete(cmd);
    return { blocked: cmd };
}

/**
 * Check command allowed
 */
function canRun(cmd) {
    if (_commands.size === 0) return true;  // Nothing allowed = all allowed
    return _commands.has(cmd);
}

/**
 * Lock sudo (make read-only)
 */
function lock() {
    _locked = true;
    return { locked: true };
}

/**
 * Unlock sudo
 */
function unlock() {
    _locked = false;
    return { unlocked: true };
}

/**
 * Is locked
 */
function isLocked() {
    return _locked;
}

/**
 * List users
 */
function listUsers() {
    return { users: Array.from(_users.keys()) };
}

/**
 * List allowed commands
 */
function listCommands() {
    return { commands: Array.from(_commands) };
}

/**
 * Reset
 */
function reset() {
    _permissions = new Map();
    _users = new Map();
    _commands = new Set();
    _locked = false;
    return { reset: true };
}

module.exports = {
    init,
    addUser,
    removeUser,
    can,
    getConfig,
    allowCommand,
    blockCommand,
    canRun,
    lock,
    unlock,
    isLocked,
    listUsers,
    listCommands,
    reset,
    getLayerStatus: () => ({ name: 'Sudo', type: 'sudo', version: '0.8.7', enabled: true })
};