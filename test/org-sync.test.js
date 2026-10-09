#!/usr/bin/env node
/**
 * Org-Sync tests (pass 68+, Wave J — the org-model resolution cache)
 *
 * Pins the pass-68 group-pattern decision in code:
 *   1. replacement: a newer generation wholesale-replaces the replica
 *      (the steward is the authority of record — no merging)
 *   2. generations: older/equal generations are ignored (replays and
 *      restarts converge, never regress); the replica is persisted
 *   3. revocation: removal on the steward propagates via the newer
 *      generation — the member resolves the agent OUT (fail-closed)
 *   4. shadowing: local-first resolution — a replica entry can never
 *      shadow a local record; provider throws are misses, not denials
 *      the local model made
 *   5. end-to-end: scope.canAccess + consensus.get admit a group member
 *      through the replica (the Wave-J goal, local read of a group
 *      topic), and still fail closed for non-members
 *   6. gates: unregistered peers and non-allowlisted stewards cannot
 *      push a model; malformed models are dropped
 *   7. durability: the replica survives a fresh process (kind-marked
 *      state file), generation intact
 *   8. routed resolution: 'local' never consults the replica;
 *      'replica' never consults local
 *
 * Run: node test/org-sync.test.js
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0 };

function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => {
            results.passed++;
            console.log(`  ✓ ${name}`);
        })
        .catch((e) => {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
        });
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

// Wipe protocol state (test convention) — org chart AND the replica.
for (const dir of ['state', 'orgchart']) {
    fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', dir), { recursive: true, force: true });
}

const orgSync = require(path.join(ROOT, 'lib', 'org-sync'));
const teams = require(path.join(ROOT, 'lib', 'teams'));
const scope = require(path.join(ROOT, 'lib', 'scope'));
const crewBusMod = require(path.join(ROOT, 'lib', 'crew-bus'));
const consensus = require(path.join(ROOT, 'lib', 'consensus'));

// Steward + member buses, wired in-process by NAME (envelope gates are
// crew-bus's own; this suite pins org-sync's OWN gates and data rules).
const steward = crewBusMod.createBus();
const member = crewBusMod.createBus();
const outsider = crewBusMod.createBus();
steward.configure({ name: 'group-steward', port: 4911, secret: 'k'.repeat(32), agentId: 'steward-a' });
member.configure({ name: 'beta-node', port: 4912, secret: 'k'.repeat(32), agentId: 'beta-1' });
outsider.configure({ name: 'rogue-node', port: 4913, secret: 'k'.repeat(32), agentId: 'rogue-1' });

const BUSES = { 'group-steward': steward, 'beta-node': member, 'rogue-node': outsider };
function wireBus(bus) {
    bus.send = async (nodeName, type, payload) => {
        const target = BUSES[nodeName];
        if (!target) throw new Error('Unknown crew node: ' + nodeName);
        const env = { event: 'crew.' + type, from: bus.status().name, type, payload, ts: Date.now(), nonce: Math.random() };
        const handler = target._state.dispatchers.get(type);
        if (handler) handler(env);
        return { ok: true, handlers: handler ? 1 : 0 };
    };
}

function deliverModel(fromBus, toBus, model) {
    toBus._state.dispatchers.get('org.replicate')({
        from: fromBus.status().name, type: 'org.replicate',
        payload: { model, from: fromBus.status().name }
    });
}

// Build the STEWARD's group model: Acme Group org > group-dept > group
// team, with beta-1 (a foreign agent) and steward-lead assigned.
function buildGroupModel(generation) {
    const org = { id: 'org_grp1', name: 'acme-group', desc: '', metadata: {}, created: 1 };
    const dept = { id: 'dept_grp1', name: 'group-ops', org: 'org_grp1', desc: '', metadata: {}, created: 1 };
    const team = { id: 'team_grp1', name: 'group-chain', dept: 'dept_grp1', desc: '', metadata: {}, created: 1 };
    const role = { id: 'role_grp1', name: 'member', team: 'team_grp1', chain: [], created: 1 };
    return {
        generation,
        steward: 'group-steward',
        orgs: [org],
        depts: [dept],
        teams: [team],
        roles: [role],
        assignments: [
            { agentId: 'beta-1', org: 'org_grp1', dept: 'dept_grp1', team: 'team_grp1', role: 'role_grp1', brain: null, reportsTo: null, assigned: 1 },
            { agentId: 'steward-lead', org: 'org_grp1', dept: 'dept_grp1', team: 'team_grp1', role: 'role_grp1', brain: null, reportsTo: null, assigned: 1 }
        ]
    };
}

async function main() {
    console.log('\n🧬 ORG-SYNC TESTS (Wave J — the group org-model resolution cache)\n');

    wireBus(steward);
    wireBus(member);
    wireBus(outsider);
    member.registerNode({ name: 'group-steward', url: 'http://127.0.0.1:4911', secret: 'k'.repeat(32) });
    orgSync.install(steward);
    orgSync.install(member);
    orgSync.install(outsider);
    orgSync.setProvider();

    // Local org state on the member: beta-1's HOME org (sovereign, must
    // never be touched by the replica).
    const homeOrg = teams.createOrg('beta-local');
    const homeDept = teams.createDept('beta-home', { org: homeOrg.id });
    const homeTeam = teams.createTeam('beta-core', { dept: homeDept.id });
    assert(!homeTeam.error, 'local team setup failed');
    teams.assign('beta-1', { org: homeOrg.id, dept: homeDept.id, team: homeTeam.id });
    assert(teams.getAssignment('beta-1') && teams.getAssignment('beta-1').org === homeOrg.id, 'local assignment missing');

    await test('replacement: a newer generation wholesale-replaces the replica', async () => {
        deliverModel(steward, member, buildGroupModel(1000));
        const st = orgSync.replicaStatus();
        assert(st.generation === 1000, 'generation not adopted: ' + JSON.stringify(st));
        assert(st.orgs === 1 && st.teams === 1 && st.assignments === 2, 'model not replaced: ' + JSON.stringify(st));
        assert(st.steward === 'group-steward', 'steward stamp missing');
    });

    await test('generations: older/equal ignored; the replica is persisted', async () => {
        deliverModel(steward, member, buildGroupModel(1000)); // equal
        assert(orgSync.replicaStatus().generation === 1000, 'equal generation regressed state');
        deliverModel(steward, member, buildGroupModel(999));  // older
        assert(orgSync.replicaStatus().generation === 1000, 'older generation was adopted');
        // Newer stickiness: the persisted file carries the generation.
        const statePath = path.join(ROOT, 'models', 'private', 'vant', orgSync.REPLICA_STATE_FILE);
        const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        assert(raw.kind === 'vant-protocol-state' && raw.module === 'org-sync' && raw.generation === 1000, 'replica not kind-marked/persisted');
    });

    await test('provider resolves group scopes from the replica (fail-closed shape)', async () => {
        const members = scope.resolveMembersRouted('team:group-chain', 'replica');
        assert(members && members.has('beta-1') && members.has('steward-lead'), 'replica resolution failed: ' + JSON.stringify([...(members || [])]));
        // id OR steward-name both resolve (id is authoritative; name tolerated)
        const byName = scope.resolveMembersRouted('team:group-chain', 'replica');
        assert(byName && byName.size === 2, 'name-based replica resolution failed');
        // Unknown entity: fail-closed null (throw swallowed as the miss it is)
        assert(scope.resolveMembersRouted('team:no-such-team', 'replica') === null, 'unknown entity resolved non-null');
        assert(scope.resolveMembersRouted('agent:ghost', 'replica') === null, 'agent kind answered by replica');
    });

    await test('shadowing: local-first — the replica never shadows local records', async () => {
        // beta-1 resolves LOCALLY against its home team (sovereign book),
        // even though beta-1 also sits in the replica.
        const local = scope.resolveMembersRouted('team:beta-core', 'local');
        assert(local && local.has('beta-1'), 'local resolution broken');
        assert(scope.resolveMembersRouted('team:beta-core', 'replica') === null, 'replica answered for a LOCAL entity');
        // auto: local wins where local knows; replica answers where local missed.
        const auto = scope.resolveMembers('team:group-chain');
        assert(auto && auto.has('beta-1'), 'auto route did not fall through to the replica');
    });

    await test('end-to-end: canAccess + consensus admit the group member via the replica', async () => {
        const SCOPE = { owner: 'team:group-chain', visibility: 'scope' };
        assert(scope.canAccess({ scope: SCOPE }, 'beta-1'), 'beta-1 denied on its OWN member node — Wave J goal failed');
        assert(scope.canAccess({ scope: SCOPE }, 'steward-lead'), 'steward-lead denied');
        assert(!scope.canAccess({ scope: SCOPE }, 'rogue-1'), 'non-member ADMITTED — fail-closed broken');
        // The group topic reads locally on the member now (the thing Wave J exists for).
        const created = await consensus.create('group-read-pin', { ballot: ['a', 'b'], minQuorum: 1, requireRegistry: false, scope: SCOPE });
        assert(!created.error, 'scoped create failed: ' + JSON.stringify(created));
        assert(consensus.get('group-read-pin', 'beta-1') !== null, 'group member cannot READ the group topic locally');
        assert(consensus.get('group-read-pin', 'rogue-1') === null, 'non-member read leaked');
    });

    await test('revocation: removal on the steward propagates; resolution goes fail-closed', async () => {
        const model = buildGroupModel(1001);
        model.assignments = model.assignments.filter((a) => a.agentId !== 'beta-1'); // steward revokes beta-1
        deliverModel(steward, member, model);
        assert(orgSync.replicaStatus().generation === 1001, 'revocation generation not adopted');
        assert(orgSync.replicaStatus().assignments === 1, 'revoked assignment still in replica');
        assert(scope.resolveMembers('team:group-chain') === null || !scope.resolveMembers('team:group-chain').has('beta-1'),
            'revoked agent still resolves into the group scope');
        const SCOPE = { owner: 'team:group-chain', visibility: 'scope' };
        assert(!scope.canAccess({ scope: SCOPE }, 'beta-1'), 'revoked agent still admitted');
        // The revoked agent's LOCAL org membership is untouched (sovereignty).
        assert(teams.getAssignment('beta-1') && teams.getAssignment('beta-1').org === homeOrg.id, 'revocation touched the local org model');
    });

    await test('gates: unregistered peers, non-allowlisted stewards, malformed models', async () => {
        // Unregistered: rogue pushes directly to member's dispatcher.
        deliverModel(outsider, member, buildGroupModel(2000));
        assert(orgSync.replicaStatus().generation === 1001, 'unregistered peer pushed a model');
        // Allowlist: pin the steward; now even a REGISTERED rogue is refused.
        member.registerNode({ name: 'rogue-node', url: 'http://127.0.0.1:4913', secret: 'k'.repeat(32) });
        orgSync.configureStewards(['group-steward']);
        deliverModel(outsider, member, buildGroupModel(2000));
        assert(orgSync.replicaStatus().generation === 1001, 'non-allowlisted steward pushed a model');
        // Malformed: bad generation, non-object entries — dropped, state intact.
        deliverModel(steward, member, { generation: 'nope' });
        assert(orgSync.replicaStatus().generation === 1001, 'malformed generation adopted');
        const bad = buildGroupModel(2001);
        bad.orgs = [{ nope: true }, bad.orgs[0]];
        bad.assignments = [{ agentId: 42 }, bad.assignments[0]];
        deliverModel(steward, member, bad);
        const st = orgSync.replicaStatus();
        assert(st.generation === 2001 && st.orgs === 1 && st.assignments === 1, 'clamping wrong: ' + JSON.stringify(st));
        orgSync.configureStewards([]); // restore default posture for later tests
    });

    await test('durability: the replica survives a fresh module instance', async () => {
        const statePath = path.join(ROOT, 'models', 'private', 'vant', orgSync.REPLICA_STATE_FILE);
        const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        assert(raw.generation === 2001 && Array.isArray(raw.assignments) && raw.assignments.length === 1, 'unexpected persisted replica');
        const fresh = {};
        const store = require(path.join(ROOT, 'lib', 'state-store'));
        store.hydrate({
            moduleName: 'org-sync',
            stateFile: orgSync.REPLICA_STATE_FILE,
            apply: (data) => { if (data && data.module === 'org-sync') Object.assign(fresh, data); }
        });
        assert(fresh.generation === 2001 && fresh.steward === 'group-steward', 'fresh hydrate incomplete');
    });

    await test('exportOrgModel: the steward exports ITS real model (deep copy, monotone generation)', async () => {
        const gOrg = teams.createOrg('group-model-pin');
        const gDept = teams.createDept('group-model-dept', { org: gOrg.id });
        teams.createTeam('group-model-team', { dept: gDept.id });
        const m1 = orgSync.exportOrgModel();
        const m2 = orgSync.exportOrgModel();
        assert(m2.generation > m1.generation, 'generation not monotone');
        assert(m1.teams.some((t) => t.name === 'group-model-team'), 'export missing steward teams');
        m1.teams.length = 0; // mutating the export must not touch the model
        assert(teams.listTeams().some((t) => t.name === 'group-model-team'), 'export was not a deep copy');
        const r = await orgSync.replicate(steward, 'beta-node', { generation: m1.generation + 5000 });
        assert(r.pushed && r.ok, 'replicate leg failed: ' + JSON.stringify(r));
    });

    console.log(`\n=== Org-sync: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Test harness error:', e);
    process.exit(1);
});
