#!/usr/bin/env node
/**
 * Vant Comprehensive Test Suite
 */
const { execSync } = require('child_process');
const path = require('path');

const results = { passed: [], failed: [] };
const LIB = path.resolve('./lib');

function test(name, cmd, check) {
    try {
        if (typeof check === 'function') {
            // Pass output to check function
            const out = execSync('node ./bin/vant.js ' + cmd, { encoding: 'utf8', timeout: 10000 });
            const r = check(out);
            r ? results.passed.push(name) : results.failed.push({ name, error: 'check' });
            return;
        }
        const out = execSync('node ./bin/vant.js ' + cmd, { encoding: 'utf8', timeout: 10000 });
        if (!out.includes('Vant')) {  // Simple check
            results.failed.push({ name, error: 'output' });
            return;
        }
        results.passed.push(name);
    } catch (e) {
        results.failed.push({ name, error: e.message.slice(0,30) });
    }
}

async function main() {
    console.log('=== Vant Comprehensive Test ===\n');
    test('health', 'health', o => o.includes('Vant'));
    test('load', 'load', o => o.includes('Model'));
    test('summary', 'summary', o => o.includes('Session'));
    test('search basic', 'search github --mode basic', o => o.includes('Results'));
    test('search rag', 'search github --mode rag', o => o.includes('Context'));
    test('search hybrid', 'search github', o => o.includes('Fused'));
    test('search hyde', 'search --hyde github', o => o.includes('HyDE'));
    test('search stats', 'search --stats', o => o.includes('corpus'));
    test('islands', 'islands --status', o => o.includes('Islands'));
    test('changelog', 'changelog', o => o.includes('Changelog'));
    test('test', 'test', o => o.includes('Build'));
    test('lib config', '', () => typeof require(path.join(LIB, 'config')).get === 'function');
    test('lib branch', '', () => typeof require(path.join(LIB, 'branch')).listBranches === 'function');
    test('lib audit', '', () => typeof require(path.join(LIB, 'audit')).log === 'function');
    test('lib search', '', () => typeof require(path.join(LIB, 'search')).queryBrain === 'function');
    test('lib islands', '', () => typeof require(path.join(LIB, 'islands')).getStatus === 'function');
    test('lib cache', '', () => typeof require(path.join(LIB, 'cache')).get === 'function');
    console.log('\n=== Results ===');
    console.log('Passed: ' + results.passed.length + '/' + (results.passed.length + results.failed.length));
    for (const t of results.passed) console.log('  ✓ ' + t);
    if (results.failed.length) {
        console.log('\nFailed: ' + results.failed.length);
        for (const t of results.failed) console.log('  ✗ ' + t.name + ': ' + t.error);
    }
    process.exit(results.failed.length ? 1 : 0);
}
main();
