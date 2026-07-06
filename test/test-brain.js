/**
 * Brain Tests
 * Core runtime - memory, search, identity
 */

const brain = require('./lib/brain');

console.log('=== Brain Tests ===\n');

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
test('Brain: has loadBrain', () => {
    assert(typeof brain.loadBrain === 'function', 'Should have loadBrain');
});

test('Brain: has loadCorpus', () => {
    assert(typeof brain.loadCorpus === 'function', 'Should have loadCorpus');
});

test('Brain: has getMode', () => {
    assert(typeof brain.getMode === 'function', 'Should have getMode');
});

test('Brain: has setMode', () => {
    assert(typeof brain.setMode === 'function', 'Should have setMode');
});

test('Brain: has getBrainPath', () => {
    assert(typeof brain.getBrainPath === 'function', 'Should have getBrainPath');
});

test('Brain: has getPublicPath', () => {
    assert(typeof brain.getPublicPath === 'function', 'Should have getPublicPath');
});

// Test 2: Mode
test('Brain: setMode dual', () => {
    brain.setMode('dual');
    assert(brain.getMode() === 'dual', 'Mode should be dual');
});

test('Brain: setMode private', () => {
    brain.setMode('private');
    assert(brain.getMode() === 'private', 'Mode should be private');
});

test('Brain: setMode public', () => {
    brain.setMode('public');
    assert(brain.getMode() === 'public', 'Mode should be public');
});

// Test 3: Paths
test('Brain: getBrainPath returns string', () => {
    const path = brain.getBrainPath();
    assert(typeof path === 'string', 'Should return string');
    assert(path.length > 0, 'Should not be empty');
});

test('Brain: getPublicPath returns string', () => {
    const path = brain.getPublicPath();
    assert(typeof path === 'string', 'Should return string');
    assert(path.length > 0, 'Should not be empty');
});

// Test 4: Load corpus
test('Brain: loadCorpus returns promise', async () => {
    const corpus = await brain.loadCorpus();
    assert(Array.isArray(corpus), 'Should return array');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
    process.exit(1);
}

console.log('All brain tests passed! 🎉');
