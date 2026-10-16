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
// ISSUE #120: PARENT-FIRST POSITIONAL CALLS
// ============================================
// A caller using createDept(orgId, 'engineering') / createTeam(deptId,
// 'name') had the PARENT ID silently stored as the name and the chosen
// name thrown away (options object position). The lib now reorders when
// arg0 resolves to an existing parent record and arg1 is a string.

console.log('\n🔀 ISSUE #120 PARENT-FIRST POSITIONAL TESTS\n');

// Test 10a: grant write capability up front (same test-harness grant
// teams-crossprocess.test.js uses) so the #120 setup calls can run.
{
    try { require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true, canExecute: true }); } catch (e) { /* env without defaultSandbox: proceeds under allow-default */ }
}
// Unique-per-run org name: the orgchart store persists across runs, so
// fixed fixture names re-collide as E_DUPLICATE on the second run.
const I120_ORG = 'Issue120Org-' + Date.now().toString(36);
const I120_DEPT = 'engineering-' + Date.now().toString(36); // unique per run: the orgchart store persists
test('createDept(orgId, name) stores the chosen name (issue #120)', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    const org = teams.createOrg(I120_ORG);
    if (!org || org.error || !org.id) return { success: false, error: 'org setup: ' + JSON.stringify(org || null) };
    const dept = teams.createDept(org.id, I120_DEPT);
    if (!dept || dept.error) return { success: false, error: 'createDept: ' + JSON.stringify(dept) };
    return { success: dept.name === I120_DEPT && dept.org === org.id,
        error: 'name=' + JSON.stringify(dept.name) + ' org=' + JSON.stringify(dept.org) };
});

test('createTeam(deptId, name) stores the chosen name (issue #120)', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    const dept = Array.from(teams.listDepts()).find(d => d.name === I120_DEPT);
    if (!dept) return { success: false, error: 'setup dept missing: ' + I120_DEPT };
    const teamName = 'gistory-core-' + Date.now().toString(36); // unique per run: the orgchart store persists
    const team = teams.createTeam(dept.id, teamName);
    if (!team || team.error) return { success: false, error: 'createTeam: ' + JSON.stringify(team) };
    return { success: team.name === teamName && team.dept === dept.id,
        error: 'name=' + JSON.stringify(team.name) + ' dept=' + JSON.stringify(team.dept) };
});

test('documented signature (name, {org}) unchanged after reorder fix', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    const deptName = 'I120 Doc Sig Dept-' + Date.now().toString(36);
    const dept = teams.createDept(deptName, { org: I120_ORG });
    if (!dept || dept.error) return { success: false, error: JSON.stringify(dept) };
    return { success: dept.name === deptName, error: JSON.stringify(dept) };
});

test('plain-name createDept not affected (name never impersonates a parent)', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    const deptName = 'I120 Plain Dept-' + Date.now().toString(36);
    const dept = teams.createDept(deptName, { org: I120_ORG });
    if (!dept || dept.error) return { success: false, error: JSON.stringify(dept) };
    return { success: dept.name === deptName, error: JSON.stringify(dept) };
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
    const _teams = require(path.join(ROOT, 'lib', 'teams'));
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
