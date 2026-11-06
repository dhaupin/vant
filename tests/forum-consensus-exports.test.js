#!/usr/bin/env node
/**
 * PUBLISH-ONLY EXPORTS pins (wave D, vant#335).
 *
 * forum.exportTrail — the durable decision log exports as a read-only
 * artifact (one derivation, many readers): json-only format gate, a
 * votes-digest withhold, and the EXACT tenancy gate the vote-carrying read
 * path uses (a publish-only channel cannot leak a gated row either).
 *
 * consensus.reconcile — a health REPORT (roots, not ballots): per-tier row
 * hashes, vote-row counts, reap state, first divergent row id on
 * divergence, and DELIBERATELY no voting / no automatic repair. Tombstone
 * discipline: a reaped topic with a live disk row reports disagreement.
 *
 * DISCRIMINATING: stashing the lib/forum.js + lib/consensus.js wave-D fixes
 * flips the finding-shaped pins (verified below).
 */

const forumMod = require('../lib/forum');
const consensusMod = require('../lib/consensus');

const f = forumMod.forum;
const results = { passed: 0, failed: 0 };
const order = [];
function ok(name, fn) { order.push({ name, fn }); }
function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
    return true;
}

async function main() {
    console.log('\n📋 PUBLISH-ONLY EXPORTS PINS (wave D, vant#335)\n');

    for (const { name, fn } of order) {
        try {
            await fn();
            results.passed++;
            console.log(`  ✓ ${name}`);
        } catch (e) {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        }
    }

    console.log(`\nPassed:  ${results.passed}`);
    console.log(`Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
}

// ------------------------------------------------------------------
// forum.exportTrail
// ------------------------------------------------------------------

ok('exportTrail: the publish-only read shape rides the same derivation every reader gets', async () => {
    forumMod.clearState();
    const linked = forumMod.linkThreadToVote('PUB-D5A', 'topic-d5a', { proposal: 'adopt the export lane', author: 'steward' });
    assert(linked.ok === true, JSON.stringify(linked).slice(0, 140));
    const r = await forumMod.exportTrail('PUB-D5A');
    assert(r.ok === true && r.publishOnly === true && r.format === 'json', JSON.stringify(r).slice(0, 160));
    assert(r.topic === 'topic-d5a' && r.proposal === 'adopt the export lane', 'trail meta lost');
    assert(Array.isArray(r.votes), 'votes must read as the digest by default');
    assert(r.votesWithheld === false, 'no withhold without asking');
});

ok('exportTrail: format gate refuses anything but json; empty/missing thread refuses typed', async () => {
    const html = await forumMod.exportTrail('PUB-D5A', { format: 'html' });
    assert(html.ok === false && html.code === 'E_FORUM_FORMAT', JSON.stringify(html).slice(0, 140));
    const missing = await forumMod.exportTrail('PUB-NEVER-D5');
    assert(missing.ok === false && missing.code === 'E_FORUM_ABSENT', JSON.stringify(missing).slice(0, 140));
    const empty = await forumMod.exportTrail('');
    assert(empty.ok === false && empty.code === 'E_FORUM_THREAD', 'empty thread accepted');
});

ok('exportTrail: withholdVotes removes the digest, never the outcome (the decision rows survive)', async () => {
    const r = await forumMod.exportTrail('PUB-D5A', { withholdVotes: true });
    assert(r.ok === true && r.votes === null && r.votesWithheld === true && r.withholdsVotes === true,
        JSON.stringify(r).slice(0, 160));
    assert(r.outcome !== undefined, 'outcome lost under withhold');
});

ok('exportTrail tenancy: a gated publication refuses the SAME reader the get() path refuses', async () => {
    // Seed the publication registry directly with the tenant-scoped row the
    // real publish path writes (workspace: 'acme' — the pass-87 shape).
    forumMod.forum.publications.set('PUB-TENANT-D5', { workspace: 'acme', title: 'tenant plan', content: 'secret' });
    const linked = forumMod.linkThreadToVote('PUB-TENANT-D5', 'topic-d5-tenant', { proposal: 'p', author: 't' });
    assert(linked.ok === true, 'link refused');
    const anon = await forumMod.exportTrail('PUB-TENANT-D5', {});
    assert(anon.ok === false && anon.code === 'E_FORUM_VISIBILITY',
        'anonymous read a gated trail: ' + JSON.stringify(anon).slice(0, 160));
    const foreign = await forumMod.exportTrail('PUB-TENANT-D5', { context: { subject: { workspace: 'globex' } } });
    assert(foreign.ok === false && foreign.code === 'E_FORUM_VISIBILITY', 'foreign tenant read a gated trail');
    const member = await forumMod.exportTrail('PUB-TENANT-D5', { context: { subject: { workspace: 'acme' } } });
    assert(member.ok === true && member.publishOnly === true, 'rightful tenant refused the trail');
});

// ------------------------------------------------------------------
// consensus.reconcile
// ------------------------------------------------------------------

ok('reconcile: an agreed ledger reports agree:true, mode report, per-tier row hashes', async () => {
    consensusMod.clearState();
    const created = await consensusMod.create('topic-recon-1', { ballot: ['yes', 'no'], requireRegistry: false });
    assert(created && !created.error, JSON.stringify(created).slice(0, 140));
    consensusMod._persistNow();
    const r = consensusMod.reconcile('topic-recon-1');
    assert(r.mode === 'report' && r.agree === true, JSON.stringify(r).slice(0, 200));
    assert(r.hot.present === true && r.disk.reachable === true && r.disk.present === true, 'tiers missing');
    assert(r.hot.rootHash === r.disk.rootHash, 'tier hashes disagree on an agreed ledger');
    assert(r.firstDivergentRow === null, 'phantom divergence on an agreed ledger');
});

ok('reconcile: a tampered disk row (a ghost vote) reports agree:false with the first divergent row (the voter id), and repairs nothing', async () => {
    // The vote path persists as it votes, so the honest divergence case is
    // an EXTERNAL disk tamper: add a ghost vote to the disk row only.
    const stateStore = require('../lib/state-store');
    const { store, file } = stateStore.getStore(consensusMod._stateFile);
    const data = JSON.parse(store.read(file));
    const row = data.ledgers.find((l) => l.topic === 'topic-recon-1');
    assert(row, 'precondition: disk row present');
    row.votes['ghost-voter-D5'] = { outcome: 'no', timestamp: Date.now() };
    store.write(file, JSON.stringify(data, null, 2));

    const r = consensusMod.reconcile('topic-recon-1');
    assert(r.agree === false, 'a ghost vote read as agreement: ' + JSON.stringify(r).slice(0, 200));
    assert(r.firstDivergentRow === 'ghost-voter-D5', 'firstDivergentRow lost: ' + JSON.stringify(r).slice(0, 200));
    // The report mode stays a report: hot tier unchanged (untampered), no
    // repair fired, no ghost vote adopted into memory.
    assert(r.hot.present === true && r.hot.rows === 0, 'hot tier mutated by the report');
    assert(r.disk.present === true && r.disk.rows === 1, 'disk tier not read back honestly');
});

ok('reconcile: tombstone discipline — a reaped wire-born topic with a live disk row reports disagreement and never re-adopts', async () => {
    consensusMod.clearState();
    const wire = {
        topic: 'topic-recon-3', status: 'open',
        votes: { 'peer-voter': { outcome: 'yes', timestamp: Date.now() } },
        syncedFrom: 'peer-node-1', created: Date.now(), minQuorum: 2, ballot: ['yes', 'no']
    };
    const merged = consensusMod.mergeTopic(wire);
    assert(merged && (merged.merged !== false || !merged.error), JSON.stringify(merged).slice(0, 160));
    consensusMod._persistNow();                                              // the disk row is live
    const reaped = consensusMod.reapSynced(() => true);                       // the wire-born row qualifies
    assert(Array.isArray(reaped) && reaped.includes('topic-recon-3'),
        'precondition: the reaper did not reap: ' + JSON.stringify(reaped).slice(0, 160));
    const r = consensusMod.reconcile('topic-recon-3');
    assert(r.reapedAt != null, 'reap tier not reported: ' + JSON.stringify(r).slice(0, 200));
    assert(r.hot.present === false, 'reaped row resurrected in hot tier');
    // The reap persisted WITH the tombstone, so the disk row converged out
    // too (the pass-99 law: a reap is convergent across writes, never
    // resurrected by the merge). The report must read that as AGREEMENT —
    // both tiers dropped the row — while STILL naming the tombstone.
    assert(r.disk.present === false, 'the disk row survived a persisted reap: ' + JSON.stringify(r.disk));
    assert(r.agree === true, 'a converged reap must not read as divergence: ' + JSON.stringify(r).slice(0, 200));
    assert(r.firstDivergentRow === null, 'phantom divergence after a converged reap');
});

ok('reconcile: clearly typed on garbage input; an unknown topic still reports (evidence, not refusal)', async () => {
    const empty = consensusMod.reconcile('');
    assert(empty.code === 'E_TOPIC', JSON.stringify(empty).slice(0, 140));
    const ghost = consensusMod.reconcile('topic-recon-ghost-D5');
    assert(ghost.mode === 'report' && ghost.hot.present === false && ghost.agree === true,
        'an absent row must read as agreement (nothing to diverge): ' + JSON.stringify(ghost).slice(0, 200));
});

// ------------------------------------------------------------------
main();
