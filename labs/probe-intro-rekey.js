#!/usr/bin/env node
/**
 * probe-intro-rekey.js (pass 389)
 *
 * member.intro enrolled a public key for ANY introduced member, including a
 * principal this node already knows. enroll() is immutable, so a key that is
 * ALREADY set is safe — but a principal that is REGISTERED yet has no key yet
 * (the pass-388 migration window) could be pinned to an attacker's key by any
 * registered peer, re-keying it so the attacker's ballots verify as the victim.
 *
 * Variant A: victim's key already pinned  -> re-key refused by immutability.
 * Variant B: victim registered, no key    -> pre-fix VULNERABLE, post-fix bound.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canNetwork: true });
const scratch = require(path.join(ROOT, 'tests', 'scratch-brain'));

function run(variant) {
    scratch.scratchBrain('probe-rekey-' + variant + '-' + process.pid.toString(36));
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'agent-keys'))];
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'node-registry'))];
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'agora-sync'))];
    const agentKeys = require(path.join(ROOT, 'lib', 'agent-keys'));
    const registry = require(path.join(ROOT, 'lib', 'node-registry'));
    const sync = require(path.join(ROOT, 'lib', 'agora-sync'));

    registry.clearState();
    registry.register({ id: 'victim-agent', name: 'victim-agent', host: '127.0.0.1', port: 1 });
    registry.register({ id: 'peer-c', name: 'peer-c', host: '127.0.0.1', port: 2 });

    const victimKey = agentKeys.ensure('victim-agent').publicKey;
    if (variant === 'A') agentKeys.enroll('victim-agent', victimKey);
    const attackerKey = agentKeys.ensure('peer-c').publicKey;

    const handlers = new Map();
    const bus = {
        onDispatch: (t, fn) => handlers.set(t, fn),
        send: async () => ({ ok: true }),
        nodes: () => [{ name: 'peer-c' }],
        status: () => ({ name: 'receiver', agentId: 'receiver' })
    };
    sync.install(bus);
    handlers.get('member.intro')({ from: 'peer-c', payload: { member: { name: 'victim-agent', agentId: 'victim-agent', publicKey: attackerKey } } });

    const enrolled = agentKeys.enrolledKey('victim-agent');
    const vuln = enrolled === attackerKey;
    console.log('VARIANT_' + variant + ':' + (vuln ? 'VULNERABLE (victim re-keyed to attacker key)' : 'bound (attacker key not pinned)'));
    return vuln;
}

const a = run('A');
const b = run('B');
console.log('VERDICT:' + ((a || b) ? 'VULNERABLE' : 'bound'));
process.exit(a || b ? 1 : 0);
