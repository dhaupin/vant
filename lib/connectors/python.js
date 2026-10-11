/**
 * Python Connector (v0.8.6)
 * Talk to Python from Vant via subprocess
 *
 * Usage:
 *   const compute = require('../../compute');
 *   const result = await compute.eval('print(2 + 2)', { lang: 'python' });
 *   console.log(result.stdout);  // "4"
 */

const { BaseConnector } = require('./base');

class PythonConnector extends BaseConnector {
    constructor(options = {}) {
        super(options);
        this.lang = 'python';
    }

    getLang() {
        return 'python';
    }

    getCmd() {
        // Allow configured Python path or default
        return this._options.python || 'python3';
    }

    getArgs(codeOrFile) {
        return ['-c', codeOrFile];
    }

    /**
     * Convert function name + args to Python code
     */
    _funcToCode(func, args) {
        // Common function shortcuts
        const shortcuts = {
            'numpy.linalg.eig': 'import numpy as np; np.linalg.eig(args)',
            'numpy.linalg.svd': 'import numpy as np; np.linalg.svd(args)',
            'json.dump': 'import json; json.dump(args)',
            'json.load': 'import json; json.load(args)'
        };

        if (shortcuts[func]) {
            return shortcuts[func].replace('args', JSON.stringify(args));
        }

        // Generic: try as module.function
        const [module, method] = func.split('.');

        if (module && method) {
            return `
import ${module};
result = ${module}.${method}(${JSON.stringify(args)});
print(result)
`.trim();
        }

        // Fallback: just try to call it
        return `
result = ${func}(${JSON.stringify(args)});
print(result)
`.trim();
    }

    /**
     * Invoke a Python function
     */
    async invoke(func, args = {}) {
        const code = this._funcToCode(func, args);
        return await this.execute(code);
    }

    /**
     * Evaluate Python code
     */
    async eval(code, options = {}) {
        return await this.execute(code, options);
    }

    /**
     * Run a Python file.
     * (pass 168, pin-caught) This used to pass an ARRAY [scriptPath] into
     * execute() as codeOrFile, so getArgs produced `python3 -c
     * ['/tmp/x.py']` — a guaranteed SyntaxError. File mode never worked.
     * Spawn script-mode args directly instead.
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
                reject(new Error('python run timed out'));
            }, 30000);
            proc.on('close', code => {
                clearTimeout(timer);
                resolve({ code, stdout: stdout.trim(), stderr: stderr.trim(), success: code === 0 });
            });
            proc.on('error', err => { clearTimeout(timer); reject(err); });
        });
    }

    /**
     * Check Python availability
     */
    async ping() {
        try {
            const result = await this.execute('print(1)', { timeout: 5000 });
            return result.success;
        } catch (e) {
            return false;
        }
    }
}

module.exports = new PythonConnector();