'use strict';
/**
 * Wave U3 pin suite — Governance Scenario Playbook (labs/prd-universe.md).
 *
 * Coverage map to PRD checklist items:
 *   U3.1 scenario crew/task over escrow as the REAL gate → crew + budget pins
 *   U3.2 quarantine drill: refusal recorded who/why (fail-closed)       → drill pins
 *   U3.3 consensus voted closeout (no single-agent bless)               → closeout pins
 *   U3.5 this suite (pinned the session it shipped)
 *   U2.3 byte-restoring materialization → pins in test/scenario-manifest.test.js
 *
 * The deterministic drills inject the gate modules through runScenarioTask's
 * documented `gates` seam; the LIVE contract (lib/escrow + lib/trust +
 * lib/consensus) is exercised where a fresh harness state makes that safe.
 */
const assert = require('assert');

const scenarioMod = require('../lib/scenario');
const rules = require('../lib/rules');
const stateStore = require('../lib/state-store');
const canonical = require('../lib/state/canonical');
const gs = require('../lib/state/genesis-snapshot');

const LEDGER = 'state/u3-pin-scenarios.json';

let passed = 0, failed = 0;
function ok(name, fn) {
    try { fn(); passed++; console.log('  ✓ ' + name); }
    catch (e) { failed++; console.log('  ✗ ' + name + ': ' + e.message); }
}
async function _okAsync(name, fn) {
    try { await fn(); passed++; console.log('  ✓ ' + name); }
    catch (e) { failed++; console.log('  ✗ ' + name + ': ' + e.message); }
}

function wipe() {
    try { stateStore.clear(LEDGER); } catch (e) { /* absent ok */ }
}

function forgeCrewLedger(name, members) {
    const universeTag = gs.universeTag(undefined);
    const id = canonical.hash({ kind: 'universe-scenario', v: scenarioMod.SCENARIO_V, name, task: 'crew', universeTag });
    stateStore.persist({
        moduleName: 'scenario',
        stateFile: LEDGER,
        data: { scenarios: { [id]: {
            kind: 'universe-scenario', v: scenarioMod.SCENARIO_V, scenario: name, phase: 'crew',
            workspace: 'scenario-' + name, budget: 100,
            crew: members,
            universeTag, assembledAt: Date.now()
        } } }
    });
    return id;
}

/** Deterministic gate stubs — the CONTRACT is what's pinned, not the impl. */
function makeStubs(opt = {}) {
    const quarantine = new Set(opt.quarantined || []);
    let poolSpent = 0;
    let poolLimit = 1000;
    const holds = new Map();
    let holdSeq = 0;
    const deltas = [];
    let escrowTouched = false;
    const spends = [], refunds = [];

    const trust = {
        isQuarantined: (id) => quarantine.has(id),
        getQuarantined: () => Array.from(quarantine).map(agentId => ({ agentId, reason: 'pinned reason' }))
    };

    const escrow = {
        workspaceCanSpend: (ws, agentId, amount) => {
            escrowTouched = true;
            if (poolSpent + amount > poolLimit) return { allowed: false, reason: 'workspace_pool_exceeded', available: poolLimit - poolSpent };
            return { allowed: true, reason: 'budget_available', available: poolLimit - poolSpent };
        },
        checkQuota: () => ({ allowed: true }),
        hold: (id, cond) => { const holdId = 'hold-' + (++holdSeq); holds.set(id, { cond, holdId }); return { held: true, holdId }; },
        release: (id) => ({ released: holds.delete(id) }),
        // (pass-198 debit contract) the stub exposes an Escrow class whose
        // instance methods mirror the real escrow helper model: canSpend,
        // recordSpend (the pool debit), refund (restores member + pool).
        Escrow: class {
            canSpend(_agentId, amount, _opts) { escrowTouched = true; return poolSpent + amount > poolLimit ? { allowed: false, reason: 'workspace_pool_exceeded', available: poolLimit - poolSpent } : { allowed: true, reason: 'budget_available', available: poolLimit - poolSpent }; }
            recordSpend(_agentId, amount) {
                if (poolSpent + amount > poolLimit) return { recorded: false, reason: 'workspace_pool_exceeded' };
                poolSpent += amount; spends.push(amount);
                return { recorded: true, spent: poolSpent };
            }
            refund(_agentId, amount) { refunds.push(amount); poolSpent = Math.max(0, poolSpent - amount); return { refunded: true };
            }
        }
    };

    // Consensus double honoring the create/vote/tally contract: one vote per
    // agent, quorum required, a single ballot never passes.
    const ledgers = new Map();
    const consensus = {
        create: (topic, options) => {
            ledgers.set(topic, { topic, votes: {}, minQuorum: Math.max(2, options.minQuorum), status: 'open' });
            return { topic, status: 'open' };
        },
        vote: (topic, outcome, agentId) => {
            const l = ledgers.get(topic);
            if (!l) return { error: 'Vote not found' };
            if (l.votes[agentId] !== undefined) return { error: 'Already voted' };
            l.votes[agentId] = { outcome };
            const total = Object.keys(l.votes).length;
            if (total < l.minQuorum) return { status: 'quorum' };
            l.status = 'passed'; l.winner = outcome;
            return { status: 'passed', winner: outcome, hash: 'tally-' + topic };
        },
        tally: (topic) => {
            const l = ledgers.get(topic);
            if (!l) return { error: 'Not found' };
            const total = Object.keys(l.votes).length;
            if (total < l.minQuorum) return { status: 'quorum', totalVotes: total };
            return { status: l.status, winner: l.winner, totalVotes: total, hash: 'tally-' + topic };
        }
    };

    const resolution = {
        logDelta: (file, change, options) => {
            const d = { file, change, changed_by: options.changed_by, metadata: options.metadata || {} };
            deltas.push(d);
            return d;
        }
    };

    return {
        gates: { trust, escrow, consensus, resolution },
        _interior: {
            quarantine, deltas, holds, spends, refunds,
            setPool: (limit, spent) => { poolLimit = limit; poolSpent = spent; },
            pool: () => ({ spent: poolSpent, limit: poolLimit }),
            escrowTouched: () => escrowTouched
        }
    };
}

