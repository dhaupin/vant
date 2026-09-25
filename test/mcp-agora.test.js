#!/usr/bin/env node
/**
 * MCP Agora surface tests (pass 46)
 *
 * Pins the agora loop's MCP surface through the REAL dispatch door
 * (mcp.execute = rules -> schema validation -> handler, same as an MCP
 * client hits):
 *   1. the 10 agora tools are registered
 *   2. forum_vote creates a REAL consensus vote (the old tool passed
 *      (forumId, userId, topic, vote) into vote(proposal, options) — an
 *      "up vote" silently CREATED a vote titled by the forumId)
 *   3. forum_castVote + consensus_vote round-trip; double-vote refused
 *   4. consensus_tally/get/list read the ledger
 *   5. schema door: missing/wrong-typed params rejected before handlers run
 *
 * Run: node test/mcp-agora.test.js
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

// Clean brain state BEFORE requiring modules (load-on-init races rm).
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'state'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'orgchart'), { recursive: true, force: true });

const mcp = require(path.join(ROOT, 'lib', 'mcp'));
const consensus = require(path.join(ROOT, 'lib', 'consensus'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));

registry.clearState();
for (const v of ['mcp-voter-a', 'mcp-voter-b']) {
    registry.register({ id: v, name: v, host: '127.0.0.1', port: 1 });
}

const AGORA_TOOLS = [
    'forum_enter', 'forum_message', 'forum_vote', 'forum_castVote', 'forum_status',
    'consensus_create', 'consensus_vote', 'consensus_tally', 'consensus_get', 'consensus_list'
];

async function main() {
    console.log('\n🛠  MCP AGORA SURFACE TESTS (pass 46)\n');

    await test('the 10 agora tools are registered', async () => {
        const names = new Set(mcp.listTools().map(t => t.name));
        for (const t of AGORA_TOOLS) assert(names.has(t), 'missing tool: ' + t);
    });

    let voteId = null;
    await test('forum_vote creates a REAL consensus vote (stale-wiring fix)', async () => {
        const r = await mcp.execute('forum_vote', { proposal: 'MCP surface roundtrip probe', minQuorum: 2 });
        assert(!r.error, 'forum_vote errored: ' + JSON.stringify(r));
        assert(r.voted === true && r.voteId, 'no voteId returned: ' + JSON.stringify(r));
        voteId = r.voteId;
        // The vote must exist in the consensus LEDGER (the old mis-wired
        // tool created a vote titled by forumId; this one must land where
        // it says it does, with the forum metadata stamp).
        const ledger = consensus.get(voteId);
        assert(ledger, 'ledger not found for ' + voteId);
        assert(ledger.metadata && ledger.metadata.viaForum, 'forum metadata stamp missing');
        assert(ledger.metadata.proposal === 'MCP surface roundtrip probe', 'proposal not in metadata');
    });

    await test('forum_castVote + consensus_vote round-trip; double-vote refused', async () => {
        const v1 = await mcp.execute('forum_castVote', { voteId, choice: 'yes', agentId: 'mcp-voter-a' });
        assert(v1.cast === true, 'forum_castVote failed: ' + JSON.stringify(v1));
        const v2 = await mcp.execute('consensus_vote', { topic: voteId, outcome: 'yes', agentId: 'mcp-voter-b' });
        assert(!v2.error || v2.totalVotes, 'consensus_vote failed: ' + JSON.stringify(v2));
        // One vote per agent (consensus protection, via MCP this time).
        // With minQuorum=2 the topic PASSES on the second vote, so the
        // refusal comes from the closed-topic gate (checked before the
        // hasVoted gate) — any refusal is correct as long as it doesn't count.
        const dupe = await mcp.execute('consensus_vote', { topic: voteId, outcome: 'no', agentId: 'mcp-voter-a' });
        assert(!!dupe.error, 'double vote accepted: ' + JSON.stringify(dupe));
        assert(!dupe.totalVotes, 'dupe carried a tally: ' + JSON.stringify(dupe));
    });

    await test('consensus_tally/get/list read the ledger', async () => {
        const tally = await mcp.execute('consensus_tally', { topic: voteId });
        assert(tally.totalVotes === 2, 'tally wrong: ' + JSON.stringify(tally));
        assert(tally.leading === 'yes', 'tally winner wrong');
        const got = await mcp.execute('consensus_get', { topic: voteId });
        assert(got && got.topic === voteId, 'consensus_get failed');
        const list = await mcp.execute('consensus_list', {});
        assert(Array.isArray(list) && list.some(l => l.topic === voteId), 'consensus_list missing topic');
    });

    await test('schema door: missing/wrong-typed params rejected before handlers run', async () => {
        const missing = await mcp.execute('consensus_vote', { topic: 'x' }); // no outcome/agentId
        assert(missing.error === 'MCP_INPUT_INVALID', 'missing params not caught: ' + JSON.stringify(missing));
        const badType = await mcp.execute('forum_vote', { proposal: 42 }); // number, not string
        assert(badType.error === 'MCP_INPUT_INVALID', 'wrong type not caught: ' + JSON.stringify(badType));
        const noOpts = await mcp.execute('consensus_create', { topic: 'mcp-schema-x' }); // options required
        assert(noOpts.error === 'MCP_INPUT_INVALID', 'missing options not caught: ' + JSON.stringify(noOpts));
    });

    console.log(`\n=== MCP agora surface: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Test harness error:', e);
    process.exit(1);
});
