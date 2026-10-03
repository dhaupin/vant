#!/usr/bin/env node
/**
 * Consensus read-path scope tests (pass 65, labs/node-crew star exercise)
 *
 * The live-fire find: consensus's VOTE path enforced "scoped means
 * unseen" since pass 50, but the READ path (get/list) handed scoped
 * ledgers to ANY caller — the three-node star caught a non-member hub
 * reading a JV ledger's existence and content through mesh-status.
 * This suite pins the fix:
 *
 *   1. get(topic, null) — anonymous: scoped ledger returns null
 *      (indistinguishable from not-found); unscoped flows
 *   2. get(topic, viewerId) — member principal reads; non-member null
 *   3. get(topic) — legacy trusted-internal form unchanged (backward
 *      compat for agora-sync/forum internals)
 *   4. list(null) — anonymous view omits scoped topics entirely
 *   5. list(viewerId) — member sees their scoped topics + all public
 *   6. list() — legacy full list for trusted-internal callers
 *   7. existentials: a non-member cannot distinguish scoped-exists from
 *      scoped-missing (both null), the pass-50 rule now on reads
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

const results = { passed: 0, failed: 0 };
function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => { results.passed++; console.log(`  ✓ ${name}`); })
        .catch((e) => { results.failed++; console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`); });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

for (const dir of ['state', 'orgchart']) {
    fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', dir), { recursive: true, force: true });
}

const consensus = require(path.join(ROOT, 'lib', 'consensus'));
const teams = require(path.join(ROOT, 'lib', 'teams'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));

async function main() {
    console.log('\n🔒 CONSENSUS READ-PATH SCOPE (pass 65, star live-fire)\n');

    // Org model: one team with two members; an outsider exists but is not a member.
    const org = teams.createOrg('rs-org');
    const dept = teams.createDept('rs-dept', { org: org.id });
    const team = teams.createTeam('rs-team', { dept: dept.id });
    for (const a of ['rs-member-a', 'rs-member-b']) {
        const r = teams.assign(a, { org: org.id, dept: dept.id, team: team.id });
        assert(!r.error, 'assign failed: ' + JSON.stringify(r));
    }
    const SCOPE = { owner: 'team:' + team.id, visibility: 'scope' };

    await test('setup: scoped + unscoped ledgers exist; members registered', async () => {
        const v = await consensus.create('rs-scoped', { options: ['a', 'b'], quorum: 2, scope: SCOPE });
        assert(!v.error, 'scoped create failed: ' + JSON.stringify(v).slice(0, 120));
        const u = await consensus.create('rs-open', { options: ['a', 'b'], quorum: 2 });
        assert(!u.error, 'unscoped create failed: ' + JSON.stringify(u).slice(0, 120));
    });

    await test('anonymous get(null): scoped hidden, unscoped visible', async () => {
        assert(consensus.get('rs-scoped', null) === null, 'anonymous read of scoped topic leaked');
        assert(consensus.get('rs-open', null) !== null, 'anonymous read of unscoped topic blocked');
    });

    await test('member get(viewerId): reads; non-member and outsider get null', async () => {
        assert(consensus.get('rs-scoped', 'rs-member-a') !== null, 'member blocked from own team topic');
        assert(consensus.get('rs-scoped', 'rs-outsider') === null, 'outsider read of scoped topic leaked');
    });

    await test('existentials: non-member cannot distinguish scoped-exists from scoped-missing', async () => {
        assert(consensus.get('rs-scoped', 'rs-outsider') === null, 'exists but leaked');
        assert(consensus.get('rs-no-such-topic', 'rs-outsider') === null, 'missing shape changed');
        assert(consensus.get('rs-scoped', 'rs-outsider') === consensus.get('rs-no-such-topic', 'rs-outsider'),
            'exists/missing distinguishable by shape');
    });

    await test('legacy get(topic): trusted-internal form unchanged', async () => {
        assert(consensus.get('rs-scoped') !== null, 'legacy internal read broke (agora-sync/forum depend on it)');
    });

    await test('anonymous list(null): scoped topics unnameable, unscoped flows', async () => {
        const anon = consensus.list(null).map((l) => l.topic);
        assert(!anon.includes('rs-scoped'), 'anonymous list leaked a scoped topic name');
        assert(anon.includes('rs-open'), 'anonymous list lost the unscoped topic');
    });

    await test('member list(viewerId): sees own scoped topics + all public; outsider sees public only', async () => {
        const member = consensus.list('rs-member-b').map((l) => l.topic);
        assert(member.includes('rs-scoped') && member.includes('rs-open'), 'member list wrong: ' + JSON.stringify(member));
        const outsider = consensus.list('rs-outsider').map((l) => l.topic);
        assert(!outsider.includes('rs-scoped'), 'outsider list leaked scoped topic');
        assert(outsider.includes('rs-open'), 'outsider list lost public topic');
    });

    await test('legacy list(): trusted-internal full list unchanged', async () => {
        const full = consensus.list().map((l) => l.topic);
        assert(full.includes('rs-scoped') && full.includes('rs-open'), 'legacy list broke');
    });

    await test('vote-path gate unchanged: non-member ballot still E_SCOPE (pass-50 rule intact)', async () => {
        // requireRegistry anchor: voters must be peer-registered first
        registry.register({ id: 'rs-outsider', name: 'rs-outsider', host: '127.0.0.1', port: 1 });
        registry.register({ id: 'rs-member-a', name: 'rs-member-a', host: '127.0.0.1', port: 1 });
        const r = await consensus.vote('rs-scoped', 'a', 'rs-outsider');
        assert(!!r.error && /scope/i.test(r.error), 'vote gate regressed: ' + JSON.stringify(r).slice(0, 100));
        const ok = await consensus.vote('rs-scoped', 'a', 'rs-member-a');
        assert(!ok.error, 'member vote broke: ' + JSON.stringify(ok).slice(0, 100));
    });

    const banner = `  ${results.passed} passed, ${results.failed} failed`;
    console.log('\n' + (results.failed ? '✗ ' : '✓ ') + banner + '\n');
    process.exit(results.failed ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
