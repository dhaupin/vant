#!/usr/bin/env node
/**
 * Succession Module Unit Tests
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

console.log('\n👑 SUCCESSION MODULE TESTS\n');

test('succession module loads', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: !!succession };
});

test('succession has getConfig function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.getConfig === 'function' };
});

test('succession has getTrustLevel function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.getTrustLevel === 'function' };
});

test('succession has setTrustLevel function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.setTrustLevel === 'function' };
});

test('succession has getPreviousBrain function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.getPreviousBrain === 'function' };
});

test('succession has getCurrentVersion function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.getCurrentVersion === 'function' };
});

test('succession has getLedger function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.getLedger === 'function' };
});

test('succession has getFilesForTrust function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.getFilesForTrust === 'function' };
});

test('succession has logSuccession function', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    return { success: typeof succession.logSuccession === 'function' };
});

// (read-side trust floor, #233-2 fix) the floor predicate's letter, unit-
// pinned: high/medium open (default installs unchanged), none identity-
// only, low refuses private state unless the config's succession.trust.core
// declares it, and an unknown/absent level degrades to the medium default.
test('trust floor: high and medium resolve private state unrestricted', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    const v = (name, level) => succession._trustFloorVerdict(name, level, null);
    return v('anything', 'high').allowed === true && v('anything', 'medium').allowed === true
        ? { success: true }
        : { success: false, error: `high/medium must stay open: ${JSON.stringify([v('anything', 'high'), v('anything', 'medium')])}` };
});

test('trust floor: none resolves only identity', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    const v = (name) => succession._trustFloorVerdict(name, 'none', null);
    return v('identity').allowed === true && v('goals').allowed === false
        ? { success: true }
        : { success: false, error: `none must keep only identity: ${JSON.stringify([v('identity'), v('goals')])}` };
});

test('trust floor: low refuses private state unless the declared core names it', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    const deny = succession._trustFloorVerdict('identity', 'low', null);
    const allow = succession._trustFloorVerdict('goals', 'low', ['goals']);
    return deny.allowed === false && allow.allowed === true
        ? { success: true }
        : { success: false, error: `low must refuse undeclared and allow declared core: ${JSON.stringify([deny, allow])}` };
});

test('trust floor: absent/unknown level degrades to the medium default (never a fake refusal)', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    const v = succession._trustFloorVerdict('identity', undefined, null);
    return v.allowed === true && v.level === 'medium'
        ? { success: true }
        : { success: false, error: `degraded level must behave like medium: ${JSON.stringify(v)}` };
});

test('trust floor: privateReadVerdict exists and never throws on hostile names', () => {
    const succession = require(path.join(ROOT, 'lib', 'succession'));
    if (typeof succession.privateReadVerdict !== 'function') return { success: false, error: 'privateReadVerdict missing' };
    let out = null;
    try { out = succession.privateReadVerdict('../etc/passwd'); } catch (e) { return { success: false, error: `threw on hostile name: ${e.name}` }; }
    return out && typeof out.allowed === 'boolean' ? { success: true } : { success: false, error: `no verdict shape: ${JSON.stringify(out)}` };
});

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);