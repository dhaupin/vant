#!/usr/bin/env node
/**
 * Pass-184 wiring pins — the three WIRING.md "NEXT WIRING CANDIDATES (pass 184+)".
 *
 *   Candidate 1 (#153): the bounded HotSet backs the tree tier's repeated
 *     disk reads. treeFor reuses its parsed payload for an UNCHANGED file
 *     (fingerprint = mtime:size), falls through honestly on any change —
 *     external tamper changes the fingerprint, so no stale cache can bless
 *     diverged disk state. Hot-set eviction touches only the cache.
 *   Candidate 2 (#158): genesis's topology write is the FIRST WRITER for the
 *     per-brain `universeSeed` durable override (resolveUniverse precedence:
 *     explicit universe > VANT_UNIVERSE_SEED env > per-brain config > fixed
 *     default). Never clobbers an existing pin; never overrides the env.
 *   Candidate 3 (Wave F §7 adoption wave 2): sync.js gains verifyProvider/
 *     verifyAllProviders (honest: unreachable = verified:false); agora-sync
 *     stamps its state-reply with the owner's locally re-derived tally hash
 *     and the asker verifies against its own post-merge re-tally — a
 *     mismatch is reported, never blessed.
 */

'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0 };

function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => { results.passed++; console.log('  ✓ ' + name); })
        .catch((e) => { results.failed++; console.log('  ✗ ' + name + ': ' + (e.message || e).split('\n')[0]); });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

