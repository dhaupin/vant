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

// ============================================
// ISSUE #188-A2: transport credential compare is timing-safe
// ============================================
// The observable API contract is UNCHANGED (same verdicts); the pin is
// that comparisons behave identically across key shapes including
// length-mismatch and multi-block inputs, and that a prefix key is NOT
// accepted (a raw string-compare `===` would also reject it, so the real
// regression teeth are the verdict identity tests plus the code review
// gate in lint:helpers; here we assert the verdicts + rejection of
// prefix/suffix probes).

console.log('\n🔐 #188-A2 TIMING-SAFE COMPARE VERDICTS\n');

test('A2: valid key accepted, prefix/suffix probes rejected (padding does not loosen)', () => {
    process.env.VANT_API_KEY = 'timing-safe-secret-42';
    const auth = new Auth();
    const ok = auth.validateApiKey('timing-safe-secret-42').valid === true;
    const prefix = auth.validateApiKey('timing').valid === false;
    const suffix = auth.validateApiKey('42').valid === false;
    const pad = auth.validateApiKey('timing-safe-secret-42\u0000').valid === false;
    return { success: ok && prefix && suffix && pad,
        error: 'ok=' + ok + ' prefix=' + prefix + ' suffix=' + suffix + ' pad=' + pad };
});

test('A2: non-string garbage answers (no throw) not valid', () => {
    process.env.VANT_API_KEY = 'timing-safe-secret-42';
    const auth = new Auth();
    let threw = null;
    let verdict = null;
    try { verdict = auth.validateApiKey({ toString: null }); } catch (e) { threw = e; }
    return { success: threw === null && verdict && verdict.valid === false };
});

// Restore env
if (originalApiKey) process.env.VANT_API_KEY = originalApiKey;
else delete process.env.VANT_API_KEY;

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);