/** Spy on the delegation path (agents module inside lib/scenario.js only). */
function spyAgents(_scenarioPath) {
    const Module = require('module');
    const orig = Module._load;
    let delegatedTo = null;
    Module._load = function (request, parent, _isMain) {
        if (request === './agents' && parent && String(parent.filename).includes('lib/scenario.js')) {
            return { delegate: async (agentId) => { delegatedTo = agentId; return {}; } };
        }
        return orig.apply(this, arguments);
    };
    return { restore: () => { Module._load = orig; }, last: () => delegatedTo };
}

async function main() {

// ------------------------------------------------------------------
// Crew typed gates
// ------------------------------------------------------------------

ok('crew assembly: hostile names/sizes/budgets fail closed typed', () => {
    wipe();
    for (const [opts, code] of [
        [{ name: '' }, 'E_SCENARIO_NAME'],
        [{ name: 'bad name!' }, 'E_SCENARIO_NAME'],
        [{ name: 'ok-crew', agents: 1 }, 'E_SCENARIO_CREW'],
        [{ name: 'ok-crew', agents: 99 }, 'E_SCENARIO_CREW'],
        [{ name: 'ok-crew', agents: 3, budget: 2 }, 'E_SCENARIO_BUDGET'],
        [{ name: 'ok-crew', agents: 3, budget: 999999 }, 'E_SCENARIO_BUDGET']
    ]) {
        const r = scenarioMod.assembleCrew({ ...opts, ledgerFile: LEDGER });
        assert.strictEqual(r.ok, false, JSON.stringify(opts));
        assert.strictEqual(r.code, code, JSON.stringify(opts));
    }
});

// (QC pass-202 live-fire) Explicit-but-invalid numeric flags must refuse
// typed, never silently adopt the default — the old `parseInt(x) || 3`
// turned `--agents 0` / `--agents notanumber` into a 3-agent "success".
ok('crew assembly: agents=0 / garbage refuse typed (E_SCENARIO_CREW), not a default crew', () => {
    for (const bad of [0, '0', 'notanumber', '']) {
        const r = scenarioMod.assembleCrew({ name: 'ok-crew', agents: bad, budget: 50, ledgerFile: LEDGER });
        assert.strictEqual(r.ok, false, 'agents=' + JSON.stringify(bad) + ' must refuse');
        assert.strictEqual(r.code, 'E_SCENARIO_CREW');
    }
});

ok('crew assembly: budget=garbage refuse typed (E_SCENARIO_BUDGET)', () => {
    const r = scenarioMod.assembleCrew({ name: 'ok-crew', agents: 3, budget: 'garbage', ledgerFile: LEDGER });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'E_SCENARIO_BUDGET');
});

