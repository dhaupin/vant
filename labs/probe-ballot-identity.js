#!/usr/bin/env node
/**
 * PROBE: remote-ballot identity binding (agora-sync 'vote' dispatcher).
 * A registered peer node casts a ballot claiming ANOTHER agent's identity.
 * Does the owner bind payload.agentId to the sending node?
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
const sync = require(path.join(ROOT, 'lib', 'agora-sync'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));
const teams = require(path.join(ROOT, 'lib', 'teams'));

registry.clearState();
for (const v of ['owner-agent', 'vetted-remote', 'victim-agent']) {
    registry.register({ id: v, name: v, host: '127.0.0.1', port: 1 });
}
const org = teams.createOrg('probe-acme');
const dept = teams.createDept('probe-infra', { org: org.id });
const team = teams.createTeam('probe-team', { dept: dept.id });
for (const a of ['owner-agent', 'vetted-remote', 'victim-agent']) teams.assign(a, { org: org.id, dept: dept.id, team: team.id });
const SCOPE = { owner: 'team:' + team.id, visibility: 'scope' };

// Owner bus with TWO registered peers: peer-b and peer-c (distinct nodes).
const handlers = new Map();
const sent = [];
const bus = {
    onDispatch: (t, fn) => handlers.set(t, fn),
    send: async (to, type, payload) => { sent.push({ to, type, payload }); return { ok: true, handlers: 1 }; },
    nodes: () => [{ name: 'peer-b', url: 'http://127.0.0.1:1' }, { name: 'peer-c', url: 'http://127.0.0.1:2' }],
    status: () => ({ name: 'owner-a', agentId: 'owner-agent' })
};
sync.install(bus);

(async () => {
    await consensus.create('probe-topic', { ballot: ['yes', 'no'], minQuorum: 3, useTrustWeight: false, scope: SCOPE });
    // victim-agent is a legitimate member who has NOT voted.
    // peer-c (a DIFFERENT node than the one that owns victim-agent) forges a ballot.
    handlers.get('vote')({ from: 'peer-c', payload: { topic: 'probe-topic', outcome: 'yes', agentId: 'victim-agent', reqId: 'x' } });
    await new Promise((r) => setTimeout(r, 40));
    const t = consensus.tally('probe-topic');
    const ack = sent.find((s) => s.type === 'vote.ack');
    console.log('\n=== PROBE: cross-node identity spoof ===');
    console.log('  victim-agent actually voted? ', consensus.hasVoted('probe-topic', 'victim-agent'));
    console.log('  owner tally totalVotes:      ', t.totalVotes);
    console.log('  owner acked the ballot:      ', ack ? JSON.stringify(ack.payload.result) : 'none');
    console.log('\nVERDICT:',
        consensus.hasVoted('probe-topic', 'victim-agent')
            ? 'VULNERABLE — peer-c cast a ballot AS victim-agent (no node<->agent binding)'
            : 'bound — spoof refused');
    process.exit(0);
})().catch((e) => { console.error('probe error:', e.message); process.exit(1); });
