/**
 * Shell - Command execution with full security chain (v0.8.6)
 * WITH EVENT EMISSIONS - command execution emits globally
 * 
 * SECURITY: Heavy protection layer
 * - VAF: Input validation + command injection prevention
 * - Sandbox: Capability gating (canExec)
 * - QoS: Rate limiting
 * - Escrow: Budget limiting
 * - Lock: Concurrent serialization
 * - Audit: All operations logged
 * - Limits: Timeout, allowed commands whitelist
 * 
 * Uses: vaf.js, sandbox.js, qos.js, escrow.js, lock.js, audit.js, sudo.js
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

const { spawn: cpSpawn } = require('child_process');
const path = require('path');
const vaf = require('./vaf');
const sudo = require('./sudo');
const audit = require('./audit');
const errors = require('./error');

// Current task context (settable for agent delegation)
let _currentTaskId = 'default';

// Get current task ID (context priority: explicit → runtime → agent → default)
function _getTaskId() {
    return _currentTaskId || 'default';
}

// Set current task ID (for agent delegation)
function setTaskId(taskId) {
    _currentTaskId = taskId;
    return { taskId: _currentTaskId };
}

// Get current task ID info
function getTaskId() {
    return _currentTaskId;
}

// Security: Sandbox
function _getSandbox() {
    let sb = global._sandbox;
    if (!sb) try { sb = global._sandbox = require('./sandbox'); } catch (e) {}
    return sb;
}

// Security: QoS
function _getQoS() {
    let qos = global._qos;
    if (!qos) try { qos = global._qos = require('./qos'); } catch (e) {}
    return qos;
}

// Security: Escrow
function _getEscrow() {
    let esc = global._escrow;
    if (!esc) try { esc = global._escrow = require('./escrow'); } catch (e) {}
    return esc;
}

// Security: Lock
function _getLock() {
    let lock = global._lock;
    if (!lock) try { lock = global._lock = require('./lock'); } catch (e) {}
    return lock;
}

// LIMITS - Prevent disasters
const DEFAULT_TIMEOUT = 30000;  // 30s default
const MAX_TIMEOUT = 120000;     // 2min max
const MAX_OUTPUT = 1024 * 1024; // 1MB output max

// DEFAULT ALLOWED COMMANDS - Base whitelist
const DEFAULT_ALLOWED_COMMANDS = new Set([
    'git', 'node', 'npm', 'npx', 'pnpm', 'yarn',
    'python', 'python3', 'pip',
    'cat', 'ls', 'pwd', 'echo', 'head', 'tail', 'grep', 'find', 'wc',
    'mkdir', 'rm', 'rmdir', 'cp', 'mv', 'touch', 'chmod', 'chown',
    'curl', 'wget',
    'docker', 'kubectl', 'helm',
    'vant', 'deno', 'bun'
]);

// Dynamic whitelist - can be updated at runtime
let _allowedCommands = null;

// Get allowed commands (config override or default)
function _getAllowedCommands() {
    if (_allowedCommands) return _allowedCommands;
    
    // Try config first
    let config = null;
    try { config = require('./config'); } catch (e) {}
    
    if (config && config.get) {
        const custom = config.get('shell.allowed');
        if (custom && Array.isArray(custom)) {
            _allowedCommands = new Set(custom);
            return _allowedCommands;
        }
    }
    
    _allowedCommands = new Set(DEFAULT_ALLOWED_COMMANDS);
    return _allowedCommands;
}

// Set allowed commands at runtime
function setAllowedCommands(commands) {
    _allowedCommands = new Set(commands);
    return { allowed: Array.from(_allowedCommands) };
}

// Get default commands
function getDefaultCommands() {
    return Array.from(DEFAULT_ALLOWED_COMMANDS);
}

// Get current commands
function getAllowedCommands() {
    return Array.from(_getAllowedCommands());
}

// ALLOWED COMMANDS - Backward compatibility alias
const ALLOWED_COMMANDS = {
    has: (cmd) => _getAllowedCommands().has(cmd),
    get size() { return _getAllowedCommands().size; },
    get [Symbol.iterator]() { return _getAllowedCommands()[Symbol.iterator]; }
};

// SECURITY HELPERS
function _validateCommand(cmd) {
    if (!cmd || typeof cmd !== 'string') throw new errors.Error('Invalid command', { code: errors.CODES.SHELL_EXEC_DENIED, retryable: false });
    
    // Get first word (command)
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0];
    
    // VAF sanitize
    const safe = vaf.sanitize(cmd);
    
    // SECURITY: Whitelist mode - only allow whitelisted commands OR explicitly safe ones
    if (!_getAllowedCommands().has(command)) {
        // Block all non-whitelisted commands by default (stricter security)
        throw new errors.Error('EDENIED: command not in whitelist', { code: errors.CODES.SHELL_EXEC_DENIED, retryable: false });
    }
    
    return safe;
}

function _checkTimeout(timeout) {
    const t = timeout || DEFAULT_TIMEOUT;
    if (t > MAX_TIMEOUT) throw new errors.Error('ETIMEOUT: max timeout exceeded', { code: errors.CODES.SHELL_EXEC_DENIED, retryable: false });
    return t;
}

function _audit(op, data) {
    try { audit?.log?.({ component: 'shell', op, data, time: Date.now() }); } catch (e) {}
}

/**
 * Execute shell command with full security chain
 */
