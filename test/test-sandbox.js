/**
 * Sandbox Tests
 * Core runtime - capabilities, handlers, RLS integration
 */

const sandbox = require('./lib/sandbox');
const Habitat = require('./lib/habitat');

console.log('=== Sandbox Tests ===\n');

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

// Test 1: Basic exports
test('Sandbox: has defaultSandbox', () => {
    assert(sandbox.defaultSandbox !== undefined, 'Should have defaultSandbox');
});

test('Sandbox: has initRLS', () => {
    assert(typeof sandbox.initRLS === 'function', 'Should have initRLS');
});

test('Sandbox: has generateCaps', () => {
    assert(typeof sandbox.generateCaps === 'function', 'Should have generateCaps');
});

test('Sandbox: has initLegal', () => {
    assert(typeof sandbox.initLegal === 'function', 'Should have initLegal');
});

// Test 2: Default capabilities (DENY)
test('Sandbox: canRead default false', () => {
    assert(sandbox.canRead() === false, 'canRead should be false by default');
});

test('Sandbox: canWrite default false', () => {
    assert(sandbox.canWrite() === false, 'canWrite should be false by default');
});

test('Sandbox: canNetwork default false', () => {
    assert(sandbox.canNetwork() === false, 'canNetwork should be false by default');
});

test('Sandbox: canExec default false', () => {
    assert(sandbox.canExec() === false, 'canExec should be false by default');
});

// Test 3: Generate caps
test('Sandbox: generateCaps returns object', () => {
    const caps = sandbox.generateCaps({});
    assert(typeof caps === 'object', 'Should return object');
});

// Test 4: Create sandbox
test('Sandbox: create with caps', () => {
    const sb = sandbox.create({
        canRead: true,
        canWrite: true
    });
    assert(sb.capabilities.canRead === true, 'Created sandbox should read');
    assert(sb.capabilities.canWrite === true, 'Created sandbox should write');
});

test('Sandbox: createAllowed returns object', () => {
    const allowed = sandbox.createAllowed();
    assert(typeof allowed === 'object', 'createAllowed should return object');
});

// Test 5: initRLS
test('Sandbox: initRLS with habitat', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-alpha');
    const result = sandbox.initRLS(habitat);
    assert(result === true, 'initRLS should return true');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
    process.exit(1);
}

console.log('All sandbox tests passed! 🎉');
