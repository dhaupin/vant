#!/usr/bin/env node
/**
 * Per-agent vote signatures (pass 388).
 *
 * The root-cause weakness behind the whole agora identity class: vote
 * signatures were DECORATIVE. `_signVote` fell through to a constant HMAC
 * key ('default') and `_verifyVote` was never called, so a ledger carried no
 * cryptographic proof of authorship and any tampering was undetectable.
 *
 * These pins fix the leg with real per-agent Ed25519 keys (lib/agent-keys):
 *   1. an ENROLLED key's ballot verifies and is recorded verified:true
 *   2. a TAMPERED ballot (signature over a different outcome) is REFUSED
 *      (pre-fix: accepted — nothing checked the signature)
 *   3. a signature checked against the WRONG pinned key is REFUSED
 *   4. an UN-enrolled principal's ballot is adopted but flagged unverified,
 *      and the tally surfaces the count (the observable migration window)
 *   5. the remote vote leg carries the voter's own signature: the owner
 *      verifies it rather than re-signing under its own key
 *   6. mergeTopic drops a bad-signature ballot for an enrolled principal
 *   7. the private-key file is mode 0600; enroll is immutable
 *
 * Run: node tests/agent-keys.test.js
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

// ISOLATION: scratch brain. This suite enrolls principals whose names collide
// with the shared mesh's own fixtures (e.g. `peer-agent` in
// tests/agora-sync.test.js). Writing keys into the real brain leaked an
// enrolled key for `peer-agent` into that sibling suite, whose wire ballot was
// then dropped as unverifiable — a real cross-suite contamination. Mint a
// throwaway brain and reap it on exit (pass 378).
const SCRATCH_BRAIN = require(path.join(__dirname, 'scratch-brain'))
    .scratchBrain('agent-keys-' + process.pid.toString(36));
const KEYS_FILE = path.join(ROOT, 'models', 'private', SCRATCH_BRAIN, 'state', 'agent-keys.json');

const consensus = require(path.join(ROOT, 'lib', 'consensus'));
const agentKeys = require(path.join(ROOT, 'lib', 'agent-keys'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));
const sync = require(path.join(ROOT, 'lib', 'agora-sync'));

registry.clearState();
for (const v of ['owner-agent', 'voter-agent', 'tamper-agent', 'pinned-agent', 'stranger-agent', 'peer-agent', 'unsigned-remote', 'enrolled-remote']) {
    registry.register({ id: v, name: v, host: '127.0.0.1', port: 1 });
}

function ballot(agentId, topic, outcome, ts) {
    return { kind: 'vant-vote', topic, agentId, outcome, ts };
}

(async () => {
    console.log('\n🔑 AGENT-KEYS / VOTE SIGNATURE TESTS\n');

    await test('agent-keys: sign/verify round-trip; tamper and wrong key refused', () => {
        const kp = agentKeys.ensure('voter-agent');
        assert(kp && kp.publicKey && kp.privateKey, 'no keypair minted');
        const ts = Date.now();
        const data = ballot('voter-agent', 'k1', 'yes', ts);
        const sig = agentKeys.sign('voter-agent', data);
        assert(typeof sig === 'string' && sig.length > 0, 'no signature');
        assert(agentKeys.verify(kp.publicKey, data, sig) === true, 'good signature failed');
        assert(agentKeys.verify(kp.publicKey, ballot('voter-agent', 'k1', 'no', ts), sig) === false, 'TAMPERED payload verified');
        assert(agentKeys.verify(agentKeys.ensure('peer-agent').publicKey, data, sig) === false, 'wrong key verified');
    });

    await test('agent-keys: private key file is mode 0600; enroll is immutable', () => {
        agentKeys.ensure('voter-agent');
        const file = KEYS_FILE;
        const mode = fs.statSync(file).mode & 0o777;
        assert(mode === 0o600, 'agent-keys.json mode is ' + mode.toString(8) + ', expected 600');
        const first = agentKeys.ensure('voter-agent').publicKey;
        assert(agentKeys.enroll('pinned-agent', first) === true, 'first enroll refused');
        assert(agentKeys.enroll('pinned-agent', agentKeys.ensure('peer-agent').publicKey) === false, 'enroll MUTATED a pinned key');
        assert(agentKeys.enrolledKey('pinned-agent') === first, 'pinned key changed');
    });

    await test('vote: an ENROLLED key signs its ballot and it records verified:true', async () => {
        agentKeys.enroll('voter-agent', agentKeys.ensure('voter-agent').publicKey);
        await consensus.create('k-verified', { ballot: ['yes', 'no'], minQuorum: 5, useTrustWeight: false });
        const ts = Date.now();
        const sig = agentKeys.sign('voter-agent', ballot('voter-agent', 'k-verified', 'yes', ts));
        await consensus.vote('k-verified', 'yes', 'voter-agent', { signature: sig, ts });
        const rec = consensus.get('k-verified').votes['voter-agent'];
        assert(rec && rec.verified === true, 'enrolled ballot not verified: ' + JSON.stringify(rec));
    });

    await test('vote: a TAMPERED signature is REFUSED (pre-fix: accepted, unverified)', async () => {
        agentKeys.enroll('tamper-agent', agentKeys.ensure('tamper-agent').publicKey);
        await consensus.create('k-tamper', { ballot: ['yes', 'no'], minQuorum: 5, useTrustWeight: false });
        const ts = Date.now();
        // Signature commits to outcome 'no', but the ballot claims 'yes'.
        const sig = agentKeys.sign('tamper-agent', ballot('tamper-agent', 'k-tamper', 'no', ts));
        const r = await consensus.vote('k-tamper', 'yes', 'tamper-agent', { signature: sig, ts });
        assert(r && r.code === 'E_BAD_SIGNATURE', 'TAMPERED ballot accepted: ' + JSON.stringify(r));
        assert(!consensus.get('k-tamper').votes['tamper-agent'], 'tampered ballot recorded');
    });

    await test('vote: a signature vs the WRONG pinned key is REFUSED', async () => {
        agentKeys.enroll('pinned-agent', agentKeys.ensure('owner-agent').publicKey); // pin a key pinned-agent lacks
        await consensus.create('k-wrongkey', { ballot: ['yes', 'no'], minQuorum: 5, useTrustWeight: false });
        const ts = Date.now();
        const sig = agentKeys.sign('pinned-agent', ballot('pinned-agent', 'k-wrongkey', 'yes', ts));
        const r = await consensus.vote('k-wrongkey', 'yes', 'pinned-agent', { signature: sig, ts });
        assert(r && r.code === 'E_BAD_SIGNATURE', 'wrong-key ballot accepted: ' + JSON.stringify(r));
    });

    await test('vote: an UN-enrolled ballot is adopted but flagged; tally counts it', async () => {
        await consensus.create('k-migration', { ballot: ['yes', 'no'], minQuorum: 5, useTrustWeight: false });
        const ts = Date.now();
        const sig = agentKeys.sign('stranger-agent', ballot('stranger-agent', 'k-migration', 'yes', ts));
        const r = await consensus.vote('k-migration', 'yes', 'stranger-agent', { signature: sig, ts });
        assert(!r.error, 'un-enrolled ballot refused: ' + JSON.stringify(r));
        const rec = consensus.get('k-migration').votes['stranger-agent'];
        assert(rec && rec.verified === false, 'un-enrolled ballot not flagged unverified');
        assert(consensus.tally('k-migration').unverifiedBallots === 1, 'tally did not surface the unverified count');
    });

    await test('remote vote leg: the voter signs, the OWNER verifies (no re-sign under its own key)', async () => {
        // Owner node holds the topic; the peer votes over the wire.
        const handlers = new Map();
        const sent = [];
        const bus = {
            onDispatch: (t, fn) => handlers.set(t, fn),
            send: async (to, type, payload) => { sent.push({ to, type, payload }); return { ok: true }; },
            nodes: () => [{ name: 'peer-agent' }],
            status: () => ({ name: 'owner-agent', agentId: 'owner-agent' })
        };
        sync.install(bus);
        agentKeys.enroll('peer-agent', agentKeys.ensure('peer-agent').publicKey);
        await consensus.create('k-remote', { ballot: ['yes', 'no'], minQuorum: 5, useTrustWeight: false });

        // The peer's client signs its own ballot; deliver it to the owner.
        const ts = Date.now();
        const sig = agentKeys.sign('peer-agent', ballot('peer-agent', 'k-remote', 'yes', ts));
        handlers.get('vote')({ from: 'peer-agent', payload: { topic: 'k-remote', outcome: 'yes', agentId: 'peer-agent', reqId: 'r1', ts, signature: sig } });
        await new Promise((res) => setTimeout(res, 40));
        const rec = consensus.get('k-remote').votes['peer-agent'];
        assert(rec && rec.verified === true, 'owner did not verify the peer ballot: ' + JSON.stringify(rec));

        // A forged ballot (peer signature over a different outcome) is refused.
        const bad = agentKeys.sign('peer-agent', ballot('peer-agent', 'k-remote', 'no', ts));
        handlers.get('vote')({ from: 'peer-agent', payload: { topic: 'k-remote', outcome: 'yes', agentId: 'peer-agent', reqId: 'r2', ts, signature: bad } });
        await new Promise((res) => setTimeout(res, 40));
        assert(!consensus.get('k-remote').votes['peer-agent'] || consensus.get('k-remote').votes['peer-agent'].outcome === 'yes',
            'forged remote ballot mutated the record');
    });

    await test('mergeTopic: a bad-signature ballot for an enrolled principal is dropped', () => {
        agentKeys.enroll('voter-agent', agentKeys.ensure('voter-agent').publicKey);
        const now = Date.now();
        const goodTs = now;
        const goodSig = agentKeys.sign('voter-agent', ballot('voter-agent', 'k-merge', 'yes', goodTs));
        const r = consensus.mergeTopic({
            topic: 'k-merge',
            votes: {
                'voter-agent': { outcome: 'yes', signature: goodSig, ts: goodTs },      // enrolled, valid
                'tamper-agent': { outcome: 'yes', signature: 'forged', ts: goodTs }     // enrolled, invalid -> drop
            },
            minQuorum: 2, created: now - 1000, deadline: now + 3600000, from: 'wire-peer'
        });
        assert(r.merged === true, 'merge failed: ' + JSON.stringify(r));
        const led = consensus.get('k-merge');
        assert(led.votes['voter-agent'] && led.votes['voter-agent'].verified === true, 'valid enrolled ballot not adopted');
        assert(!led.votes['tamper-agent'], 'BAD-SIGNATURE ballot adopted from the wire');
    });

    await test('agent-keys: reserved principal names are refused (no prototype-key corruption)', () => {
        for (const bad of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
            assert(agentKeys.ensure(bad) === null, 'ensure minted a key for reserved name ' + bad);
            assert(agentKeys.enrolledKey(bad) === null, 'reserved name resolved a key: ' + bad);
        }
    });

    await test('vote: a REMOTE ballot is NEVER signed by the owner (unsigned → fail-closed)', async () => {
        await consensus.create('k-nosig', { ballot: ['yes', 'no'], minQuorum: 5, useTrustWeight: false });
        // (a) un-enrolled + unsigned: adopted for the migration window, but the
        //     owner must NOT mark it verified nor mint a key it does not own.
        //     Pre-fix this fell into the LOCAL branch: the owner signed the
        //     peer's ballot itself and recorded verified:true.
        const r1 = await consensus.vote('k-nosig', 'yes', 'unsigned-remote', { remote: true });
        assert(!r1.error, 'unsigned un-enrolled remote ballot refused outright: ' + JSON.stringify(r1));
        const rec = consensus.get('k-nosig').votes['unsigned-remote'];
        assert(rec && rec.verified === false, 'owner VOUCHED for an unsigned remote ballot: ' + JSON.stringify(rec));
        assert(rec.signature === null, 'owner minted a signature for a remote ballot');
        assert(!agentKeys.enrolledKey('unsigned-remote'), 'owner enrolled a key for a remote principal');
        // (b) enrolled + unsigned: refused outright (pre-fix the owner re-signed it).
        agentKeys.enroll('enrolled-remote', agentKeys.ensure('enrolled-remote').publicKey);
        const r2 = await consensus.vote('k-nosig', 'yes', 'enrolled-remote', { remote: true });
        assert(r2 && r2.code === 'E_BAD_SIGNATURE', 'unsigned ENROLLED remote ballot accepted: ' + JSON.stringify(r2));
    });

    await test('remote vote leg: an UNSIGNED wire ballot is REFUSED (owner never vouches)', async () => {
        const handlers = new Map();
        const sent = [];
        const bus = {
            onDispatch: (t, fn) => handlers.set(t, fn),
            send: async (to, type, payload) => { sent.push({ to, type, payload }); return { ok: true }; },
            nodes: () => [{ name: 'peer-agent' }],
            status: () => ({ name: 'owner-agent', agentId: 'owner-agent' })
        };
        sync.install(bus);
        agentKeys.enroll('peer-agent', agentKeys.ensure('peer-agent').publicKey);
        await consensus.create('k-wire-nosig', { ballot: ['yes', 'no'], minQuorum: 5, useTrustWeight: false });
        handlers.get('vote')({ from: 'peer-agent', payload: { topic: 'k-wire-nosig', outcome: 'yes', agentId: 'peer-agent', reqId: 'n1' } });
        await new Promise((res) => setTimeout(res, 40));
        assert(!consensus.get('k-wire-nosig').votes['peer-agent'], 'owner VOUCHED for an unsigned wire ballot');
        const ack = sent.find((s) => s.type === 'vote.ack');
        assert(ack && ack.payload.result && ack.payload.result.code === 'E_BAD_SIGNATURE',
            'unsigned wire ballot not acked as bad signature: ' + JSON.stringify(ack && ack.payload));
    });

    await test('member.intro: a peer cannot RE-KEY a registered principal (but a new member still enrolls)', () => {
        // victim is registered (no key yet — the migration window).
        registry.register({ id: 'rekey-victim', name: 'rekey-victim', host: '127.0.0.1', port: 1 });
        const handlers = new Map();
        const bus = {
            onDispatch: (t, fn) => handlers.set(t, fn),
            send: async () => ({ ok: true }),
            nodes: () => [{ name: 'peer-agent' }],
            status: () => ({ name: 'receiver', agentId: 'receiver' })
        };
        sync.install(bus);
        const attackerKey = agentKeys.ensure('peer-agent').publicKey;
        handlers.get('member.intro')({ from: 'peer-agent', payload: { member: { name: 'rekey-victim', agentId: 'rekey-victim', publicKey: attackerKey } } });
        assert(agentKeys.enrolledKey('rekey-victim') !== attackerKey,
            'a peer RE-KEYED a registered principal with its own key');
        // A genuinely new member introduced by the peer is still enrolled.
        const newKey = agentKeys.ensure('brand-new-member').publicKey;
        handlers.get('member.intro')({ from: 'peer-agent', payload: { member: { name: 'brand-new-member', agentId: 'brand-new-member', publicKey: newKey } } });
        assert(agentKeys.enrolledKey('brand-new-member') === newKey, 'a new member intro did not enroll its key');
    });

    console.log(`\n  Passed: ${results.passed}\n  Failed: ${results.failed}\n`);
    process.exit(results.failed === 0 ? 0 : 1);
})().catch((e) => { console.error('suite error:', e.message); process.exit(1); });
