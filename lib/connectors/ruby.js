/**
 * Ruby Connector (v0.8.6)
 * Talk to Ruby from Vant via subprocess
 *
 * Usage:
 *   const compute = require('../../compute');
 *   const result = await compute.eval('puts 2 + 2', { lang: 'ruby' });
 */

const { BaseConnector } = require('./base');

class RubyConnector extends BaseConnector {
    constructor(options = {}) {
        super(options);
        this.lang = 'ruby';
    }

    getLang() {
        return 'ruby';
    }

    getCmd() {
        return this._options.ruby || 'ruby';
    }

    getArgs(codeOrFile) {
        return ['-e', codeOrFile];
    }

    /**
     * Convert function name + args to Ruby code
     */
    _funcToCode(func, args) {
        const [module, method] = func.split('.');

        if (module && method) {
            return `
require '${module}'
result = ${module}.${method}(${JSON.stringify(args)})
puts result
`.trim();
        }

        // Generic fallback
        return `${func}(${JSON.stringify(args)})`;
    }

    /**
     * Invoke a Ruby function
     */
    async invoke(func, args = {}) {
        const code = this._funcToCode(func, args);
        return await this.execute(code);
    }

    /**
     * Evaluate Ruby code
     */
    async eval(code, options = {}) {
        return await this.execute(code, options);
    }

    /**
     * Run a Ruby file.
     * (pass 168, pin-caught) Same array-into-execute rot as python.js:
     * `[scriptPath]` became `ruby -e ['/x.rb']`. Spawn script-mode directly.
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
                reject(new Error('ruby run timed out'));
            }, 30000);
            proc.on('close', code => {
                clearTimeout(timer);
                resolve({ code, stdout: stdout.trim(), stderr: stderr.trim(), success: code === 0 });
            });
            proc.on('error', err => { clearTimeout(timer); reject(err); });
        });
    }

    /**
     * Check Ruby availability
     */
    async ping() {
        try {
            const result = await this.execute('puts 1', { timeout: 5000 });
            return result.success;
        } catch (e) {
            return false;
        }
    }
}

module.exports = new RubyConnector();