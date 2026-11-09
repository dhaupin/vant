#!/usr/bin/env node
/**
 * PROBE: does state.request leak a SCOPED ledger to a non-member?
 * The reply nests the ledger (scope at payload.ledger.scope), so the
 * crew-bus envelope gate (top-level payload.scope) never sees it. A
 * registered peer outside the scope asks for the topic and, if the handler
 * answers with the ledger, the scope is bypassed.
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
registry.register({ id: 'm-agent', name: 'm-node', host: '127.0.0.1', port: 1 });
registry.register({ id: 'out-agent', name: 'out-node', host: '127.0.0.1', port: 1 });
const org = teams.createOrg('probe4');
const dept = teams.createDept('probe4-infra', { org: org.id });
const team = teams.createTeam('probe4-team', { dept: dept.id });
teams.assign('owner-agent', { org: org.id, dept: dept.id, team: team.id });
teams.assign('m-agent', { org: org.id, dept: dept.id, team: team.id });

const handlers = new Map();
const sent = [];
const bus = {
    onDispatch: (t, fn) => handlers.set(t, fn),
    send: async (to, type, payload) => { sent.push({ to, type, payload }); return { ok: true }; },
    nodes: () => [{ name: 'm-node' }, { name: 'out-node' }],
    status: () => ({ name: 'owner-a', agentId: 'owner-agent' })
};
sync.install(bus);

(async () => {
    await consensus.create('probe4-secret-topic', {
        ballot: ['yes', 'no'], minQuorum: 5, useTrustWeight: false,
        scope: { owner: 'team:' + team.id, visibility: 'scope' }
    });
    await consensus.vote('probe4-secret-topic', 'yes', 'owner-agent');

    // A non-member registered peer asks for the scoped topic.
    handlers.get('state.request')({ from: 'out-node', payload: { topic: 'probe4-secret-topic', reqId: 'leak' } });
    await new Promise((r) => setTimeout(r, 40));
    const reply = sent.find((s) => s.type === 'state');
    const leaked = !!(reply && reply.payload && reply.payload.ledger);

    console.log('\n=== PROBE: state.request scoped-ledger leak ===');
    console.log('  asker (non-member): out-node');
    console.log('  reply ledger present:', leaked);
    console.log('  leaked votes:', leaked ? JSON.stringify(Object.keys(reply.payload.ledger.votes)) : '(none)');
    console.log('\nVERDICT:', leaked
        ? 'VULNERABLE — a non-member got the full SCOPED ledger (scope bypass)'
        : 'bound — scoped ledger withheld from a non-member');
    process.exit(0);
})().catch((e) => { console.error('probe error:', e.message); process.exit(1); });
