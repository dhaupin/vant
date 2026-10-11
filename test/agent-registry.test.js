#!/usr/bin/env node
/**
 * Agent-Registry pins (pass 193, registry-decision "wire wider")
 *
 * Pins:
 *   1. register() persists through the state spine (state file + tree root).
 *   2. Registration writes a positive cooperation record into trust's
 *      persisted ledger (the address book feeds the trust ledger).
 *   3. registerBrainAgent() delegates to the REAL persistent registry
 *      (the old _brainRegistries dead store is gone).
 *   4. gatherState/restoreState carry the real book and round-trip.
 *   5. Quarantine gate holds (denies a quarantined agent).
 *   6. Known-agent seeds still present after restore (baseline never lost).
 *
 * Run: node test/agent-registry.test.js
 */

const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ FAIL: ' + name + (extra ? ' — ' + String(extra).slice(0, 140) : '')); }
};

const reg = require('../lib/registry');
const trust = require('../lib/trust');

(async () => {
    reg.clearState();
    trust.clearState();

    // ── 1+2: register persists + feeds trust ─────────────────────────────
    const r = await reg.register({ name: 'PinAgent', type: 'Tester' });
    ok('register works', r.registered === true, JSON.stringify(r));

    const brain = require('../lib/brain');
    const brainName = brain.getCurrentBrain ? brain.getCurrentBrain() : 'vant';
    const stateFile = path.resolve('models/private', brainName, 'state/agent-registry.json');
    ok('state file written through the state spine', fs.existsSync(stateFile), stateFile);
    if (fs.existsSync(stateFile)) {
        const snap = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        ok('snapshot has kind + agents rows', typeof snap.kind === 'string' && Array.isArray(snap.agents) && snap.agents.some(a => a.name === 'PinAgent'), JSON.stringify(snap).slice(0, 120));
    }
    ok('tree root exists after register', typeof reg._treeRoot() === 'string' && reg._treeRoot().length > 0, String(reg._treeRoot()));

    ok('trust carries the registration record',
        JSON.stringify(trust.getHistory('PinAgent')).includes('registered in agent registry'));

    // ── 3: registerBrainAgent delegates to the real registry ────────────
    const ok2 = await reg.registerBrainAgent({ name: 'PinAgent2', type: 'Tester' });
    ok('registerBrainAgent registers for real (persistent singleton',
        ok2 === true && !!reg.get('PinAgent2'));

    // ── 4: gather/restore round trip ─────────────────────────────────────
    const g = reg.gatherState();
    ok('gatherState carries agent rows', Array.isArray(g.agents) && g.agents.length > 0 && g.count > 0, JSON.stringify(g).slice(0, 120));
    reg.clearState();
    const rs = reg.restoreState(g);
    ok('restore returns rows', rs.restored === true && rs.count === g.count, JSON.stringify(rs));
    ok('gather/restore round-trips the book', !!reg.get('PinAgent'), 'PinAgent missing after restore');

    // ── 5: quarantine gate ────────────────────────────────────────────────
    await trust.quarantine('PinQ', 'pin-probe');
    const q = await reg.register({ name: 'PinQ', type: 'X' });
    ok('quarantined agent denied', q.registered === false && q.reason === 'quarantined', JSON.stringify(q));

    // ── 6: known seeds survive restore/clear ─────────────────────────────
    ok('known-agent seed present', !!reg.get('Athena'));

    console.log(`\n=== agent-registry pins: ${pass} passed, ${fail} failed ===`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('agent-registry pins crashed:', e.message); process.exit(1); });
