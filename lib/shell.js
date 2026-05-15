/**
 * Shell - Command execution with full security chain
 * 
 * Gates: Sandbox → QoS → Escrow → Lock
 * Uses existing: sandbox.js, qos.js, escrow.js, lock.js
 */

const { spawn: cpSpawn } = require('child_process');

// Sandbox for capability checks
function _getSandbox() {
    let sb = global._sandbox;
    if (!sb) try { sb = global._sandbox = require('./sandbox'); } catch (e) {}
    return sb;
}

// QoS for rate limiting
function _getQoS() {
    let qos = global._qos;
    if (!qos) try { qos = global._qos = require('./qos'); } catch (e) {}
    return qos;
}

// Escrow for budget
function _getEscrow() {
    let esc = global._escrow;
    if (!esc) try { esc = global._escrow = require('./escrow'); } catch (e) {}
    return esc;
}

// Lock for concurrent execution
function _getLock() {
    let lock = global._lock;
    if (!lock) try { lock = global._lock = require('./lock'); } catch (e) {}
    return lock;
}

/**
 * Execute shell command with full security chain
 * @param {string} cmd - Command to execute
 * @param {object} options - { cwd, timeout, env }
 */
async function exec(cmd, options = {}) {
    const sb = _getSandbox();
    const qos = _getQoS();
    const esc = _getEscrow();
    const lock = _getLock();
    
    // 1. Sandbox: canExec?
    if (sb && typeof sb.can === 'function' && !sb.can('canExec')) {
        throw new Error('EPERM: canExec not allowed');
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
    
    // 4. Lock: serialize - must acquire before proceeding
    const release = await lock?.acquire?.('shell:exec');
    if (!release) {
        throw new Error('ELOCK: could not acquire shell lock');
    }
    
    try {
        // Execute via Node child_process
        return new Promise((resolve, reject) => {
            const args = { 
                cwd: options.cwd || process.cwd(),
                env: { ...process.env, ...options.env },
                shell: true 
            };
            
            const child = cpSpawn(cmd, [], args);
            let stdout = '';
            let stderr = '';
            
            child.stdout?.on('data', d => stdout += d);
            child.stderr?.on('data', d => stderr += d);
            
            const timeout = options.timeout || 30000;
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
 * Execute background command
 */
async function spawn(cmd, options = {}) {
    const sb = _getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canExec')) {
        throw new Error('EPERM: canExec not allowed');
    }
    
    const args = { 
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        detached: true,
        shell: true 
    };
    
    const child = cpSpawn(cmd, [], args);
    child.unref();
    
    return { pid: child.pid, cmd };
}

/**
 * Execute and capture output
 */
async function capture(cmd, options = {}) {
    const result = await exec(cmd, options);
    return result.stdout?.trim() || result.stderr?.trim() || '';
}

module.exports = {
    exec,
    spawn,
    capture,
    getLayerStatus: () => ({ name: 'Shell', type: 'shell', version: '0.8.7', enabled: true })
};