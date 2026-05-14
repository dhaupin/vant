#!/usr/bin/env node
/**
 * Remote Module Unit Tests
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n🌐 REMOTE MODULE TESTS\n');

test('remote module loads', () => {
    const remote = require(path.join(ROOT, 'lib', 'remote'));
    return { success: !!remote };
});

test('remote has getProvider function', () => {
    const remote = require(path.join(ROOT, 'lib', 'remote'));
    return { success: typeof remote.getProvider === 'function' };
});

test('remote has detectProvider function', () => {
    const remote = require(path.join(ROOT, 'lib', 'remote'));
    return { success: typeof remote.detectProvider === 'function' };
});

test('remote has getAllProviders function', () => {
    const remote = require(path.join(ROOT, 'lib', 'remote'));
    return { success: typeof remote.getAllProviders === 'function' };
});

test('remote has GitHubProvider', () => {
    const remote = require(path.join(ROOT, 'lib', 'remote'));
    return { success: !!remote.GitHubProvider };
});

test('remote has GitLabProvider', () => {
    const remote = require(path.join(ROOT, 'lib', 'remote'));
    return { success: !!remote.GitLabProvider };
});

test('remote has BitbucketProvider', () => {
    const remote = require(path.join(ROOT, 'lib', 'remote'));
    return { success: !!remote.BitbucketProvider };
});

test('remote has GiteaProvider', () => {
    const remote = require(path.join(ROOT, 'lib', 'remote'));
    return { success: !!remote.GiteaProvider };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);