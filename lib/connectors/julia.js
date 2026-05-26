/**
 * Julia Connector (v0.9.0)
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
     * Run a Julia file
     */
    async run(scriptPath, args = []) {
        const proc = require('child_process').spawn(this.getCmd(), [scriptPath, ...args]);
        // Simplified - just return
        return { proc };
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