async function exec(cmd, options = {}) {
    const sb = _getSandbox();
    const qos = _getQoS();
    const esc = _getEscrow();
    const lock = _getLock();
    
    // 1. Sudo: canExec?
    if (!sudo.can(_getTaskId() || 'default', 'exec')) {
        throw new errors.Error('EPERM: exec not allowed by sudo', { code: errors.CODES.SUDO_DENIED, retryable: false });
    }
    
    // 2. Sandbox: canExec (additional check)
    if (sb && typeof sb.can === 'function' && !sb.can('canExec')) {
        throw new errors.Error('EPERM: canExec not allowed by sandbox', { code: errors.CODES.SANDBOX_EXEC_DENIED, retryable: false });
    }
    
    // 2. QoS: rate limit
    const q = qos?.canProceed?.('exec');
    if (q === false) {
        throw new errors.Error('E429: rate limited', { code: errors.CODES.RATE_LIMIT_EXCEEDED, retryable: true });
    }
    
    // 3. Escrow: budget
    const budget = esc?.reserve?.('exec', 1) || 1;
    if (budget <= 0) {
        throw new errors.Error('EBUDGET: insufficient budget', { code: errors.CODES.SANDBOX_BUDGET_EXCEEDED, retryable: true });
    }
    
    // 4. Lock: serialize
    const release = await lock?.acquire?.('shell:exec');
    if (!release) {
        throw new errors.Error('ELOCK: could not acquire', { code: errors.CODES.LOCK_FAILED, retryable: true });
    }
    
    // Validate command
    const safeCmd = _validateCommand(cmd);
    _audit('exec', { cmd: safeCmd });
    
    // Check timeout
    const timeout = _checkTimeout(options.timeout);
    
    try {
        return new Promise((resolve, reject) => {
            const args = { 
                cwd: options.cwd || process.cwd(),
                env: { ...process.env, ...options.env },
                shell: false  // Don't use shell to prevent injection
            };
            
            // Parse command safely
            const parts = safeCmd.split(/\s+/);
            const bin = parts[0];
            const args2 = parts.slice(1);
            
            const child = cpSpawn(bin, args2, args);
            let stdout = '';
            let stderr = '';
            
            child.stdout?.on('data', d => {
                if (stdout.length + d.length > MAX_OUTPUT) {
                    child.kill();
                    reject(new Error('EOUTPUT: output too large'));
                    return;
                }
                stdout += d;
            });
            
            child.stderr?.on('data', d => stderr += d);
            
            const timer = setTimeout(() => {
                child.kill();
                reject(new Error('ETIMEOUT: command timed out'));
            }, timeout);
            
            child.on('close', code => {
                clearTimeout(timer);
                esc?.release?.('exec', 1);
                release?.();
                
                // EVENT: command executed
                _emit('shell:exec', { cmd: cmd.split(' ')[0], code, timestamp: Date.now() });
                
                resolve({ code, stdout, stderr });
            });
            
            child.on('error', err => {
                clearTimeout(timer);
                esc?.release?.('exec', 1);
                release?.();
                reject(err);
            });
        });
    } catch (e) {
        esc?.release?.('exec', 1);
        release?.();
        throw e;
    }
}

/**
 * Execute and capture output
 */
async function capture(cmd, options = {}) {
    const result = await exec(cmd, options);
    return result.stdout?.trim() || result.stderr?.trim() || '';
}

/**
 * Execute background command
 */
async function spawn(cmd, options = {}) {
    // Sandbox: canExec (base capability)  
    const sb = _getSandbox();
    
    // Sudo: canShell? (permission layer)
    if (!sudo.can(_getTaskId?.() || 'default', 'shell')) {
        throw new errors.Error('EPERM: shell not allowed by sudo', { code: errors.CODES.SUDO_DENIED, retryable: false });
    }
    if (sb && typeof sb.can === 'function' && !sb.can('canExec')) {
        throw new errors.Error('EPERM: canExec not allowed', { code: errors.CODES.SANDBOX_EXEC_DENIED, retryable: false });
    }
    
    const safeCmd = _validateCommand(cmd);
    _audit('spawn', { cmd: safeCmd });
    
    const args = { 
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        detached: true,
        shell: false
    };
    
    const parts = safeCmd.split(/\s+/);
    const child = cpSpawn(parts[0], parts.slice(1), args);
    child.unref();
    
    return { pid: child.pid, cmd: safeCmd };
}

module.exports = {
    // Core execution
    exec,
    spawn,
    capture,
    
    // Task context management
    setTaskId,
    getTaskId,
    _getTaskId,  // internal
    
    // Whitelist management
    setAllowedCommands,
    getAllowedCommands,
    getDefaultCommands,
    
    // Layer info
    getLayerStatus: () => ({ 
        name: 'Shell', 
        type: 'shell', 
        version: '0.8.6', 
        enabled: true, 
        secured: true,
        capabilities: ['exec', 'spawn', 'capture'],
        scopes: ['exec'],
        chain: ['sudo', 'sandbox', 'qos', 'escrow', 'lock', 'vaf', 'audit'],
        maxTimeout: MAX_TIMEOUT,
        defaultTimeout: DEFAULT_TIMEOUT
    }),
    getStatus: () => ({ enabled: true, taskId: _getTaskId(), allowed: getAllowedCommands() }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Shell', operation: op }),
    
    // Multibrain
    getBrainShellConfig,
    setBrainShellConfig,
    
    // Multibrain Stack
    getStackShellConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainShellConfigs = {};

function getBrainShellConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainShellConfigs[brainName] || { timeout: 30000 };
}

function setBrainShellConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainShellConfigs[brainName] = config;
    return true;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

function getStackShellConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };
    
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainShellConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}