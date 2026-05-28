/**
 * Base Connector (v0.9.0)
 * Base class for language connectors in /lib/connectors/
 *
 * Extend this for your language:
 *   const { BaseConnector } = require('../compute');
 *
 *   class PythonConnector extends BaseConnector {
 *     getLang() { return 'python'; }
 *     getCmd() { return 'python'; }
 *     getArgs() { return ['-c', this.code]; }
 *   }
 */

const { spawn } = require('child_process');

class BaseConnector {
    constructor(options = {}) {
        this._options = options;
        this._startTime = Date.now();
        this.version = '0.9.0';
    }
    
    /**
     * Get language name - override in subclass
     */
    getLang() {
        return 'unknown';
    }
    
    /**
     * Get command to run - override in subclass
     * e.g., 'python', 'julia', 'cargo'
     */
    getCmd() {
        return this.getLang();
    }
    
    /**
     * Build arguments for subprocess - override in subclass
     */
    getArgs(codeOrFile) {
        return ['-c', codeOrFile];
    }
    
    /**
     * Called before execute - override for setup
     */
    async setup() {
        // Override for one-time setup (e.g., compile Rust)
    }
    
    /**
     * Execute code in subprocess
     */
    async execute(codeOrFile, options = {}) {
        const cmd = this.getCmd();
        const args = this.getArgs(codeOrFile);
        
        return new Promise((resolve, reject) => {
            const proc = spawn(cmd, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, ...this._options.env }
            });
            
            let stdout = '';
            let stderr = '';
            
            proc.stdout.on('data', d => stdout += d);
            proc.stderr.on('data', d => stderr += d);
            
            const timeout = options.timeout || 30000;
            const timer = setTimeout(() => {
                proc.kill();
                reject(new Error('Process timed out after ' + timeout + 'ms'));
            }, timeout);
            
            proc.on('close', code => {
                clearTimeout(timer);
                resolve({
                    code,
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    success: code === 0
                });
            });
            
            proc.on('error', err => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }
    
    /**
     * Invoke a function (by name) with args - override
     */
    async invoke(func, args = {}) {
        // Convert func + args to executable code
        // Override in subclass to implement
        const code = this._funcToCode(func, args);
        return await this.execute(code);
    }
    
    /**
     * Convert function + args to code - override
     */
    _funcToCode(func, args) {
        return `print("${func} not implemented")`;
    }
    
    /**
     * Evaluate raw code
     */
    async eval(code, options = {}) {
        return await this.execute(code, options);
    }
    
    /**
     * Run a script file
     */
    async run(scriptPath, args = []) {
        return await this.execute(scriptPath, { args });
    }
    
    /**
     * Check if language is available
     */
    async ping() {
        try {
            const result = await this.execute('print(1)', { timeout: 5000 });
            return result.success;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * Get status
     */
    getStatus() {
        return {
            lang: this.getLang(),
            version: this.version,
            available: this.ping()
        };
    }
}

module.exports = {
    BaseConnector
};