async function main() {
    // ==================== CANDIDATE 1: hotset backs tree reads ====================
    console.log('\n▓ Candidate 1 — HotSet (#153) backs state-store tree reads\n');

    const stateStore = require(path.join(ROOT, 'lib', 'state-store'));
    const PIN_FILE = 'state/wiring184-hotset.json';

    await test('hot: first treeFor is a miss; second read HITS with an identical root', async () => {
        stateStore.treeHot.clear();
        fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', PIN_FILE), { force: true });
        stateStore.persist({ moduleName: 'wiring184', stateFile: PIN_FILE, data: { n: 1 } });
        stateStore.treeHot.clear();

        const r1 = stateStore.treeFor(PIN_FILE);
        const m1 = stateStore.treeHot.metrics();
        assert(r1.state === 'PRESENT', 'treeFor present after persist');
        assert(m1.misses === 1, 'first read is a miss, metrics ' + JSON.stringify(m1));

        const r2 = stateStore.treeFor(PIN_FILE);
        const m2 = stateStore.treeHot.metrics();
        assert(r2.state === 'PRESENT' && r2.rootHash === r1.rootHash, 'second read identical root');
        assert(m2.hits === 1, 'second read hits the hot set, metrics ' + JSON.stringify(m2));
    });

    await test('hot: external tamper changes the fingerprint — NO stale cache blessing', async () => {
        stateStore.treeHot.clear();
        stateStore.treeFor(PIN_FILE); // warm cache
        fs.writeFileSync(path.join(ROOT, 'models', 'private', 'vant', PIN_FILE),
            JSON.stringify({ kind: 'vant-protocol-state', module: 'wiring184', n: 42, savedAt: 1 }, null, 2));
        const r3 = stateStore.treeFor(PIN_FILE);
        const v = r3.tree && r3.tree.get('/wiring184/n');
        const vRaw = v && typeof v.value === 'object' && 'value' in v.value ? v.value.value : v && v.value;
        assert(vRaw === 42, 'tampered disk state served honestly, got ' + JSON.stringify(v));
    });

    await test('hot: hydrate path unaffected by the hot backing', async () => {
        let applied = null;
        const r = stateStore.hydrate({
            moduleName: 'wiring184',
            stateFile: PIN_FILE,
            apply: (d) => { applied = d; }
        });
        assert(r.applied === true && applied && applied.n === 42, 'hydrate reads through, applied=' + JSON.stringify(applied && applied.n));
    });

    await test('hot: missing file typed ABSENT (hot set caches only what existed)', async () => {
        const r = stateStore.treeFor('state/wiring184-never.json');
        assert(r.state === 'ABSENT' && r.reason === 'missing', 'got ' + JSON.stringify(r));
    });

    // ==================== CANDIDATE 2: genesis universeSeed writer ====================
    console.log('\n▓ Candidate 2 — genesis writes the durable universeSeed (#158)\n');

    await test('universe: the writer is real, precedence-correct, and never clobbers', async () => {
        const genesisSrc = fs.readFileSync(path.join(ROOT, 'lib', 'genesis.js'), 'utf8');
        const seedsSrc = fs.readFileSync(path.join(ROOT, 'lib', 'state', 'seeds.js'), 'utf8');
        assert(/_persistUniverseSeed\(\)/.test(genesisSrc), 'genesis topology write calls _persistUniverseSeed');
        assert(/VANT_UNIVERSE_SEED\)\s*return/.test(genesisSrc), 'writer yields to an explicit env universe');
        assert(/cfg\.universeSeed\s*===\s*'string'/.test(genesisSrc), 'writer never clobbers an existing config pin');
        assert(/resolveUniverse\(\{\}\)/.test(genesisSrc), 'writer derives from the SAME SeedChain resolution');
        assert(/universeSeed/.test(seedsSrc) && /cfg\.universeSeed/.test(seedsSrc), 'seeds resolveUniverse READ path consumes the per-brain config key');
    });

    await test('universe: config-pinned universe === explicit universe (read path real)', async () => {
        const config = require(path.join(ROOT, 'lib', 'config'));
        const { resolveUniverse } = require(path.join(ROOT, 'lib', 'state', 'seeds'));
        const brain = config.currentBrainName();
        const probe = 'w184-universe-' + Date.now().toString(36);
        config.setConfig('universeSeed', probe, { userCtx: null });
        try {
            const viaConfig = resolveUniverse({
                configPath: path.join(ROOT, 'models', 'private', brain, 'config.json')
            });
            const viaExplicit = resolveUniverse({ universe: probe });
            assert(viaConfig.equals(viaExplicit), 'config pin resolves to the same 32 bytes');
        } finally {
            const p = path.join(ROOT, 'models', 'private', brain, 'config.json');
            const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
            delete cfg.universeSeed;
            fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
            config.setConfig('universeSeed', null, { userCtx: null });
        }
    });

    // ==================== CANDIDATE 3: transport verify (Wave F adoption) ====================
    console.log('\n▓ Candidate 3 — sync verifyProvider + agora tallyHash stamp\n');

    const sync = require(path.join(ROOT, 'lib', 'sync'));
    const agoraSync = require(path.join(ROOT, 'lib', 'agora-sync'));
    const consensus = require(path.join(ROOT, 'lib', 'consensus'));

    await test('verify sync: unknown provider reported verified:false (honest verify, Wave F rule)', async () => {
        const missing = await sync.verifyProvider('w184-none');
        assert(missing.verified === false && missing.reason === 'not_found', JSON.stringify(missing));
    });

    await test('verify sync: reachable fake verifies; unreachable fake is UNVERIFIED, never blessed', async () => {
        class FakeProvider {
            getType() { return 'w184-fake'; }
            isConfigured() { return true; }
            async getRepoInfo() { return { owner: 'w', repo: 'r' }; }
            async currentBranch() { return 'main'; }
        }
        class BrokenProvider extends FakeProvider {
            async getRepoInfo() { throw new Error('unreachable'); }
        }
        sync._setTestProvider('w184-fake', new FakeProvider());
        sync._setTestProvider('w184-broken', new BrokenProvider());
        try {
            const ok = await sync.verifyProvider('w184-fake');
            assert(ok.verified === true && ok.repo === 'w/r', JSON.stringify(ok));

            const bad = await sync.verifyProvider('w184-broken');
            assert(bad.verified === false && /unreachable/.test(bad.reason), 'verified must stay false, got ' + JSON.stringify(bad));

            const all = await sync.verifyAllProviders({ opTimeoutMs: 5000 });
            assert(typeof all.verified === 'number' && typeof all.broken === 'number' && all.results['w184-fake'], 'verifyAllProviders aggregates');
        } finally {
            sync._clearTestProviders();
        }
    });

    await test('verify agora: owner-tally stamp round-trip — asker re-derivation AGREES', async () => {
        const handlers = new Map();
        const sent = [];
        const bus = {
            onDispatch: (t, fn) => { if (!handlers.has(t)) handlers.set(t, fn); },
            send: async (to, type, payload) => { sent.push({ to, type, payload }); return { ok: true, handlers: 1 }; },
            nodes: () => [{ name: 'w184-owner', url: 'http://127.0.0.1:1' }],
            status: () => ({ name: 'w184-bus', agentId: 'w184-a' })
        };
        agoraSync.install(bus);

        const reg = require(path.join(ROOT, 'lib', 'node-registry'));
        for (const v of ['w184-a', 'w184-b', 'w184-c']) reg.register({ id: v, name: v, host: '127.0.0.1', port: 1 });

        // Unique topic per run (one-vote ledgers persist across processes).
        // Two ballots → tally in the open branch → a hash exists to stamp.
        const TOPIC = 'w184v' + Date.now().toString(36);
        const created = consensus.create(TOPIC, { minQuorum: 2, ballot: ['yes', 'no'] });
        assert(!created || !created.error, 'topic create refused: ' + JSON.stringify(created));
        await consensus.vote(TOPIC, 'yes', 'w184-a');
        await consensus.vote(TOPIC, 'no', 'w184-b');

        const pending = agoraSync.pull(bus, 'w184-owner', TOPIC);
        const req = sent.find(s => s.type === 'state.request');
        assert(req && req.payload.topic === TOPIC, 'pull sent a state.request');

        const ledger = consensus.exportTopic(TOPIC);
        const t = consensus.tally(TOPIC);
        const ownersHash = t && t.hash ? String(t.hash) : null;
        assert(ownersHash, 'owner tally re-derives a hash to stamp (status=' + (t && t.status) + ')');

        handlers.get('state')({
            from: 'w184-owner',
            payload: { ledger, tallyHash: ownersHash, from: 'w184-owner', reqId: req.payload.reqId }
        });
        const pulled = await pending;
        assert(pulled.pulled === true, 'pull completed');
        assert(pulled.merged && pulled.merged.merged === true, 'ledger merged locally: ' + JSON.stringify(pulled.merged));
        assert(pulled.verify && pulled.verify.verified === true,
            'transport verify agrees, got ' + JSON.stringify(pulled.verify));
    });

    await test('verify agora: a FORGED stamp is reported verified:false — never blessed', async () => {
        const handlers = new Map();
        const sent = [];
        const bus = {
            onDispatch: (t, fn) => { if (!handlers.has(t)) handlers.set(t, fn); },
            send: async (to, type, payload) => { sent.push({ to, type, payload }); return { ok: true, handlers: 1 }; },
            nodes: () => [{ name: 'w184-owner', url: 'http://127.0.0.1:1' }],
            status: () => ({ name: 'w184-bus', agentId: 'w184-a' })
        };
        agoraSync.install(bus);
        const TOPIC = 'w184f' + Date.now().toString(36);
        const created = consensus.create(TOPIC, { minQuorum: 2, ballot: ['yes', 'no'] });
        assert(!created || !created.error, 'create refused: ' + JSON.stringify(created));
        await consensus.vote(TOPIC, 'yes', 'w184-a');
        await consensus.vote(TOPIC, 'no', 'w184-b');

        const pending = agoraSync.pull(bus, 'w184-owner', TOPIC);
        const req = sent.filter(s => s.type === 'state.request').pop();
        const ledger = consensus.exportTopic(TOPIC);
        handlers.get('state')({
            from: 'w184-owner',
            payload: { ledger, tallyHash: 'deadbeef-forged', from: 'w184-owner', reqId: req.payload.reqId }
        });
        const pulled = await pending;
        assert(pulled.pulled === true && pulled.verify && pulled.verify.verified === false,
            'forged stamp reported unverified, got ' + JSON.stringify(pulled.verify));
    });

    // ==================== SUMMARY ====================
    console.log('\n=== wiring-184 pins: ' + results.passed + ' passed, ' + results.failed + ' failed ===');
    process.exit(results.failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error('Runner failed:', e.message);
    process.exit(1);
});
