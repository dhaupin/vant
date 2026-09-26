#!/usr/bin/env node
/**
 * Teams Module Unit Tests
 * Tests for brain-scoped team management
 * 
 * Run: node test/teams.test.js
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

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

console.log('\n👥 TEAMS MODULE TESTS\n');

// Test 1: Module loads
test('teams module loads', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    return { success: !!teams };
});

// Test 2: Has createOrg
test('teams has createOrg function', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    return { success: typeof teams.createOrg === 'function' };
});

// Test 3: Has createDept
test('teams has createDept function', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    return { success: typeof teams.createDept === 'function' };
});

// Test 4: Has createTeam
test('teams has createTeam function', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    return { success: typeof teams.createTeam === 'function' };
});

// Test 5: Has createRole
test('teams has createRole function', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    return { success: typeof teams.createRole === 'function' };
});

// Test 6: Has assign
test('teams has assign function', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    return { success: typeof teams.assign === 'function' };
});

// Test 7: Create org works
test('createOrg creates organization', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    const result = teams.createOrg('TestOrg');
    return { success: !!result };
});

// Test 8: Create dept works
test('createDept creates department', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    const result = teams.createDept('Engineering', { org: 'TestOrg' });
    return { success: !!result };
});

// Test 9: Create team works
test('createTeam creates team', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    const result = teams.createTeam('Frontend', { dept: 'Engineering' });
    return { success: !!result };
});

// Test 10: Create role works
test('createRole creates role', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    const result = teams.createRole('Senior Engineer', { team: 'Frontend' });
    return { success: !!result };
});

// ============================================
// MULTIBRAIN TESTS
// ============================================

console.log('\n🧠 MULTIBRAIN TESTS\n');

// Test 11: getAgentBrain function exists
test('getAgentBrain function exists', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    return { success: typeof teams.getAgentBrain === 'function' };
});

// Test 12: listAgentsByBrain function exists
test('listAgentsByBrain function exists', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    return { success: typeof teams.listAgentsByBrain === 'function' };
});

// Test 13: listAgentsByBrain returns array
test('listAgentsByBrain returns array', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const currentBrain = brain.currentBrain();
    
    const agents = teams.listAgentsByBrain(currentBrain);
    return { success: Array.isArray(agents) };
});

// Test 14: listAssignments accepts brain filter
test('listAssignments accepts brain filter', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const currentBrain = brain.currentBrain();
    
    const assignments = teams.listAssignments({ brain: currentBrain });
    return { success: Array.isArray(assignments) };
});

// Test 15: Brain module integration
test('teams integrates with brain module', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    
    const currentBrain = brain.currentBrain();
    const stack = brain.getStack();
    
    return { success: !!currentBrain && Array.isArray(stack) };
});

// ============================================
// STACK SUPPORT TESTS
// ============================================

console.log('\n📚 STACK SUPPORT TESTS\n');

test('teams has listStackOrgs function', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    return { success: typeof teams.listStackOrgs === 'function' };
});

test('teams has getStackOrg function', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    return { success: typeof teams.getStackOrg === 'function' };
});

test('teams has listStackTeams function', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    return { success: typeof teams.listStackTeams === 'function' };
});

test('teams has getStackTeam function', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    return { success: typeof teams.getStackTeam === 'function' };
});

test('teams has getStackHierarchy function', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    return { success: typeof teams.getStackHierarchy === 'function' };
});

test('listStackOrgs returns array', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    const orgs = teams.listStackOrgs();
    return { success: Array.isArray(orgs) };
});

test('getStackHierarchy returns object with source stack', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    const hierarchy = teams.getStackHierarchy();
    return { success: hierarchy && hierarchy.source === 'stack' };
});

// ============================================
// SUMMARY
// ============================================

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Skipped: ${results.skipped}`);
console.log(`  Total:   ${results.passed + results.failed + results.skipped}`);

if (results.failed > 0) {
    console.log('\nFailed tests:');
    results.tests.filter(t => t.status === 'failed').forEach(t => {
        console.log(`  - ${t.name}: ${t.error}`);
    });
    process.exit(1);
} else {
    console.log('\n✓ All tests passed!\n');
    process.exit(0);
}
