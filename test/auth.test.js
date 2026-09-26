#!/usr/bin/env node
/**
 * Auth Module Unit Tests
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

console.log('\n🔑 AUTH MODULE TESTS\n');

test('auth module loads', () => {
    const auth = require(path.join(ROOT, 'lib', 'auth'));
    return { success: !!auth };
});

test('auth has Auth class', () => {
    const auth = require(path.join(ROOT, 'lib', 'auth'));
    return { success: !!auth.Auth };
});

test('auth is object', () => {
    const auth = require(path.join(ROOT, 'lib', 'auth'));
    return { success: typeof auth === 'object' };
});

// Auth validation tests
// Note: Auth uses config.apiKey() - set VANT_API_KEY env to test with keys
const { Auth } = require(path.join(ROOT, 'lib', 'auth'));
const originalApiKey = process.env.VANT_API_KEY;

test('Auth has validateApiKey method', () => {
    const auth = new Auth();
    return { success: typeof auth.validateApiKey === 'function' };
});

test('validateApiKey allows when no key configured', () => {
    delete process.env.VANT_API_KEY;
    delete process.env.MCP_API_KEY;
    const auth = new Auth();
    const result = auth.validateApiKey('any-key');
    return { success: result.valid === true };
});

test('validateApiKey rejects invalid key when configured', () => {
    process.env.VANT_API_KEY = 'secret123';
    const auth = new Auth();
    const result = auth.validateApiKey('wrong-key');
    return { success: result.valid === false && result.reason === 'invalid_api_key' };
});

test('validateApiKey accepts correct key', () => {
    process.env.VANT_API_KEY = 'secret123';
    const auth = new Auth();
    const result = auth.validateApiKey('secret123');
    return { success: result.valid === true && result.reason === 'ok' };
});

test('validateApiKey rejects when no key provided but required', () => {
    process.env.VANT_API_KEY = 'secret123';
    const auth = new Auth();
    const result = auth.validateApiKey(null);
    return { success: result.valid === false && result.reason === 'no_api_key_provided' };
});

// Restore env
if (originalApiKey) process.env.VANT_API_KEY = originalApiKey;
else delete process.env.VANT_API_KEY;

test('recordFailedAttempt increments count', () => {
    const auth = new Auth({ maxAttempts: 3 });
    const id = 'test-identifier-' + Date.now();
    auth.recordFailedAttempt(id);
    const state = auth._failedAttempts.get(id);
    return { success: state && state.count === 1 };
});

test('recordFailedAttempt triggers lockout after max attempts', () => {
    const auth = new Auth({ maxAttempts: 2, lockoutDuration: 1000 });
    const id = 'test-lockout-' + Date.now();
    auth.recordFailedAttempt(id);
    auth.recordFailedAttempt(id);
    const result = auth.recordFailedAttempt(id);
    return { success: result.locked === true && result.until > Date.now() };
});

// Stack tests
test('auth has getStackAuthStatus function', () => {
    const auth = require(path.join(ROOT, 'lib', 'auth'));
    return { success: typeof auth.getStackAuthStatus === 'function' };
});

test('getStackAuthStatus returns object with source stack', () => {
    const auth = require(path.join(ROOT, 'lib', 'auth'));
    const result = auth.getStackAuthStatus();
    return { success: result && result.source === 'stack' };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);