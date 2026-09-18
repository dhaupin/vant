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
     * Run a Python file
     */
    async run(scriptPath, args = []) {
        const result = await this.execute([scriptPath], { args });
        return result;
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