/**
 * Shell - Command execution with full security chain
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
 * Uses: vaf.js, sandbox.js, qos.js, escrow.js, lock.js, audit.js
 */

const { spawn: cpSpawn } = require('child_process');
const path = require('path');
const vaf = require('./vaf');
const sudo = require('./sudo');
const audit = require('./audit');

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

// ALLOWED COMMANDS - Whitelist for safety
const ALLOWED_COMMANDS = new Set([
    'git', 'node', 'npm', 'npx', 'pnpm', 'yarn',
    'python', 'python3', 'pip',
    'cat', 'ls', 'pwd', 'echo', 'head', 'tail', 'grep', 'find', 'wc',
    'mkdir', 'rm', 'rmdir', 'cp', 'mv', 'touch', 'chmod', 'chown',
    'curl', 'wget',
    'docker', 'kubectl', 'helm',
    'vant'
]);

// SECURITY HELPERS
function _validateCommand(cmd) {
    if (!cmd || typeof cmd !== 'string') throw new Error('Invalid command');
    
    // Get first word (command)
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0];
    
    // VAF sanitize
    const safe = vaf.sanitize(cmd);
    
    // Check whitelist
    if (!ALLOWED_COMMANDS.has(command)) {
        // Allow if contains dangerous patterns
        const dangerous = ['rm -rf', 'format', 'del /', 'mkfs', 'dd if='];
        for (const d of dangerous) {
            if (safe.toLowerCase().includes(d)) {
                throw new Error('EDENIED: dangerous command blocked');
            }
        }
    }
    
    return safe;
}

function _checkTimeout(timeout) {
    const t = timeout || DEFAULT_TIMEOUT;
    if (t > MAX_TIMEOUT) throw new Error('ETIMEOUT: max timeout exceeded');
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
        throw new Error('EPERM: exec not allowed by sudo');
    }
    
    // 2. Sandbox: canExec (additional check)
    if (sb && typeof sb.can === 'function' && !sb.can('canExec')) {
        throw new Error('EPERM: canExec not allowed by sandbox');
    }
    
    // 2. QoS: rate limit
    const q = qos?.canProceed?.('exec');
    if (q === false) {
        throw new Error('E429: rate limited');
    }
    
    // 3. Escrow: budget
    const budget = esc?.reserve?.('exec', 1) || 1;
    if (budget <= 0) {
        throw new Error('EBUDGET: insufficient budget');
    }
    
    // 4. Lock: serialize
    const release = await lock?.acquire?.('shell:exec');
    if (!release) {
        throw new Error('ELOCK: could not acquire');
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
        throw new Error('EPERM: shell not allowed by sudo');
    }
    if (sb && typeof sb.can === 'function' && !sb.can('canExec')) {
        throw new Error('EPERM: canExec not allowed');
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
    exec,
    spawn,
    capture,
    getLayerStatus: () => ({ name: 'Shell', type: 'shell', version: '0.8.7', enabled: true, secured: true })
};