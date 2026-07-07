#!/usr/bin/env node
/**
 * Auth, Health, Config Module Tests
 */

const results = { passed: 0, failed: 0 };
function test(name, fn) {
    try {
        if (fn()) { results.passed++; console.log(`  ✓ ${name}`); }
        else { results.failed++; console.log(`  ✗ ${name}`); }
    } catch (e) { results.failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

console.log('\n=== Auth Module Tests ===\n');
const auth = require('../lib/auth');
test('has Auth class', () => typeof auth.Auth === 'function');
test('has verifyToken function', () => typeof auth.verifyToken === 'function');
test('has hashPassword function', () => typeof auth.hashPassword === 'function');
test('has requireAuth function', () => typeof auth.requireAuth === 'function');
test('has create function', () => typeof auth.create === 'function');

console.log('\n=== Health Module Tests ===\n');
const health = require('../lib/health');
test('has start function', () => typeof health.start === 'function');
test('has stop function', () => typeof health.stop === 'function');
test('has runChecks function', () => typeof health.runChecks === 'function');

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed ===\n`);
if (results.failed > 0) process.exit(1);
