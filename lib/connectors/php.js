/**
 * PHP Connector (v0.9.0)
 * Talk to PHP from Vant via subprocess
 *
 * Usage:
 *   const compute = require('../../compute');
 *   const result = await compute.eval('echo 2 + 2;', { lang: 'php' });
 */

const { BaseConnector } = require('./base');

class PHPConnector extends BaseConnector {
    constructor(options = {}) {
        super(options);
        this.lang = 'php';
    }
    
    getLang() {
        return 'php';
    }
    
    getCmd() {
        return this._options.php || 'php';
    }
    
    getArgs(codeOrFile) {
        return ['-r', codeOrFile];
    }
    
    /**
     * Convert function name + args to PHP code
     */
    _funcToCode(func, args) {
        const [module, method] = func.split('.');
        
        if (module && method) {
            return `
<?php
require_once '${module}.php';
$result = ${module}::${method}(${JSON.stringify(args)});
echo \$result;
`.trim();
        }
        
        // Generic fallback
        return `${func}(${JSON.stringify(args)});`;
    }
    
    /**
     * Invoke a PHP function
     */
    async invoke(func, args = {}) {
        const code = this._funcToCode(func, args);
        return await this.execute(code);
    }
    
    /**
     * Evaluate PHP code
     */
    async eval(code, options = {}) {
        // Wrap in <?php if missing
        if (!code.includes('<?php')) {
            code = '<?php\n' + code;
        }
        return await this.execute(code, options);
    }
    
    /**
     * Run a PHP file
     */
    async run(scriptPath, args = []) {
        const result = await this.execute([scriptPath], { args });
        return result;
    }
    
    /**
     * Check PHP availability
     */
    async ping() {
        try {
            const result = await this.execute('<?php echo 1;', { timeout: 5000 });
            return result.success;
        } catch (e) {
            return false;
        }
    }
}

module.exports = new PHPConnector();