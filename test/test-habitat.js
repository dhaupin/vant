#!/usr/bin/env node
/**
 * Habitat Module Unit Tests
 * Real tests for habitat.js workspace/role management
 *
 * Run: node test/test-habitat.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const Habitat = require('../lib/habitat');

// Test results
const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: []
};

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            results.tests.push({ name, status: 'passed' });
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            results.tests.push({ name, status: 'failed', error: result.error || 'assertion failed' });
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        results.tests.push({ name, status: 'failed', error: e.message });
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

function skip(name, reason) {
    results.skipped++;
    results.tests.push({ name, status: 'skipped', reason });
    console.log(`  ⊘ ${name}: ${reason}`);
}

// ============================================
// TESTS
// ============================================

console.log('\n=== Habitat Tests ===\n');

// Test 1: Basic creation
test('create instance', () => {
    const habitat = new Habitat();
    return habitat !== undefined;
});

test('default workspace name', () => {
    const habitat = new Habitat();
    return habitat.defaultWorkspace === 'default';
});

// Test 2: Workspaces
test('createWorkspace', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-alpha', { description: 'Alpha team' });
    const ws = habitat.workspaces['team-alpha'];
    return ws !== undefined && ws.id === 'team-alpha';
});

test('listWorkspaces', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-beta');
    habitat.createWorkspace('team-gamma');
    const list = habitat.listWorkspaces();
    return list.length >= 2;
});

// Test 3: Roles
test('addRole', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-alpha');
    habitat.addRole('team-alpha', 'editor', 'alice');
    const roles = habitat.getUserRoles('team-alpha', 'alice');
    return roles.includes('editor');
});

test('hasRole', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-alpha');
    habitat.addRole('team-alpha', 'admin', 'bob');
    return habitat.hasRole('team-alpha', 'bob', 'admin') === true &&
           habitat.hasRole('team-alpha', 'bob', 'editor') === false;
});

test('removeRole', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-alpha');
    habitat.addRole('team-alpha', 'viewer', 'charlie');
    habitat.removeRole('team-alpha', 'viewer', 'charlie');
    return habitat.hasRole('team-alpha', 'charlie', 'viewer') === false;
});

// Test 4: Policies
test('setPolicy', () => {
    const habitat = new Habitat();
    habitat.setPolicy('my-island', { read: ['editor'], write: ['admin'] });
    const bounds = habitat.getBoundaries();
    return bounds['my-island'] !== undefined;
});

// Test 5: Current workspace
test('setWorkspace', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-alpha');
    habitat.setWorkspace('team-alpha');
    return habitat.getCurrentWorkspace() === 'team-alpha';
});

// Test 6: Status
test('status', () => {
    const habitat = new Habitat();
    habitat.createWorkspace('team-alpha');
    const status = habitat.status();
    return status !== undefined;
});

// Test 7: Geometric map
test('getGeometricMap', () => {
    const habitat = new Habitat();
    const map = habitat.getGeometricMap();
    return map !== undefined;
});

// Test 8: Boundaries
test('getBoundaries', () => {
    const habitat = new Habitat();
    const bounds = habitat.getBoundaries();
    return bounds !== undefined;
});

// ============================================
// RESULTS
// ============================================

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    process.exit(1);
}

console.log('All habitat tests passed! 🎉\n');
