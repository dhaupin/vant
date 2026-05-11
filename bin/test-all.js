#!/usr/bin/env node
/**
 * Vant Test Script - Comprehensive test suite
 * 
 * Usage: node bin/test-all.js
 *        node bin/test-all.js --json
 */

const { execSync } = require('child_process');
const path = require('path');

const BIN = path.join(__dirname, 'vant.js');

const results = {
    passed: [],
    failed: []
};

/**
 * Run a test command
 */
function test(name, cmd, check) {
    try {
        const out = execSync(`node ${BIN} ${cmd}`, { 
            encoding: 'utf8',
            timeout: 10000,
            cwd: path.dirname(__dirname)
        });
        
        if (check && !check(out)) {
            results.failed.push({ name, error: 'Check failed' });
            return false;
        }
        results.passed.push(name);
        return true;
    } catch (e) {
        results.failed.push({ name, error: e.message });
        return false;
    }
}

/**
 * Run MCP test
 */
function testMcp(name, url, check) {
    // Start MCP in background
    const mcpBin = path.join(__dirname, 'mcp.js');
    const mcp = execSync(`node ${mcpBin} &`, { 
        encoding: 'utf8',
        timeout: 5000,
        cwd: path.dirname(__dirname)
    });
    
    // Wait for server to start
    const http = require('http');
    
    return new Promise((resolve) => {
        setTimeout(() => {
            try {
                const req = http.get(url, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        if (check && !check(data)) {
                            results.failed.push({ name, error: 'Check failed' });
                            resolve(false);
                        } else {
                            results.passed.push(name);
                            resolve(true);
                        }
                    });
                });
                req.on('error', () => {
                    results.failed.push({ name, error: 'Connection failed' });
                    resolve(false);
                });
            } catch (e) {
                results.failed.push({ name, error: e.message });
                resolve(false);
            }
        }, 3000);
    });
}

// Run all tests
(async function main() {
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    
    console.log('╔═══════════════════════════════════════╗');
    console.log('║     Vant Comprehensive Test        ║');
    console.log('╚═══════════════════════════════════════╝\n');
    
    // Core commands
    console.log('Testing core commands...');
    test('health', 'health');
    test('load', 'load');
    test('summary', 'summary', out => out.includes('Messages'));
    test('succession', 'succession', out => out.includes('Version'));
    test('resolution status', 'resolution status', out => out.includes('Thought'));
    
    // Search modes
    console.log('Testing search modes...');
    test('search basic', 'search github --mode basic', out => out.includes('Results'));
    test('search rag', 'search github --mode rag', out => out.includes('Context'));
    test('search hybrid', 'search github', out => out.includes('Fused'));
    test('search hyde', 'search --hyde github', out => out.includes('HyDE'));
    test('search --stats', 'search --stats', out => out.includes('Stats'));
    
    // Brain management
    console.log('Testing brain management...');
    test('islands --status', 'islands --status', out => out.includes('Islands'));
    test('changelog', 'changelog', out => out.includes('Changelog'));
    
    // Config
    console.log('Testing config...');
    test('config get version', 'config get version');
    test('config set test value', 'config set test value');
    test('config get test', 'config get test');
    
    // Build tests
    console.log('Running build test...');
    test('test', 'test', out => out.includes('Build Test'));
    
    // Output results
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║          Test Results               ║');
    console.log('╚═══════════════════════════════════════╝\n');
    
    console.log(`✓ Passed: ${results.passed.length}`);
    for (const t of results.passed) {
        console.log(`  ✓ ${t}`);
    }
    
    if (results.failed.length > 0) {
        console.log(`\n✗ Failed: ${results.failed.length}`);
        for (const t of results.failed) {
            console.log(`  ✗ ${t.name}: ${t.error}`);
        }
    }
    
    console.log(`\nTotal: ${results.passed.length}/${results.passed.length + results.failed.length} passed`);
    
    process.exit(results.failed.length > 0 ? 1 : 0);
})();