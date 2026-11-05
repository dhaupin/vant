/**
 * Node Connector (v0.8.6)
 * Run Node.js code from Vant
 *
 * Usage:
 *   const compute = require('../../compute');
 *   const result = await compute.eval('console.log(2 + 2)', { lang: 'node' });
 *   console.log(result.stdout);  // "4"
 *
 * Note: This is a light wrapper - most Vant code runs directly via require().
 * This is for running isolated code snippets safely via VM.
 */

const { BaseConnector } = require('./base');
const vm = require('vm');

class NodeConnector extends BaseConnector {
    constructor(options = {}) {
        super(options);
        this.lang = 'node';
    }

    getLang() {
        return 'node';
    }

    getCmd() {
        return 'node';
    }

    /**
     * Convert function call to code
     */
    _funcToCode(func, args) {
        const argStr = JSON.stringify(args);
        return `${func}(${argStr})`;
    }

    /**
     * Run untrusted code inside a hardened vm context.
     *
     * The context root is a NULL-PROTOTYPE object and no host objects are
     * injected; console lives INSIDE the context. `codeGeneration` is
     * disabled so `Function`/`eval` cannot mint code, and because nothing
     * from the host realm is reachable, the classic escape
     * `this.constructor.constructor('return process')()` cannot reach the
     * host Function constructor (pinned in tests/audit-round4.test.js). A
     * timeout bounds runaway loops.
     */
    _runIsolated(code, timeout = 5000) {
        const context = vm.createContext(Object.create(null), {
            codeGeneration: { strings: false, wasm: false }
        });
        vm.runInContext(`
            var __log = [];
            var console = {
                log: function(){ __log.push(Array.prototype.slice.call(arguments).map(String).join(' ')); },
                error: function(){ __log.push('ERROR: ' + Array.prototype.slice.call(arguments).map(String).join(' ')); },
                warn: function(){ __log.push('WARN: ' + Array.prototype.slice.call(arguments).map(String).join(' ')); }
            };
        `, context, { timeout: 1000 });
        const readLog = () => {
            try { return vm.runInContext('__log.join("\\n")', context, { timeout: 1000 }); }
            catch (_e) { return ''; }
        };
        try {
            const ret = vm.runInContext(code, context, { timeout, filename: 'vant:compute:node' });
            return { stdout: readLog() || String(ret), success: true };
        } catch (e) {
            const logged = readLog();
            return { stderr: (logged ? logged + '\n' : '') + e.message, success: false };
        }
    }

    /**
     * Invoke a function with args - runs in VM for isolation
     */
    async invoke(func, args = {}) {
        return this._runIsolated(this._funcToCode(func, args), 5000);
    }

    /**
     * Evaluate code in VM
     */
    async eval(code, options = {}) {
        return this._runIsolated(code, options.timeout || 5000);
    }

    /**
     * Run a Node script file
     */
    async run(scriptPath, args = []) {
        const { spawn } = require('child_process');

        return new Promise((resolve, reject) => {
            const proc = spawn('node', [scriptPath, ...args]);

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', d => stdout += d);
            proc.stderr.on('data', d => stderr += d);

            proc.on('close', code => {
                resolve({ code, stdout: stdout.trim(), stderr: stderr.trim(), success: code === 0 });
            });

            proc.on('error', reject);
        });
    }

    /**
     * Check Node availability
     */
    async ping() {
        return true; // We're running on Node!
    }
}

module.exports = new NodeConnector();