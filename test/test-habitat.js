/**
 * Habitat Tests
 * Core runtime - workspaces, roles, policies, entropy
 */

const Habitat = require('./lib/habitat');

console.log('=== Habitat Tests ===\n');

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

// Test 1: Basic creation
test('Habitat: create instance', () => {
    const habitat = new Habitat();
    assert(habitat !== undefined, 'Should create');
});

test('Habitat: default workspace name', () => {
    const habitat = new Habitat();
    assert(habitat.defaultWorkspace === 'default', 'Default workspace should be default');
});

// Test 2: Workspaces
test('Habitat: createWorkspace', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-alpha', { description: 'Alpha team' });
    const ws = habitat.workspaces['team-alpha'];
    assert(ws !== undefined, 'Should create workspace');
    assert(ws.id === 'team-alpha', 'Should have id');
});

test('Habitat: listWorkspaces', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-beta');
    habitat.createWorkspace('team-gamma');
    const list = habitat.listWorkspaces();
    assert(list.length >= 2, 'Should list workspaces');
});

// Test 3: Roles
test('Habitat: addRole', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-alpha');
    habitat.addRole('team-alpha', 'editor', 'alice');
    const roles = habitat.getUserRoles('team-alpha', 'alice');
    assert(roles.includes('editor'), 'Should have editor role');
});

test('Habitat: hasRole', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-alpha');
    habitat.addRole('team-alpha', 'admin', 'bob');
    assert(habitat.hasRole('team-alpha', 'bob', 'admin') === true, 'Should have admin role');
    assert(habitat.hasRole('team-alpha', 'bob', 'editor') === false, 'Should not have editor role');
});

test('Habitat: removeRole', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-alpha');
    habitat.addRole('team-alpha', 'viewer', 'charlie');
    habitat.removeRole('team-alpha', 'viewer', 'charlie');
    assert(habitat.hasRole('team-alpha', 'charlie', 'viewer') === false, 'Role should be removed');
});

// Test 4: Policies
test('Habitat: setPolicy', () => {
    const habitat = new Habitat();
    habitat.setPolicy('my-island', { read: ['editor'], write: ['admin'] });
    const bounds = habitat.getBoundaries();
    assert(bounds['my-island'] !== undefined, 'Policy should be set');
});

// Test 5: Current workspace
test('Habitat: setWorkspace', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-alpha');
    habitat.setWorkspace('team-alpha');
    assert(habitat.getCurrentWorkspace() === 'team-alpha', 'Current workspace should be set');
});

// Test 6: Status
test('Habitat: status', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-alpha');
    const status = habitat.status();
    assert(status !== undefined, 'Should return status');
});

// Test 7: Geometric map
test('Habitat: getGeometricMap', () => {
    const habitat = new Habitat();
    const map = habitat.getGeometricMap();
    assert(map !== undefined, 'Should return geometric map');
});

// Test 8: Boundaries
test('Habitat: getBoundaries', () => {
    const habitat = new Habitat();
    const bounds = habitat.getBoundaries();
    assert(bounds !== undefined, 'Should return boundaries');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
    process.exit(1);
}

console.log('All habitat tests passed! 🎉');
