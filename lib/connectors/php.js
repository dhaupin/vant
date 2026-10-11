/**
 * PHP Connector (v0.8.6)
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
     * Run a PHP file.
     * (pass 168, pin-caught) Same array-into-execute rot as python.js:
     * `[scriptPath]` landed inside the -r code arg. Spawn script-mode
     * directly (`php file.php args...`).
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
                reject(new Error('php run timed out'));
            }, 30000);
            proc.on('close', code => {
                clearTimeout(timer);
                resolve({ code, stdout: stdout.trim(), stderr: stderr.trim(), success: code === 0 });
            });
            proc.on('error', err => { clearTimeout(timer); reject(err); });
        });
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