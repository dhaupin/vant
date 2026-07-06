/**
 * Islands Tests
 * Core runtime - corpus, lazy loading
 */

const islands = require('./lib/islands');

console.log('=== Islands Tests ===\n');

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
test('Islands: has load', () => {
    assert(typeof islands.load === 'function', 'Should have load');
});

test('Islands: has save', () => {
    assert(typeof islands.save === 'function', 'Should have save');
});

test('Islands: has hydrate', () => {
    assert(typeof islands.hydrate === 'function', 'Should have hydrate');
});

test('Islands: has dehydrate', () => {
    assert(typeof islands.dehydrate === 'function', 'Should have dehydrate');
});

test('Islands: has getHydrated', () => {
    assert(typeof islands.getHydrated === 'function', 'Should have getHydrated');
});

test('Islands: has getAvailable', () => {
    assert(typeof islands.getAvailable === 'function', 'Should have getAvailable');
});

test('Islands: has getManifest', () => {
    assert(typeof islands.getManifest === 'function', 'Should have getManifest');
});

test('Islands: has getManifestSync', () => {
    assert(typeof islands.getManifestSync === 'function', 'Should have getManifestSync');
});

// Test 2: Get hydrated
test('Islands: getHydrated returns array', () => {
    const hydrated = islands.getHydrated();
    assert(Array.isArray(hydrated), 'Should return array');
});

// Test 3: Get available
test('Islands: getAvailable returns array', () => {
    const available = islands.getAvailable();
    assert(Array.isArray(available), 'Should return array');
});

// Test 4: Get manifest sync
test('Islands: getManifestSync returns object', () => {
    const manifest = islands.getManifestSync();
    assert(typeof manifest === 'object', 'Should return object');
});

// Test 5: Islands class
test('Islands: Islands class instantiates', () => {
    const i = new islands.Islands();
    assert(i !== undefined, 'Should create');
});

test('Islands: Islands.getStatus', () => {
    const i = new islands.Islands();
    const status = i.getStatus();
    assert(typeof status === 'object', 'Should return status');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
    process.exit(1);
}

console.log('All islands tests passed! 🎉');