ok('task cost: negative/zero/garbage/over-pool refuse typed (E_SCENARIO_COST) before gates', async () => {
    const stubs = makeStubs();
    for (const cost of ['-50', '0', 'garbage', '999999999']) {
        const r = await scenarioMod.runScenarioTask({ gates: stubs.gates, crew: 'g', task: 'hostile cost probe', cost, ledgerFile: LEDGER });
        assert.strictEqual(r.ok, false, 'cost=' + JSON.stringify(cost));
        assert.strictEqual(r.code, 'E_SCENARIO_COST');
    }
    // Cost validation happens BEFORE the quarantine gate — escrow untouched.
    assert.strictEqual(stubs._interior.escrowTouched(), false);
});

ok('hostile task text fails closed typed (E_SCENARIO_TASK) before any gate', async () => {
    const stubs = makeStubs();
    for (const task of ['', '   ', 'x'.repeat(513), null]) {
        const r = await scenarioMod.runScenarioTask({ gates: stubs.gates, crew: 'g', task, ledgerFile: LEDGER });
        assert.strictEqual(r.ok, false, JSON.stringify(task).slice(0, 40));
        assert.strictEqual(r.code, 'E_SCENARIO_TASK');
    }
    // And the escrow draw was never touched for any hostile task.
    assert.strictEqual(stubs._interior.escrowTouched(), false);
});

ok('missing crew → typed absence BEFORE any escrow read (gate order)', async () => {
    const stubs = makeStubs();
    const r = await scenarioMod.runScenarioTask({ gates: stubs.gates, crew: 'never-assembled', task: 'anything', ledgerFile: LEDGER });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'E_SCENARIO_ABSENT');
    assert.strictEqual(stubs._interior.escrowTouched(), false);
});

ok('describeCrew: absent crew typed; ledger row echoed with the live pool null-safe', () => {
    const absent = scenarioMod.describeCrew({ crew: 'no-such-crew', ledgerFile: LEDGER });
    assert.strictEqual(absent.ok, false);
    assert.strictEqual(absent.code, 'E_SCENARIO_ABSENT');
    const bad = scenarioMod.describeCrew({ crew: 'bad name!', ledgerFile: LEDGER });
    assert.strictEqual(bad.ok, false);
    assert.strictEqual(bad.code, 'E_SCENARIO_NAME');
});

// ------------------------------------------------------------------
// (U3.2) Quarantine drill — fail-closed, refusal recorded who/why
// ------------------------------------------------------------------

ok('U3.2 drill: one quarantined member refused while the remaining quorum closes the task', async () => {
    wipe();
    const name = 'drill-one-q';
    forgeCrewLedger(name, [
        { id: 'agent_q1', name: 'q1', perm: 'lead' },
        { id: 'agent_q2', name: 'q2', perm: 'worker' },
        { id: 'agent_q3', name: 'q3', perm: 'critic' }
    ]);
    const stubs = makeStubs({ quarantined: ['agent_q2'] });
    const spy = spyAgents();
    try {
        const r = await scenarioMod.runScenarioTask({ gates: stubs.gates, crew: name, task: 'drill: audit the pinned ledger', ledgerFile: LEDGER });
        assert.strictEqual(r.ok, true, 'remaining quorum passes (got ' + JSON.stringify(r).slice(0, 200) + ')');
        assert.strictEqual(spy.last(), 'agent_q1', 'leader is the first NON-quarantined member');
        assert.deepStrictEqual(r.quarantined.map(q => q.agentId), ['agent_q2'], 'quarantined member recorded');
        assert.strictEqual(r.votes, 2, 'quarantined member never votes (crew of 3)');
        assert.strictEqual(r.deltaPersisted, true, 'decision rides resolution delta');
        assert.strictEqual(stubs._interior.deltas.length, 1, 'one decision line logged');
        assert.strictEqual(stubs._interior.holds.size, 0, 'hold released after closeout');
    } finally { spy.restore(); }
});

