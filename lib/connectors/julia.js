/**
 * Julia Connector (v0.8.6)
 * Talk to Julia from Vant via subprocess
 *
 * Usage:
 *   const compute = require('../../compute');
 *   const result = await compute.eval('println(2 + 2)', { lang: 'julia' });
 *   console.log(result.stdout);  // "4"
 */

const { BaseConnector } = require('./base');

class JuliaConnector extends BaseConnector {
    constructor(options = {}) {
        super(options);
        this.lang = 'julia';
    }

    getLang() {
        return 'julia';
    }

    getCmd() {
        return this._options.julia || 'julia';
    }

    getArgs(codeOrFile) {
        return ['-e', codeOrFile];
    }

    /**
     * Convert function name + args to Julia code
     */
    _funcToCode(func, args) {
        const [module, method] = func.split('.');

        if (module && method) {
            return `
using ${module}
result = ${method}(${JSON.stringify(args)})
println(result)
`.trim();
        }

        // Generic fallback
        return `
result = ${func}(${JSON.stringify(args)})
println(result)
`.trim();
    }

    /**
     * Invoke a Julia function
     */
    async invoke(func, args = {}) {
        const code = this._funcToCode(func, args);
        return await this.execute(code);
    }

    /**
     * Evaluate Julia code
     */
    async eval(code, options = {}) {
        return await this.execute(code, options);
    }

    /**
     * Run a Julia file.
     * (pass 168, pin-caught) This used to return the raw child process
     * handle ({ proc }) without awaiting output — callers got a half-baked
     * spawn, never a result shape. Now the standard { code, stdout, stderr,
     * success } contract like every other connector.
     */
    async run(scriptPath, args = []) {
        const { spawn } = require('child_process');
        return new Promise((resolve, reject) => {
            const proc = spawn(this.getCmd(), [scriptPath, ...args], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, ...this._options.env }
            });
            let stdout = '', stderr = '';
            proc.stdout.on('data', d => stdout += d);
            proc.stderr.on('data', d => stderr += d);
            const timer = setTimeout(() => {
                proc.kill();
                reject(new Error('julia run timed out'));
            }, 30000);
            proc.on('close', code => {
                clearTimeout(timer);
                resolve({ code, stdout: stdout.trim(), stderr: stderr.trim(), success: code === 0 });
            });
            proc.on('error', err => { clearTimeout(timer); reject(err); });
        });
    }

    /**
     * Check Julia availability
     */
    async ping() {
        try {
            const result = await this.execute('println(1)', { timeout: 5000 });
            return result.success;
        } catch (e) {
            return false;
        }
    }
}

module.exports = new JuliaConnector();