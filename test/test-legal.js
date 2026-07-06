/**
 * Legal Tests
 * Security - compliance gate
 */

const legal = require('./lib/legal');

console.log('=== Legal Tests ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (e) {
        console.log(`✗ ${name}: ${e.message}`);
        failed++;
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
}

// Test 1: Core exports
test('Legal: has checkGate', () => {
    assert(typeof legal.checkGate === 'function', 'Should have checkGate');
});

test('Legal: has activate', () => {
    assert(typeof legal.activate === 'function', 'Should have activate');
});

test('Legal: has deactivate', () => {
    assert(typeof legal.deactivate === 'function', 'Should have deactivate');
});

test('Legal: has getStatus', () => {
    assert(typeof legal.getStatus === 'function', 'Should have getStatus');
});

test('Legal: has notice', () => {
    assert(typeof legal.notice === 'function', 'Should have notice');
});

test('Legal: has canUse', () => {
    assert(typeof legal.canUse === 'function', 'Should have canUse');
});

// Test 2: Status
test('Legal: getStatus returns object', () => {
    const status = legal.getStatus();
    assert(typeof status === 'object', 'Should return object');
});

// Test 3: Activate
test('Legal: activate warn', () => {
    const result = legal.activate('warn');
    assert(result.activated === true, 'Should activate');
});

// Test 4: Check gate
test('Legal: checkGate returns', () => {
    const result = legal.checkGate('test', {});
    assert(result !== undefined, 'Should return something');
});

// Test 5: Notice (logs to console, returns undefined)
test('Legal: notice logs', () => {
    // notice logs but returns undefined - that's expected
    const result = legal.notice('info', 'test message');
    assert(result === undefined, 'Returns undefined (logs instead)');
});

// Test 6: Deactivate
test('Legal: deactivate', () => {
    const result = legal.deactivate();
    assert(result.deactivated === true, 'Should deactivate');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
    process.exit(1);
}

console.log('All legal tests passed! 🎉');
