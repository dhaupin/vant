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
     * Invoke a function with args - runs in VM for isolation
     */
    async invoke(func, args = {}) {
        // Build sandbox context with result capture
        const code = this._funcToCode(func, args);

        return new Promise((resolve) => {
            try {
                // Shared result object
                const result = { captured: null, logged: [] };

                const sandbox = {
                    console: {
                        log: (...args) => result.logged.push(args.join(' ')),
                        error: (...args) => result.logged.push('ERROR: ' + args.join(' '))
                    }
                };

                const vmResult = vm.runInNewContext(code, sandbox, { timeout: 5000 });
                result.captured = vmResult;

                // Return logged output OR captured result
                const output = result.logged.length > 0
                    ? result.logged.join('\n')
                    : String(result.captured);

                resolve({ stdout: output, success: true });
            } catch (e) {
                resolve({ stderr: e.message, success: false });
            }
        });
    }

    /**
     * Evaluate code in VM
     */
    async eval(code, options = {}) {
        return new Promise((resolve) => {
            try {
                // Capture console.log output
                let output = '';
                const fakeConsole = {
                    log: (...args) => { output += args.join(' ') + '\n'; },
                    error: (...args) => { output += 'ERROR: ' + args.join(' ') + '\n'; },
                    warn: (...args) => { output += 'WARN: ' + args.join(' ') + '\n'; }
                };

                const result = vm.runInNewContext(code, { console: fakeConsole });

                resolve({
                    stdout: output || String(result),
                    success: true
                });
            } catch (e) {
                resolve({ stderr: e.message, success: false });
            }
        });
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