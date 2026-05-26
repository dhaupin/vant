/**
 * Go Connector (v0.9.0)
 * Talk to Go from Vant via compiled subprocess
 *
 * Usage:
 *   const compute = require('../../compute');
 *   const result = await compute.eval('fmt.Println(2 + 2)', { lang: 'go' });
 */

const { BaseConnector } = require('./base');

class GoConnector extends BaseConnector {
    constructor(options = {}) {
        super(options);
        this.lang = 'go';
    }
    
    getLang() {
        return 'go';
    }
    
    getCmd() {
        return 'go';
    }
    
    getArgs(codeOrFile) {
        return ['run', codeOrFile];
    }
    
    /**
     * Convert function name + args to Go code
     */
    _funcToCode(func, args) {
        // Simple wrapper - more sophisticated with gotmpl later
        const importMap = {
            'fmt': 'fmt',
            'json': 'encoding/json',
            'math': 'math',
            'strings': 'strings',
            'time': 'time'
        };
        
        const [module, method] = func.split('.');
        const imp = importMap[module] || module;
        
        if (!imp) {
            return `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("${func} not implemented")\n}`;
        }
        
        return `
package main

import (
	"${imp}"
	"fmt"
)

func main() {
	result := ${module}.${method}(${JSON.stringify(args)})
	fmt.Println(result)
}`.trim();
    }
    
    /**
     * Invoke a Go function
     */
    async invoke(func, args = {}) {
        const code = 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("' + func + '(' + JSON.stringify(args) + ')")\n}';
        return await this.execute(code);
    }
    
    /**
     * Evaluate Go code - wraps in main if needed
     */
    async eval(code, options = {}) {
        // Wrap bare code in package main if not already wrapped
        if (!code.includes('package main')) {
            code = 'package main\n\nimport "fmt"\n\nfunc main() {\n\t' + code.replace(/\n/g, '\n\t') + '\n}';
        }
        return await this.execute(code, options);
    }
    
    /**
     * Run a Go file
     */
    async run(scriptPath, args = []) {
        return await this.execute(scriptPath, { args: ['run', ...args] });
    }
    
    /**
     * Check Go availability
     */
    async ping() {
        try {
            const result = await this.execute('package main\n\nfunc main() {}\n', { timeout: 5000 });
            return result.success;
        } catch (e) {
            return false;
        }
    }
}

module.exports = new GoConnector();