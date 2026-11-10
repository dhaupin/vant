#!/usr/bin/env node
/**
 * PROBE: per-agent vote signatures (pass 388).
 *
 * Pre-fix every ballot was HMAC'd with the constant key 'default' (reproducible
 * by anyone) and nothing ever verified it, so the ledger carried no
 * cryptographic proof of authorship. This probe walks the whole leg:
 *   1. the voter signs a ballot with its own Ed25519 key;
 *   2. the owner, holding the voter's ENROLLED public key, verifies it;
 *   3. a tampered ballot (wrong signature) is REJECTED;
 *   4. a ballot from an UN-enrolled principal is adopted but counted unverified.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'state'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'orgchart'), { recursive: true, force: true });

const consensus = require(path.join(ROOT, 'lib', 'consensus'));
const agentKeys = require(path.join(ROOT, 'lib', 'agent-keys'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));

(async () => {
    for (const v of ['owner-agent', 'voter-agent', 'tamper-agent', 'pinned-agent', 'stranger-agent']) {
        registry.register({ id: v, name: v, host: '127.0.0.1', port: 1 });
    }
    // Each voter mints its own key; the owner enrolls each voter's PUBLIC key
    // (the genesis key-exchange step). The owner never sees a private key.
    const voterKp = agentKeys.ensure('voter-agent');
    agentKeys.ensure('owner-agent');
    agentKeys.enroll('voter-agent', voterKp.publicKey);
    agentKeys.enroll('tamper-agent', agentKeys.ensure('tamper-agent').publicKey);
    // pinned-agent: the owner pins a key pinned-agent does NOT hold.
    agentKeys.enroll('pinned-agent', agentKeys.ensure('owner-agent').publicKey);

    await consensus.create('sig-topic', { ballot: ['yes', 'no'], minQuorum: 6, useTrustWeight: false });

    // 1+2: the voter signs; the owner verifies against the enrolled key.
    const ts = Date.now();
    const goodSig = agentKeys.sign('voter-agent', { kind: 'vant-vote', topic: 'sig-topic', agentId: 'voter-agent', outcome: 'yes', ts });
    await consensus.vote('sig-topic', 'yes', 'voter-agent', { signature: goodSig, ts });
    const rec1 = consensus.get('sig-topic').votes['voter-agent'];
    const verifiedOk = rec1 && rec1.verified === true;

    // 3: a tampered ballot (signature over a DIFFERENT outcome) is rejected.
    const badSig = agentKeys.sign('tamper-agent', { kind: 'vant-vote', topic: 'sig-topic', agentId: 'tamper-agent', outcome: 'no', ts });
    const r2 = await consensus.vote('sig-topic', 'yes', 'tamper-agent', { signature: badSig, ts });
    const tamperRejected = r2 && r2.code === 'E_BAD_SIGNATURE';

    // 4: a signature checked against the WRONG pinned key is rejected.
    const pinnedSig = agentKeys.sign('pinned-agent', { kind: 'vant-vote', topic: 'sig-topic', agentId: 'pinned-agent', outcome: 'yes', ts });
    const r3 = await consensus.vote('sig-topic', 'yes', 'pinned-agent', { signature: pinnedSig, ts });
    const wrongKeyRejected = r3 && r3.code === 'E_BAD_SIGNATURE';

    // 5: a ballot from an UN-enrolled principal is adopted but flagged.
    const strangerSig = agentKeys.sign('stranger-agent', { kind: 'vant-vote', topic: 'sig-topic', agentId: 'stranger-agent', outcome: 'yes', ts });
    await consensus.vote('sig-topic', 'yes', 'stranger-agent', { signature: strangerSig, ts });
    const strangerRec = consensus.get('sig-topic').votes['stranger-agent'];
    const unverifiedAdopted = strangerRec && strangerRec.verified === false;
    const t = consensus.tally('sig-topic');

    console.log('\n=== PROBE: per-agent vote signatures ===');
    console.log('  enrolled key verifies its ballot:', verifiedOk);
    console.log('  tampered signature rejected (E_BAD_SIGNATURE):', tamperRejected);
    console.log('  signature vs wrong pinned key rejected:', wrongKeyRejected);
    console.log('  un-enrolled ballot adopted + flagged unverified:', unverifiedAdopted);
    console.log('  tally.unverifiedBallots:', t.unverifiedBallots);
    const bound = verifiedOk && tamperRejected && wrongKeyRejected && unverifiedAdopted && t.unverifiedBallots === 1;
    console.log('\nVERDICT:', bound
        ? 'bound — ballots carry real per-agent signatures; tampering and wrong-key spoofs are refused'
        : 'GAP — signature binding incomplete');
    process.exit(bound ? 0 : 1);
})().catch((e) => { console.error('probe error:', e.message); process.exit(1); });
