#!/usr/bin/env node
/**
 * MCP Agora-Sync surface tests (pass 56 / Wave A — prd-mesh.md)
 *
 * Pins the mesh's MCP surface through the REAL dispatch door
 * (mcp.execute = rules -> schema validation -> handler):
 *   1. the 5 agora-sync tools are registered
 *   2. agora_vote round-trip: tool call -> agora-sync.vote -> owner
 *      gates (REAL consensus verdict) -> ack verdict
 *   3. refusal shapes: unconfigured bus; double-vote passthrough;
 *      client-side validation never hits the wire
 *   4. agora_pull round-trip: pull -> merge locally (re-derived)
 *   5. agora_nodes / agora_sync_status read-only surfaces
 *   6. schema door: missing params rejected before handlers run
 *
 * Transport is NOT under test here (crew-bus 13/13, agora-sync 7/7,
 * demos v0.2/v0.3 + the JV exercise cover the wire). The default bus's
 * send is replaced with a CAPTURING stub: envelopes are handed to the
 * owner-stub process, whose REAL agora-sync dispatchers run REAL
 * consensus gates; its acks are replayed into the default bus's
 * dispatchers exactly as the wire would deliver them.
 *
 * Run: node test/mcp-agora-sync.test.js
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'state'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'orgchart'), { recursive: true, force: true });

const mcp = require(path.join(ROOT, 'lib', 'mcp'));
const consensus = require(path.join(ROOT, 'lib', 'consensus'));
const agoraSync = require(path.join(ROOT, 'lib', 'agora-sync'));
const crewBusMod = require(path.join(ROOT, 'lib', 'crew-bus'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));

registry.clearState();
for (const v of ['mcp-principal', 'mcp-second']) {
    registry.register({ id: v, name: v, host: '127.0.0.1', port: 1 });
}

// Owner-side stub bus: REAL agora-sync dispatchers + REAL consensus.
const ownerHandlers = new Map();
const ownerSent = [];
const ownerBus = {
    onDispatch: (t, fn) => ownerHandlers.set(t, fn),
    send: async (to, type, payload) => { ownerSent.push({ to, type, payload }); return { ok: true, handlers: 1 }; },
    nodes: () => [{ name: 'mcp-self', url: 'http://127.0.0.1:1' }],
    status: () => ({ name: 'mcp-owner', agentId: 'owner-principal', configured: true, listening: true, peers: ['mcp-self'] })
};

// Wire capture on the DEFAULT bus (the node the tools operate).
const wire = [];

function ownerReceives(type) {
    const envs = wire.filter((w) => w.type === type);
    const last = envs[envs.length - 1];
    assert(last, 'no ' + type + ' envelope on the wire');
    ownerHandlers.get(type)({ from: 'mcp-self', payload: last.payload });
}

function deliverToSelf(type) {
    const acks = ownerSent.filter((s) => s.type === type);
    const last = acks[acks.length - 1];
    assert(last, 'no ' + type + ' from the owner');
    crewBusMod.default._state.dispatchers.get(type)({ from: 'mcp-owner', payload: last.payload });
}

async function main() {
    console.log('\n🛠  MCP AGORA-SYNC SURFACE TESTS (pass 56 / Wave A)\n');

    await test('the 5 agora-sync tools are registered', async () => {
        const names = new Set(mcp.listTools().map(t => t.name));
        for (const t of ['agora_vote', 'agora_pull', 'agora_push', 'agora_nodes', 'agora_sync_status']) {
            assert(names.has(t), 'missing tool: ' + t);
        }
    });

    await test('schema door: missing params rejected before handlers run', async () => {
        const r1 = await mcp.execute('agora_vote', { topic: 'x', outcome: 'yes' });
        assert(r1 && (r1.error || r1.code) && !r1.voted, 'missing node must be schema-rejected: ' + JSON.stringify(r1));
        const r2 = await mcp.execute('agora_pull', { node: 'mcp-owner' });
        assert(r2 && (r2.error || r2.code), 'missing topic must be schema-rejected: ' + JSON.stringify(r2));
    });

    await test('unconfigured bus: structured refusal, not a crash', async () => {
        const pre = await mcp.execute('agora_vote', { node: 'mcp-owner', topic: 'p56-topic', outcome: 'yes' });
        assert(pre.voted === false && /bus_not_configured/.test(pre.reason || ''), 'unconfigured bus must refuse cleanly: ' + JSON.stringify(pre));
    });

    await test('agora_vote round-trip: tool -> agora-sync -> owner gates -> ack verdict', async () => {
        // Node identity: what an agent's process has after configure().
        crewBusMod.configure({ name: 'mcp-self', port: 59999, secret: 'p56-secret-' + process.pid, agentId: 'mcp-principal' });
        crewBusMod.default.send = async (to, type, payload) => { wire.push({ to, type, payload }); return { ok: true, handlers: 1 }; };
        agoraSync.install(crewBusMod.default);
        agoraSync.install(ownerBus);

        // Owner's REAL ledger; the owner's gates decide the verdict.
        await consensus.create('p56-topic', { options: ['yes', 'no'], minQuorum: 2, useTrustWeight: false });

        const p = mcp.execute('agora_vote', { node: 'mcp-owner', topic: 'p56-topic', outcome: 'yes' });
        await wait(30);
        ownerReceives('vote');          // wire -> owner's dispatchers
        await wait(40);                 // owner's lock-wrapped vote + ack
        deliverToSelf('vote.ack');      // wire -> our dispatchers
        const r = await p;
        assert(r.voted === true, 'tool vote denied: ' + JSON.stringify(r));
        assert(r.tally && r.tally.totalVotes === 1, 'tool ack tally wrong: ' + JSON.stringify(r.tally));
        const t = consensus.tally('p56-topic');
        assert(t.totalVotes === 1 && t.status === 'quorum', 'owner ledger wrong: ' + JSON.stringify(t));
        const env = wire.find((w) => w.type === 'vote');
        assert(env.payload.agentId === 'mcp-principal', 'ballot must attribute to the node principal');
        assert(!JSON.stringify(env.payload).includes('secret'), 'no secrets on the wire payload');
    });

    await test('refusals passthrough: double vote via owner gate; client validation stays local', async () => {
        const p2 = mcp.execute('agora_vote', { node: 'mcp-owner', topic: 'p56-topic', outcome: 'no' });
        await wait(30);
        ownerReceives('vote');
        await wait(40);
        deliverToSelf('vote.ack');
        const r2 = await p2;
        assert(r2.voted === false && /Already voted/.test(r2.reason || ''), 'double vote must passthrough as denial: ' + JSON.stringify(r2));

        const before = wire.length;
        const bad = await mcp.execute('agora_vote', { node: 'mcp-owner', topic: 'bad topic!', outcome: 'yes' });
        assert(bad.voted === false && bad.reason === 'invalid_topic', 'bad topic must be refused locally: ' + JSON.stringify(bad));
        assert(wire.length === before, 'invalid ballot hit the wire');
    });

    await test('agora_pull round-trip: pull from owner, merge locally re-derived', async () => {
        // Local view is cold: the pull must CREATE the local ledger.
        consensus._resetHydration();
        const p = mcp.execute('agora_pull', { node: 'mcp-owner', topic: 'p56-topic' });
        await wait(30);
        ownerReceives('state.request');
        await wait(40);
        deliverToSelf('state');
        const r = await p;
        assert(r.pulled === true && r.merged && r.merged.merged === true, 'pull tool failed: ' + JSON.stringify(r));
        const t = consensus.tally('p56-topic');
        assert(t.totalVotes === 1 && t.status === 'quorum', 'merged ledger not tallyable locally: ' + JSON.stringify(t));
    });

    await test('agora_push: local ledger exported to the owner (merge-only on their side)', async () => {
        const p = mcp.execute('agora_push', { node: 'mcp-owner', topic: 'p56-topic' });
        await wait(30);
        const env = wire.filter((w) => w.type === 'state.push').pop();
        assert(env && env.payload.ledger && env.payload.ledger.topic === 'p56-topic', 'push envelope malformed');
        const r = await p;
        assert(r.pushed === true && r.ok === true, 'push tool failed: ' + JSON.stringify(r));
    });

    await test('agora_nodes + agora_sync_status: read-only identity surfaces', async () => {
        const nodes = await mcp.execute('agora_nodes', {});
        assert(nodes.self && nodes.self.agentId === 'mcp-principal' && nodes.self.configured === true, 'self identity wrong: ' + JSON.stringify(nodes.self));
        const st = await mcp.execute('agora_sync_status', {});
        assert(typeof st.installedBuses === 'number' && st.installedBuses >= 2, 'status missing installed buses: ' + JSON.stringify(st));
        assert(st.buses.some((b) => b.agentId === 'mcp-principal'), 'status lacks the node principal');
        assert(st.buses.every((b) => !b.secret), 'status must never leak secrets');
    });

    console.log(`\n=== MCP agora-sync surface: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Test harness error:', e);
    process.exit(1);
});
