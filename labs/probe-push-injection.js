#!/usr/bin/env node
/**
 * PROBE: can a registered peer inject a ballot for an agent it does NOT own
 * via the state.push / ledger-merge leg (bypassing the vote-leg identity bind)?
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
registry.register({ id: 'owner-agent', name: 'owner-a', host: '127.0.0.1', port: 1 });
registry.register({ id: 'victim-agent', name: 'peer-b', host: '127.0.0.1', port: 1 });
registry.register({ id: 'attacker-agent', name: 'peer-c', host: '127.0.0.1', port: 1 });
const org = teams.createOrg('probe2');
const dept = teams.createDept('probe2-infra', { org: org.id });
const team = teams.createTeam('probe2-team', { dept: dept.id });
for (const a of ['owner-agent', 'victim-agent', 'attacker-agent']) teams.assign(a, { org: org.id, dept: dept.id, team: team.id });
const SCOPE = { owner: 'team:' + team.id, visibility: 'scope' };

const handlers = new Map();
const bus = {
    onDispatch: (t, fn) => handlers.set(t, fn),
    send: async () => ({ ok: true, handlers: 1 }),
    nodes: () => [{ name: 'peer-b', url: 'http://127.0.0.1:1' }, { name: 'peer-c', url: 'http://127.0.0.1:2' }],
    status: () => ({ name: 'owner-a', agentId: 'owner-agent' })
};
sync.install(bus);

(async () => {
    await consensus.create('probe2-topic', { ballot: ['yes', 'no'], minQuorum: 3, useTrustWeight: false, scope: SCOPE });
    // peer-c pushes a ledger stuffing a ballot for victim-agent (owned by peer-b).
    const forged = {
        topic: 'probe2-topic', ballot: ['yes', 'no'], minQuorum: 3, scope: SCOPE,
        votes: { 'victim-agent': { outcome: 'yes', signature: 'forged', ts: Date.now() } }
    };
    handlers.get('state.push')({ from: 'peer-c', payload: { ledger: forged, from: 'peer-c' } });
    await new Promise((r) => setTimeout(r, 30));
    const t = consensus.tally('probe2-topic');
    console.log('\n=== PROBE 2: state.push ballot injection ===');
    console.log('  victim-agent has voted (per owner)? ', consensus.hasVoted('probe2-topic', 'victim-agent'));
    console.log('  owner tally totalVotes:               ', t.totalVotes);
    console.log('\nVERDICT:', consensus.hasVoted('probe2-topic', 'victim-agent')
        ? 'VULNERABLE — peer-c injected a ballot for victim-agent via state.push'
        : 'bound — push adoption refused the foreign ballot');
    process.exit(0);
})().catch((e) => { console.error('probe error:', e.message); process.exit(1); });
