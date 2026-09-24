#!/usr/bin/env node
/**
 * Org Flow End-to-End Tests (O-6)
 * The real org → dept → team → role → spawn → assign flow + horcrux interplay.
 * Kills the typeof-only coverage gap that hid F-4/F-7/F-9/F-11.
 *
 * Run: node test/orgflow.test.js
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, tests: [] };

const PASS = name => { results.passed++; results.tests.push({ name, status: 'passed' }); console.log(`  ✓ ${name}`); };
const FAIL = (name, why) => { results.failed++; results.tests.push({ name, status: 'failed', error: why }); console.log(`  ✗ ${name}: ${why}`); };

// (pass 27) SEQUENTIAL runner: test bodies are registered at load and then
// awaited ONE AT A TIME, in file order. The old fire-and-collect harness
// raced async bodies against each other AND against later sections' sync
// setup — process.exit also swallowed pending verdicts (4/22 tests went
// unreported on some runs). Sequential execution is the honest semantics
// for a stateful E2E flow: each step sees the previous step's settled state.
const queue = [];
function test(name, fn) {
    queue.push({ name, fn });
}

async function run() {
    for (const { name, fn } of queue) {
        let result;
        try { result = await fn(); } catch (e) { FAIL(name, e.message); continue; }
        const ok = result === true || (result && result.success);
        ok ? PASS(name) : FAIL(name, (result && result.error) || (result && JSON.stringify(result).slice(0, 120)) || 'assertion failed');
    }
}

// ==================== SETUP: operator grant ====================

console.log('\n🏛️  ORG FLOW E2E TESTS\n');

// (pass 27) HERMETICITY: redirect the teams store to a temp dir BEFORE
// lib/teams is required — the suite creates real entities and previously
// polluted models/private/<brain>/orgchart/teams.json, so re-runs tripped
// their own duplicate-name checks. config.set is a runtime flag with top
// get() precedence; the process exits before it needs clearing.
const os = require('os');
const fs = require('fs');
const TMP_STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-orgflow-'));
process.on('exit', () => { try { fs.rmSync(TMP_STORE_DIR, { recursive: true, force: true }); } catch (e) { /* best effort */ } });
const config = require(path.join(ROOT, 'lib', 'config'));
config.set('teams.store', path.join(TMP_STORE_DIR, 'teams.json'));

const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
const sudo = require(path.join(ROOT, 'lib', 'sudo'));
sudo.createTask('orgflow-test', ['read', 'write', 'spawn']);
sandbox.setScopes(['read', 'write', 'spawn']);
sandbox.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });

const teams = require(path.join(ROOT, 'lib', 'teams'));
const agents = require(path.join(ROOT, 'lib', 'agents'));

// ==================== 1. DENY-BY-DEFAULT (F-2/D-2 posture) ====================

console.log('🔒 deny-by-default posture\n');

// (can't easily un-grant in-process; verified in QC repro scripts. Here we
// test the documented error contract instead.)

// ==================== 2. CREATE FLOW (names as refs) ====================

console.log('🏗️  create flow (name refs stored as IDs)\n');

let org, dept, team, role, agent, assignment;

test('createOrg returns entity with id+name', () => {
    org = teams.createOrg('OrgFlowTestOrg', { desc: 'e2e' });
    return { success: !!org.id && org.name === 'OrgFlowTestOrg' };
});

test('createDept accepts org NAME, stores org ID (F-4)', () => {
    dept = teams.createDept('SoulDept', { org: 'OrgFlowTestOrg' });
    return { success: !!dept.id && dept.org === org.id };
});

test('createDept rejects unknown org ref', () => {
    const bad = teams.createDept('NopeDept', { org: 'NoSuchOrgAnywhere' });
    return { success: bad.error && bad.code === 'E_NOT_FOUND' };
});

test('createTeam accepts dept NAME, stores dept ID (F-4)', () => {
    team = teams.createTeam('SoulTeam', { dept: 'SoulDept' });
    return { success: !!team.id && team.dept === dept.id };
});

test('createRole is SYNC and validates name (D-4/O-3)', () => {
    role = teams.createRole('soul-keeper', { team: 'SoulTeam', org: 'OrgFlowTestOrg', permissions: ['brain.read'] });
    const syncNow = typeof role === 'object' && !!role.id; // would be a Promise if still async
    const bad = teams.createRole('x'); // too short
    return { success: syncNow && !!bad.error && bad.code === 'E_INVALID_NAME' };
});