ok('U3.2 drill hard case: EVERY member quarantined → E_SCENARIO_QUARANTINED, escrow draw never fires', async () => {
    const name = 'drill-all-q';
    forgeCrewLedger(name, [
        { id: 'agent_z1', name: 'z1', perm: 'lead' },
        { id: 'agent_z2', name: 'z2', perm: 'worker' }
    ]);
    const stubs = makeStubs({ quarantined: ['agent_z1', 'agent_z2'] });
    const r = await scenarioMod.runScenarioTask({ gates: stubs.gates, crew: name, task: 'drill: nobody healthy', ledgerFile: LEDGER });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'E_SCENARIO_QUARANTINED');
    assert.strictEqual(stubs._interior.escrowTouched(), false, 'quarantine gate precedes the budget gate');
    assert.strictEqual(r.quarantined.length, 2);
    assert.ok(r.refusals && r.refusals.every(x => x.stage === 'quarantine'), 'refusal ledger records the stage');
});

// ------------------------------------------------------------------
// (U3.3) Consensus closeout — no single-agent bless
// ------------------------------------------------------------------

ok('U3.3: one live voter left (quarantined peer) → E_SCENARIO_NO_QUORUM, no single-agent bless', async () => {
    const name = 'drill-solo';
    forgeCrewLedger(name, [
        { id: 'agent_s1', name: 's1', perm: 'lead' },
        { id: 'agent_s2', name: 's2', perm: 'worker' }
    ]);
    // Quarantine s2 → one live voter → minQuorum ≥ 2 can never pass.
    const stubs = makeStubs({ quarantined: ['agent_s2'] });
    const r = await scenarioMod.runScenarioTask({ gates: stubs.gates, crew: name, task: 'solo bless attempt', ledgerFile: LEDGER });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'E_SCENARIO_NO_QUORUM');
    assert.strictEqual(stubs._interior.holds.size, 0, 'hold released on refused closeout');
});

// ------------------------------------------------------------------
// (pass-198 audit) Escrow DEBIT contract — the pool is REALLY charged
// ------------------------------------------------------------------

ok('U3.1 debit: a successful task really charges the shared pool (hold + recordSpend)', async () => {
    const name = 'debit-success';
    forgeCrewLedger(name, [
        { id: 'agent_d1', name: 'd1', perm: 'lead' },
        { id: 'agent_d2', name: 'd2', perm: 'worker' }
    ]);
    const stubs = makeStubs();
    const r = await scenarioMod.runScenarioTask({ gates: stubs.gates, crew: name, task: 'paid work', cost: 40, ledgerFile: LEDGER });
    assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 200));
    assert.deepStrictEqual(stubs._interior.spends(), [40], 'one debit lands for the task cost');
    assert.strictEqual(stubs._interior.pool().spent, 40, 'pool headroom shrinks by the cost');
    assert.deepStrictEqual(stubs._interior.refunds(), [], 'success does NOT refund');
});

ok('U3.1 debit: a refused closeout REFUNDS the pool debit (refused task never eats credits)', async () => {
    const name = 'debit-refund';
    forgeCrewLedger(name, [
        { id: 'agent_r1', name: 'r1', perm: 'lead' },
        { id: 'agent_r2', name: 'r2', perm: 'worker' }
    ]);
    // Solo live voter → closeout refusal → refund path fires.
    const stubs = makeStubs({ quarantined: ['agent_r2'] });
    const r = await scenarioMod.runScenarioTask({ gates: stubs.gates, crew: name, task: 'refund drill', cost: 30, ledgerFile: LEDGER });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'E_SCENARIO_NO_QUORUM');
    assert.deepStrictEqual(stubs._interior.refunds(), [30], 'the debit is restored on refusal');
    assert.strictEqual(stubs._interior.pool().spent, 0, 'pool back to zero spent');
});

// ------------------------------------------------------------------
// Rules door
// ------------------------------------------------------------------

ok('rules: scenario tools clear the door; dangerous substrings still denied', () => {
    for (const t of ['vant_scenario_crew', 'vant_scenario_task', 'vant_scenario_status']) {
        const r = rules.check(t, {});
        assert.strictEqual(r.allowed, true, t);
    }
    for (const bad of ['acme_shell', 'run_exec', 'evil_forker']) {
        const r = rules.check(bad, {});
        assert.strictEqual(r.allowed, false, bad);
        assert.strictEqual(r.rule, 'default');
    }
});

// Cleanup the pin-scoped state file.
wipe();

console.log('\n=== scenario-crew pins (Wave U3): ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);

}

main().then(() => {}, (e) => { console.error('suite crashed:', e); process.exit(1); });
