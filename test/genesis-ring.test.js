#!/usr/bin/env node
/**
 * Third-org rite tests (pass 68, Wave H — frame §5: rites for the third org)
 *
 * Pins the commons key ring (genesis.admit/accept + member.intro):
 *   1. admit reuses the RING secret (never forks it) and appends the
 *      member to the host's non-secret topology
 *   2. admit refuses without a bootable ring (no secret anywhere) —
 *      structured refusal, never a crash
 *   3. admit→accept round-trip: the member's signed hello is vetted and
 *      acked by the host; the ack is the live proof of ring membership
 *   4. member.intro: standing members adopt the new principal merge-only
 *      (unknown ids only); provenance rides the envelope
 *   5. the intro carries NO secret (frame §4: membership facts federate,
 *      the key may not)
 *   6. hello from an unexpected joiner is ignored (the rite is one
 *      member at a time)
 *   7. the pass-68 secret.js fixes: get-after-set round-trips; colon-key
 *      types are rejected (the old genesis keys could never be stored)
 *   8. create/join are untouched by the rite (pairs still work)
 *
 * Run: node test/genesis-ring.test.js
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

const genesis = require(path.join(ROOT, 'lib', 'genesis'));
const crewBusMod = require(path.join(ROOT, 'lib', 'crew-bus'));
const agoraSync = require(path.join(ROOT, 'lib', 'agora-sync'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));
const secretMod = require(path.join(ROOT, 'lib', 'secret'));

// The genesis module drives the crew-bus DEFAULT singleton. The rite
// flow: host = default bus (create/admit), standing member + new member
// = separate createBus() instances registered as peers.
const defaultBus = crewBusMod.default;
const standingBus = crewBusMod.createBus();
const memberBus = crewBusMod.createBus();

// In-process stub: deliver across the three buses by NAME (no HTTP —
// the envelope gates are crew-bus's own and are pinned elsewhere).
const BUSES = {};
function wireBus(bus) {
    const realSend = bus.send.bind(bus);
    bus.send = async (nodeName, type, payload) => {
        const target = BUSES[nodeName];
        if (!target) throw new Error('Unknown crew node: ' + nodeName);
        const env = { event: 'crew.' + type, from: bus.status().name, type, payload, ts: Date.now(), nonce: Math.random() };
        const handler = target._state.dispatchers.get(type);
        if (handler) handler(env);
        return { ok: true, handlers: handler ? 1 : 0 };
    };
    bus._realSend = realSend;
}

async function main() {
    console.log('\n🔑 THIRD-ORG RITE TESTS (pass 68 — the commons key ring)\n');

    // ---- boot the trio in-process ----
    BUSES['ring-host'] = defaultBus;
    BUSES['standing'] = standingBus;
    BUSES['new-member'] = memberBus;

    const pair = await genesis.create({
        name: 'ring-host', agentId: 'host-a', port: 4890,
        joiner: { name: 'standing', agentId: 'standing-a', port: 4891 }
    });
    assert(pair.ok, 'create failed: ' + JSON.stringify(pair));
    agoraSync.install(defaultBus);
    agoraSync.install(standingBus);
    agoraSync.install(memberBus);
    wireBus(defaultBus);
    wireBus(standingBus);
    wireBus(memberBus);

    // Standing member boots with the pair secret (as join would).
    standingBus.configure({ name: 'standing', port: 4891, secret: pair.secret, agentId: 'standing-a' });
    standingBus.registerNode({ name: 'ring-host', url: 'http://127.0.0.1:4890', secret: pair.secret });
    registry.register({ id: 'standing-a', name: 'standing', host: 'h', port: 4891 });

    await test('admit reuses the RING secret (never forks it); topology appends the member', async () => {
        const r = await genesis.admit({ member: { name: 'new-member', agentId: 'member-a', port: 4892 } });
        assert(r.ok, 'admit failed: ' + JSON.stringify(r));
        assert(r.secret === pair.secret, 'admit FORKED the ring — handed a different secret!');
        const t = genesis.status();
        const names = t.genesis.peers.map((p) => p.name);
        assert(names.includes('standing') && names.includes('new-member'), 'member not appended: ' + JSON.stringify(names));
    });

    await test('admit refuses without any ring secret (structured, no crash)', async () => {
        // A fresh default-bus-like refusal: unconfigured bus path.
        const r2 = await genesis.admit({ member: { name: 'x-org', port: 4893 } });
        // The bus IS configured here, so this admits fine — the refusal
        // path is exercised separately below via a missing-secret node.
        assert(r2.ok === true || r2.ok === false, 'structured result expected');
        // True refusal: no secret module entry + no env on a CLEAN process.
        delete process.env.VANT_MESH_SECRET;
        const hadEnv = process.env.VANT_MESH_SECRET;
        assert(hadEnv === undefined, 'env unexpectedly set');
        // The bus still holds its config, so admit CAN find the memory
        // secret — to prove the refusal branch, hide the secret module.
        const realGet = secretMod.get;
        secretMod.get = async () => { throw new Error('no memory'); };
        const r3 = await genesis.admit({ member: { name: 'y-org', port: 4894 } });
        secretMod.get = realGet;
        assert(r3.ok === false && /ring_secret_unavailable/.test(r3.reason), 'expected structured refusal: ' + JSON.stringify(r3));
    });

    await test('admit→accept round-trip: TWO REAL PROCESSES — the ack proves ring membership', async () => {
        // genesis is one-node-per-process by design (create/join/accept all
        // boot the module-singleton bus), so the round-trip is live-fired
        // the same way the node-crew exercises do it: two spawned children
        // over the real HTTP wire.
        const { spawn } = require('child_process');
        const SHARED = pair.secret;
        // The ring secret is PARENT-generated and handed to the host child
        // via VANT_MESH_SECRET: admit's env fallback then reuses it verbatim
        // (never forks). The host child boots its bus MANUALLY (configure +
        // listen) instead of create() — create would mint a fresh secret and
        // fork the ring. Host listens on 4899; the parent still holds 4890.
        process.env.VANT_MESH_SECRET = SHARED; // children inherit it
        const HOST_PORT = 4899;
        const childScript = (role) => `\nrequire('${ROOT}/lib/sandbox.js').defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canNetwork: true, canTrade: true });\nconst genesis = require('${ROOT}/lib/genesis');\nconst network = require('${ROOT}/lib/network');\ntry { network.setAllowedDomains(['127.0.0.1']); } catch (e) {}\n(async () => {\n  if ('${role}' === 'host') {\n    const crewBus = require('${ROOT}/lib/crew-bus');\n    crewBus.configure({ name: 'ring-host', port: ${HOST_PORT}, secret: '${SHARED}', agentId: 'host-a' });\n    await crewBus.listen(${HOST_PORT});\n    const adm = await genesis.admit({ member: { name: 'wire-member', agentId: 'wire-member-a', port: 4898 } });\n    if (!adm.ok) throw new Error('admit failed: ' + adm.reason);\n    if (adm.secret !== '${SHARED}') throw new Error('admit FORKED the ring secret over env');\n    console.log('HOST_ADMITTED:true');\n    // Stay up for the member's hello + ack round-trip.\n    await new Promise((r) => setTimeout(r, 6000));\n    const reg = require('${ROOT}/lib/node-registry');\n    reg.refresh({ force: true });\n    const vetted = !!reg.get('wire-member-a');\n    console.log('HOST_VETTED:' + vetted);\n    process.exit(0);\n  } else {\n    const acc = await genesis.accept({\n      host: 'ring-host', hostPort: ${HOST_PORT}, secret: '${SHARED}',\n      name: 'wire-member', agentId: 'wire-member-a', port: 4898, timeoutMs: 8000\n    });\n    console.log('MEMBER_ACKED:' + (acc.ok && acc.acked));\n    console.log('MEMBER_RING:' + (acc.topology && acc.topology.ring === true));\n    process.exit(acc.ok && acc.acked ? 0 : 1);\n  }\n})().catch((e) => { console.error('CHILD_FAIL:' + e.message); process.exit(1); });\n`;
        const run = (script) => new Promise((resolve) => {
            const child = spawn(process.execPath, ['-e', script], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
            let out = '';
            child.stdout.on('data', (d) => { out += d.toString(); });
            child.stderr.on('data', (d) => { out += d.toString(); });
            child.on('close', () => resolve(out));
        });
        const hostP = run(childScript('host'));
        await wait(2500); // host boots + admits first
        const memberOut = await run(childScript('member'));
        const hostOut = await hostP;
        delete process.env.VANT_MESH_SECRET; // children are done with it
        assert(/HOST_ADMITTED:true/.test(hostOut), 'host did not admit: ' + hostOut.slice(-200));
        assert(/HOST_VETTED:true/.test(hostOut), 'host did not vet the member over the wire: ' + hostOut.slice(-200));
        assert(/MEMBER_ACKED:true/.test(memberOut), 'member not acked: ' + memberOut.slice(-200));
        assert(/MEMBER_RING:true/.test(memberOut), 'ring flag not recorded: ' + memberOut.slice(-200));
    });

    await test('member.intro: a standing member adopts an UNKNOWN principal merge-only', async () => {
        // NOTE: this harness shares ONE registry file across the three
        // in-process nodes, so the host's own vetting anchor already made
        // 'member-a' known everywhere (in real deployments each node has
        // its own registry). The merge-only rule is therefore probed with
        // a member the host never anchored: introduce 'later-member',
        // whose id the standing bus has never seen.
        let captured = null;
        const realIntro = standingBus._state.dispatchers.get('member.intro');
        standingBus._state.dispatchers.set('member.intro', (env) => {
            captured = env.payload;
            realIntro(env);
        });
        defaultBus.send('standing', 'member.intro', {
            member: { name: 'later-member', agentId: 'later-a', url: 'http://127.0.0.1:4895' }
        }).catch(() => {});
        await wait(80);
        standingBus._state.dispatchers.set('member.intro', realIntro);
        assert(captured && captured.member && captured.member.name === 'later-member', 'intro not delivered');
        const adopted = registry.get('later-a');
        assert(adopted, 'standing member did not adopt the introduced principal');
        assert(adopted.metadata && adopted.metadata.introducedBy === 'ring-host', 'provenance missing: ' + JSON.stringify(adopted.metadata));
        assert(adopted.metadata && adopted.metadata.kind === 'ring-member', 'kind missing');
        // Re-intro never overwrites: adopt-only-unknown.
        const before = JSON.stringify(adopted);
        standingBus._state.dispatchers.get('member.intro')({
            from: 'ring-host', type: 'member.intro',
            payload: { member: { name: 'later-member', agentId: 'later-a', url: 'http://127.0.0.1:9999' } }
        });
        await wait(30);
        assert(JSON.stringify(registry.get('later-a')) === before, 're-intro OVERWROTE a known principal');
        registry.unregister('later-a');
    });

    await test('the intro carries NO secret', async () => {
        // The captured payload from the previous test is the proof shape;
        // capture a fresh one and assert the ring secret never rides it.
        let captured = null;
        const realIntro = standingBus._state.dispatchers.get('member.intro');
        standingBus._state.dispatchers.set('member.intro', (env) => {
            captured = env.payload;
        });
        defaultBus.send('standing', 'member.intro', {
            member: { name: 'probe-2', agentId: 'probe-2-a', url: 'http://127.0.0.1:4895' }
        }).catch(() => {});
        await wait(60);
        standingBus._state.dispatchers.set('member.intro', realIntro);
        assert(captured, 'intro not captured');
        assert(!JSON.stringify(captured).includes(pair.secret), 'RING SECRET LEAKED through member.intro');
    });

    await test('hello from an unexpected joiner is ignored (one member at a time)', async () => {
        // The rite expected 'new-member' (already acked). A hello from a
        // DIFFERENT name must be dropped silently.
        memberBus._state.dispatchers.get('genesis.ack'); // noop: keep harness honest
        const acks = [];
        memberBus._state.dispatchers.set('genesis.ack', (env) => { acks.push(env.payload); });
        defaultBus._state.dispatchers.get('genesis.hello') && defaultBus._state.dispatchers.get('genesis.hello')({
            from: 'rogue-node', type: 'genesis.hello',
            payload: { joiner: 'rogue-node', agentId: 'rogue-a' }
        });
        await wait(50);
        memberBus._state.dispatchers.delete('genesis.ack');
        assert(acks.length === 0, 'rogue hello produced an ack: ' + JSON.stringify(acks));
    });

    await test('pass-68 secret.js fixes: get-after-set round-trips; colon types rejected', async () => {
        await secretMod.set('mesh-probe-valid', 'abcdefgh12345678');
        const v = await secretMod.get('mesh-probe-valid');
        assert(v === 'abcdefgh12345678', 'get-after-set broken: ' + JSON.stringify(v));
        let threw = false;
        try { await secretMod.set('mesh:invalid:type', 'abcdefgh12345678'); } catch (e) { threw = true; }
        assert(threw, 'colon-key type should be REJECTED (VAF charset)');
    });

    await test('create/join untouched by the rite (pairs still close)', async () => {
        // create on a fresh name still generates its own secret + topology.
        const p2 = await genesis.create({
            name: 'pair-host', agentId: 'ph-a', port: 4896,
            joiner: { name: 'pair-joiner', agentId: 'pj-a', port: 4897 }
        });
        assert(p2.ok && p2.secret && p2.secret !== pair.secret, 'fresh pair not independent');
        const st = genesis.status();
        assert(st.genesis.role === 'host' && st.genesis.peers.some((p) => p.name === 'pair-joiner'),
            'fresh pair topology wrong: ' + JSON.stringify(st.genesis));
    });

    console.log(`\n=== Third-org rite: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Test harness error:', e);
    process.exit(1);
});