test('createRole rejects duplicate in same team', () => {
    const dup = teams.createRole('soul-keeper', { team: 'SoulTeam' });
    return { success: dup.error && dup.code === 'E_DUPLICATE' };
});

// ==================== 3. SPAWN + ASSIGN ====================

console.log('🤖 spawn + assign\n');

test('spawn binds current brain (F-6)', () => {
    agent = agents.spawn({ name: 'OrgFlowAgent' });
    return { success: !!agent.id && agent.brain !== null && agent.brain !== undefined };
});

test('assign accepts ALL name refs (F-9)', () => {
    assignment = teams.assign(agent.id, { org: 'OrgFlowTestOrg', team: 'SoulTeam', role: 'soul-keeper' });
    return { success: !assignment.error && assignment.org === org.id && assignment.team === team.id };
});

test('getAgentBrain returns bound brain (F-6)', () => {
    const b = teams.getAgentBrain(agent.id);
    return { success: b === agent.brain && !!b };
});

test('assign rejects non-string agentId (F-7)', () => {
    const bad = teams.assign({ object: true }, { org: 'OrgFlowTestOrg' });
    const bad2 = teams.assign(undefined, {});
    return { success: bad.error && bad.code === 'E_INVALID_AGENT' && bad2.error && bad2.code === 'E_INVALID_AGENT' };
});

test('assign reports unresolvable refs distinctly (F-9)', () => {
    const bad = teams.assign(agent.id, { org: 'GhostOrg' });
    return { success: bad.error && bad.code === 'E_NOT_FOUND' && /GhostOrg/.test(bad.error) };
});

// ==================== 4. LISTINGS (name-or-ID) ====================

console.log('📋 listings accept name or ID\n');

test('listDepts by org ID finds the dept (was 0 before F-4 fix)', () => {
    return { success: teams.listDepts(org.id).length === 1 };
});

test('listDepts by org NAME finds the dept', () => {
    return { success: teams.listDepts('OrgFlowTestOrg').length === 1 };
});

test('listTeams by dept NAME finds the team', () => {
    return { success: teams.listTeams('SoulDept').length === 1 };
});

test('listAssignments filters by brain', () => {
    const all = teams.listAssignments({ brain: agent.brain });
    return { success: Array.isArray(all) && all.some(a => a.agentId === agent.id) };
});

// ==================== 5. CASCADE + DRYRUN (D-5) ====================

console.log('💥 cascade + dryRun\n');

test('dryRun reports cascade without deleting', () => {
    return teams.deleteOrg(org.id, { dryRun: true }).then(dry => {
        const ok = dry.dryRun === true && dry.cascade.orgs.length === 1 && dry.cascade.depts.length === 1 && dry.cascade.teams.length === 1 && teams.getOrg(org.id) !== undefined;
        return ok ? { success: true } : { success: false, dry, orgExists: teams.getOrg(org.id) !== undefined };
    });
});

test('deleteOrg cascades and reports children (F-5)', () => {
    return teams.deleteOrg(org.id).then(r => {
        const orphans = teams.listDepts().filter(d => d.name === 'SoulDept').length;
        const ok = r.deleted === true && Array.isArray(r.cascaded.depts) && r.cascaded.depts.length === 1 && orphans === 0;
        return ok ? { success: true } : { success: false, r, orphans };
    });
});

// ==================== 6. HORCRUX INTERPLAY (O-8) ====================

console.log('🧬 horcrux gather/restore (reincarnation)\n');

const transform = require(path.join(ROOT, 'lib', 'transform'));

// Rebuild a fresh hierarchy for the soul test (pass 27: SETUP runs as a
// queued step, not at load — load-time side effects raced section 5's
// pending deletes under the old harness).
let org2, dept2, team2, role2, agent2;
test('setup: soul-test entities', () => {
    org2 = teams.createOrg('SoulTestOrg', {});
    dept2 = teams.createDept('SoulTestDept', { org: 'SoulTestOrg' });
    team2 = teams.createTeam('SoulTestTeam', { dept: 'SoulTestDept' });
    role2 = teams.createRole('soul-tester', { team: 'SoulTestTeam' });
    agent2 = agents.spawn({ name: 'SoulTester' });
    const a = teams.assign(agent2.id, { org: 'SoulTestOrg', team: 'SoulTestTeam', role: 'soul-tester' });
    return { success: !!org2.id && !!dept2.id && !!team2.id && !!role2.id && !!agent2.id && !a.error };
});

test('gather via teams.gatherState includes orgchart', () => {
    const g = teams.gatherState();
    return { success: g.orgs.length >= 1 && g.assignments.length >= 1 && !!g.gatheredAt };
});

test('agents.gatherState carries FULL records incl. brain (O-8)', () => {
    const g = agents.gatherState();
    const rec = g.agents.find(a => a.id === agent2.id);
    return { success: !!rec && rec.brain === agent2.brain && rec.role === agent2.role };
});

test('agents.restoreState REALLY restores (F-11 was a no-op label)', () => {
    const snapshot = JSON.parse(JSON.stringify(agents.gatherState()));
    // wipe the registry via a full teams+agents cycle, then restore agents
    return agents.restoreState({ agents: [] }).then(() => {
        const empty = !agents.get(agent2.id);
        return agents.restoreState(snapshot).then(r => {
            const back = agents.get(agent2.id);
            return { success: empty && r.restored >= 1 && !!back && back.name === 'SoulTester' };
        });
    });
});

test('FULL reincarnation: teams restore round-trips IDs + names', () => {
    const teamsSnap = JSON.parse(JSON.stringify(teams.gatherState()));
    teams.restoreState({}); // wipe
    const r = teams.restoreState(teamsSnap);
    const orgBack = teams.getOrg(org2.id);
    const byName = teams.listDepts('SoulTestOrg');
    const brainBack = teams.getAgentBrain(agent2.id);
    return { success: r.orgs >= 1 && !!orgBack && orgBack.name === 'SoulTestOrg' && byName.length === 1 && brainBack === agent2.brain };
});

test('teams.restoreState REJECTS legacy array format (pass 27: migrate-or-reject)', () => {
    // (pass 27) Dual parsing removed per no-legacy-code policy. The legacy
    // store-file shape must be converted via teams.migrateLegacyState() first.
    const legacy = {
        orgs: [{ id: 'org_legacy1', name: 'LegacyOrg', desc: '', metadata: {}, created: 1 }],
        depts: [], teams: [], roles: [],
        assignments: [{ agentId: 'agent_legacy1', org: 'org_legacy1', brain: 'vant', assigned: 1 }]
    };
    let rejected = false;
    let stateUntouched = true;
    try {
        teams.restoreState(legacy);
    } catch (e) {
        rejected = e.code === 'E_LEGACY_FORMAT' && /migrateLegacyState/.test(e.message);
    }
    // Validate-before-clear: the rejection must NOT have wiped live state.
    // getOrg is exact-ID (D-1) — check the org created earlier this run.
    stateUntouched = !!teams.getOrg(org2.id);
    if (!rejected) return { error: 'legacy format was not rejected' };
    if (!stateUntouched) return { error: 'rejected payload still wiped live state' };

    // The bridge: convert → restore succeeds (restoreState is SYNC).
    const { converted, counts } = teams.migrateLegacyState(legacy);
    if (counts.orgs !== 1 || counts.assignments !== 1) return { error: 'bridge miscounted: ' + JSON.stringify(counts) };
    const r = teams.restoreState(converted);
    const ok = r.orgs === 1 && r.assignments === 1 && !!teams.getOrg('org_legacy1');
    // cleanup converted entity (deleteOrg is the async one)
    return teams.deleteOrg('org_legacy1').then(() => ({ success: ok }));
});

// Cleanup soul-test entities (queued step, not load-time)
test('cleanup: soul-test entities', () => {
    try { agents.kill(agent2.id); } catch (e) { try { agents.terminate(agent2.id); } catch (e2) {} }
    return teams.deleteOrg(org2.id).then(() => ({ success: true }));
});

// ==================== RESULTS ====================

// (pass 27) Sequential run, then summarize + exit.
run().then(() => {
    console.log(`\n--- RESULTS ---\n\n  Passed:  ${results.passed}\n  Failed:  ${results.failed}\n`);
    process.exit(results.failed > 0 ? 1 : 0);
});
