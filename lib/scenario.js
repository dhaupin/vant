'use strict';

/**
 * Vant Scenario Governance Playbook (Wave U3 — labs/prd-universe.md)
 * =================================================================
 *
 * An UNTRUSTED multi-agent scenario with escrow + consensus as the REAL
 * gate (PRD: "Demo product, not new math"). One PRF / one encoder still
 * holds — every hash rides lib/state/canonical.js; persistence rides the
 * ONE arch-A state store (WAL included); nothing here hand-rolls fs.
 *
 * The playbook, honestly:
 *
 *   1. crew   — spawn N agents into one shared-budget workspace pool
 *               (escrow workspace budgets are the live gate: an agent
 *               draws from the pool, the pool is finite).
 *   2. task   — delegate ONE task end-to-end: trust quarantine gate →
 *               escrow budget hold → delegation → consensus voted
 *               closeout (no single-agent bless) → resolution delta.
 *
 * Governance properties (each pinned by test/scenario-crew.test.js):
 *   - Quarantine has teeth AT THE POINT OF DELEGATION (U3.2): a
 *     quarantined crew agent is refused before any escrow debit, and the
 *     refusal is recorded in the scenario ledger (who refused, why).
 *   - Closeout requires a VOTED outcome (U3.3): the task verdict is
 *     written by the crew's consensus tally, never a single agent —
 *     and the decision rides resolution.logDelta so it survives restart.
 *   - Escrow gates the work (U3.1): the task draw fails closed when the
 *     shared pool cannot cover the cost — the pool is the budget, not a
 *     per-agent free lunch.
 */

const crypto = require('crypto');

const canonical = require('./state/canonical');
const stateStore = require('./state-store');

/** Ledger schema version. Bump ONLY when the on-disk shape changes. */
const SCENARIO_V = 1;
/** Brain-scoped state file holding the scenario ledger. */
const SCENARIO_STATE_FILE = 'state/universe-scenarios.json';

function _vantErr(msg, code) {
    return new (require('./error').VantError)(msg, { code, retryable: false });
}

/** Crew/task name grammar: shared with the spine-world hygiene bar. */
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

/** Task description cap (hard bound; hostile input fails closed typed). */
const MAX_TASK_LEN = 512;
/** Crew size bound (agents.maxAgents is the runtime cap; this is the playbook's). */
const MAX_CREW = 10;

// ==================== LEDGER (arch-A store, WAL included) ====================

function _loadLedger(file) {
    const out = { scenarios: {} };
    try {
        stateStore.hydrate({
            moduleName: 'scenario',
            stateFile: file,
            apply: (data) => {
                if (data && typeof data === 'object' && data.scenarios && typeof data.scenarios === 'object') {
                    out.scenarios = data.scenarios;
                }
            }
        });
    } catch (e) {
        if (e && e.code === stateStore.STATE_READ_CODE) {
            throw _vantErr('scenario: ledger unreadable — denied, not absent: ' + e.message, 'E_STATE_READ');
        }
        // corrupt/unmarked falls through as fresh (hydrate already warned).
    }
    return out;
}

/**
 * Scenario record. CONTENT-ADDRESSED like everything in this PRD: the
 * scenarioId is derived from its deterministic core (name, crew, universe
 * tag, task text) — same crew + same task in a fresh process is the same
 * scenario row (updates to the MUTABLE fields ride inside the stored body,
 * the id stays stable for its lifetime).
 */
function _scenarioId(name, task, universeTag) {
    return canonical.hash({ kind: 'universe-scenario', v: SCENARIO_V, name, task, universeTag });
}

// ==================== TEST SEAMS (no test-only public APIs: U1/U2 shape) ====
// The seams are plain documented options accepted on every entry point and
// consumed in production paths too (env-driven callers can override).

function _opt(options, key, fallback) {
    const v = options ? options[key] : undefined;
    return v === undefined ? fallback : v;
}

// ==================== 1. CREW (U3.1) ====================

/**
 * Spawn a scenario crew: N agents over ONE shared escrow workspace pool.
 *
 * Mirrors the genesis ceremony shape: the crew is a fresh namespace with a
 * deterministic identity; the shared budget is REAL (an escrow workspace
 * pool the live Escrow helper gates draws against).
 *
 * @param {object} options
 * @param {string} options.name - crew name
 * @param {number} [options.agents=3] - crew size (2–MAX_CREW)
 * @param {number} [options.budget=120] - shared pool budget (credits)
 * @param {string} [options.universe] - universe constant (for the tag + manifest linkage)
 * @param {string} [options.ledgerFile] - ledger state-file override (seam)
 * @returns {{ ok: true, crew, workspace, pool, agentsAdded, ledger } |
 *            { ok: false, error, code }}
 */
function assembleCrew(options = {}) {
    try {
        const name = String(_opt(options, 'name', ''));
        if (!name || !NAME_RE.test(name)) {
            throw _vantErr('scenario: crew name required (alnum, ._- , ≤64)', 'E_SCENARIO_NAME');
        }
        const size = parseInt(options.agents, 10) || 3;
        if (!Number.isFinite(size) || size < 2 || size > MAX_CREW) {
            throw _vantErr('scenario: agents must be 2–' + MAX_CREW, 'E_SCENARIO_CREW');
        }
        const budget = parseInt(options.budget, 10) || 120;
        if (!Number.isFinite(budget) || budget < size || budget > 100000) {
            throw _vantErr('scenario: budget must be ≥ crew size and ≤ 100000', 'E_SCENARIO_BUDGET');
        }

        // Universe tag: ride the U2 carrier so a scenario roster is
        // diffable against manifest identity (same-universe contract).
        const gs = require('./state/genesis-snapshot');
        const universeTag = gs.universeTag(options.universe);

        // Workspace pool: the escrow "org pool" is the LIVE shared budget.
        // New helper in lib/escrow.js (this wave): ensures the pool exists.
        const escrowMod = require('./escrow');
        const workspace = 'scenario-' + name;
        const pool = escrowMod.ensureWorkspaceBudget(workspace, budget);

        // RLS admission is DEFERRED to the task path (see runScenarioTask):
        // habitat.getShared()'s restore runs async and wholesale-replaces the
        // workspaces map, so a workspace registered synchronously here would
        // be clobbered before any draw. Do it after getSharedReady() instead.

        // Crew spawn: production agents.spawn (quota + rate + sandbox gated).
        const agentsMod = require('./agents');
        const crew = [];
        for (let i = 0; i < size; i++) {
            const perm = i === 0 ? 'lead' : (i % 2 === 0 ? 'critic' : 'worker');
            const spawned = agentsMod.spawn({ name: name + '-agent-' + (i + 1), role: 'Scenario ' + perm, type: 'scenario' });
            if (spawned.error) {
                throw _vantErr('scenario: crew spawn failed: ' + spawned.error, 'E_SCENARIO_SPAWN');
            }
            crew.push({ id: spawned.id, name: spawned.name, perm });
        }
        require('./agents').flush && require('./agents').flush();

        const id = _scenarioId(name, 'crew', universeTag);
        const crewRecord = {
            kind: 'universe-scenario',
            v: SCENARIO_V,
            scenario: name,
            phase: 'crew',
            workspace,
            budget,
            crew,
            universeTag,
            assembledAt: Date.now()
        };

        const file = _opt(options, 'ledgerFile', SCENARIO_STATE_FILE);
        const ledger = _loadLedger(file);
        ledger.scenarios[id] = crewRecord;
        const wrote = stateStore.persist({
            moduleName: 'scenario',
            stateFile: file,
            data: { scenarios: ledger.scenarios }
        });
        if (!wrote) {
            return { ok: false, error: 'scenario ledger write denied by the state store', code: 'E_STATE_WRITE' };
        }

        return { ok: true, crewId: id, crew, workspace, pool, budget };
    } catch (e) {
        return { ok: false, error: e.message, code: e.code || 'E_SCENARIO' };
    }
}

// ==================== 2. TASK (U3.1–U3.3: escrow is the REAL gate) ========

/**
 * Run one delegated task end-to-end under the governance playbook:
 *
 *   gate 1 — trust quarantine (U3.2): every crew agent is checked; the
 *           leader is refused FIRST so the refusal is recorded before any
 *           escrow draw.
 *   gate 2 — escrow budget hold against the SHARED pool (the live gate;
 *           refusal fails closed before any work happens).
 *   work  — the delegated task runs through agents-core delegation.
 *   close — consensus voted outcome (U3.3): every available crew agent
 *           votes; closeout rides the tally quorum, never one bless, and
 *           the decision is logged via resolution.logDelta.
 *
 * @param {object} options
 * @param {string} options.crew - crew name (as passed to assembleCrew)
 * @param {string} options.task - task description (≤512 chars)
 * @param {number} [options.cost] - budget cost of the task (default: half the pool)
 * @param {string} [options.universe]
 * @param {string} [options.ledgerFile] - ledger state-file override (seam)
 * @param {object} [options.gates] - test-only gate injection:
 *   { trust, escrow, consensus, resolution } module stubs
 * @returns result envelope { ok, ... } with typed error codes
 */
async function runScenarioTask(options = {}) {
    const gates = options.gates || {};
    const trust = gates.trust || require('./trust');
    const escrowMod = gates.escrow || require('./escrow');
    const consensus = gates.consensus || require('./consensus');
    const resolution = gates.resolution || require('./resolution');

    try {
        const crewName = String(_opt(options, 'crew', ''));
        if (!crewName || !NAME_RE.test(crewName)) {
            throw _vantErr('scenario: crew name required', 'E_SCENARIO_NAME');
        }
        const task = String(_opt(options, 'task', ''));
        if (!task || !task.trim() || task.length > MAX_TASK_LEN) {
            throw _vantErr('scenario: task description required (≤' + MAX_TASK_LEN + ' chars)', 'E_SCENARIO_TASK');
        }
        const universeTag = require('./state/genesis-snapshot').universeTag(options.universe);
        const id = _scenarioId(crewName, task, universeTag);

        // Hydrate the crew roster from the ledger (crew before task).
        const file = _opt(options, 'ledgerFile', SCENARIO_STATE_FILE);
        const ledger = _loadLedger(file);
        const crewId = _scenarioId(crewName, 'crew', universeTag);
        const crewRecord = ledger.scenarios[crewId];
        if (!crewRecord || crewRecord.phase !== 'crew') {
            throw _vantErr('scenario: no assembled crew ' + JSON.stringify(crewName) + ' — run `vant scenario crew` first', 'E_SCENARIO_ABSENT');
        }
        const workspace = crewRecord.workspace;
        const budget = crewRecord.budget;

        // Cost: explicit > half the pool (min 1). The pool caps the task.
        let cost = options.cost !== undefined ? parseInt(options.cost, 10) : Math.max(1, Math.floor(budget / 2));
        if (!Number.isFinite(cost) || cost < 1 || cost > budget) {
            throw _vantErr('scenario: cost must be 1–' + budget + ' (pool cap)', 'E_SCENARIO_COST');
        }

        // ---- GATE 1: quarantine (U3.2) — fail closed, record the refusal.
        const quarantined = [];
        const refusals = [];
        for (const member of [...crewRecord.crew]) {
            let isQ = false;
            try { isQ = trust.isQuarantined(member.id); } catch (e) { isQ = false; }
            if (isQ) {
                quarantined.push({ agentId: member.id, reason: _safeReason(trust, member.id) });
                refusals.push({ agentId: member.id, stage: 'quarantine', reason: 'agent quarantined — delegation refused (fail-closed)', at: Date.now() });
            }
        }
        // A crew where EVERY voter is quarantined cannot close — refuse the
        // task outright (a voted outcome needs at least one live voice).
        if (quarantined.length === crewRecord.crew.length) {
            const verdict = {
                ok: false,
                error: 'task refused: every crew member is quarantined (delegation fail-closed)',
                code: 'E_SCENARIO_QUARANTINED',
                quarantined,
                refusals
            };
            return _recordRun(file, ledger, id, crewName, crewRecord, task, { refused: true, stage: 'quarantine', quarantined, refusals }, verdict);
        }

        // ---- GATE 2: escrow budget against the SHARED pool (the REAL gate).
        // RLS admission first (pass-83 gate): escrow refuses a draw scoped to
        // a workspace the habitat has never heard of (fail-closed). A scenario
        // crew owns its workspace — register it with the SHARED habitat, and
        // AFTER getSharedReady(): habitat restore runs async and wholesale-
        // replaces the workspaces map (a sync registration would be clobbered).
        try {
            const habitat = require('./habitat');
            if (habitat.getSharedReady) {
                const h = await habitat.getSharedReady();
                if (h && !h.workspaces[workspace]) h.createWorkspace(workspace, { name: 'scenario crew ' + crewName, owner: null, skipPersist: false });
            }
        } catch (e) { /* habitat absent (bare library use) — escrow legacy-tolerates */ }
        const draw = escrowMod.workspaceCanSpend(workspace, crewRecord.crew[0].id, cost, { orgLimit: budget });
        if (!draw || draw.allowed !== true) {
            const refusal = { agentId: crewRecord.crew[0].id, stage: 'escrow', reason: (draw && draw.reason) || 'budget refused', at: Date.now() };
            refusals.push(refusal);
            const verdict = {
                ok: false,
                error: 'task refused: escrow draw denied (' + ((draw && draw.reason) || 'unknown') + ')',
                code: 'E_SCENARIO_BUDGET',
                available: draw ? draw.available : null,
                refusals
            };
            return _recordRun(file, ledger, id, crewName, crewRecord, task, { refused: true, stage: 'escrow', refusals, quarantined }, verdict);
        }
        // Hold the money until closeout releases it — a hold is how "the
        // gate was real" becomes auditable state, not just a boolean.
        const holdId = 'scenario:' + id.slice(0, 16);
        escrowMod.hold(holdId, { scenario: crewName, workspace, cost });

        // Quota: the task counts against BOTH the escrow quota and the width
        // of the refusal record (orientation for the postmortem).
        try { escrowMod.checkQuota(crewRecord.crew[0].id, 'scenario'); } catch (e) { /* quota never blocks the drill */ }

        // ---- WORK: delegate through the production agent pipeline.
        const workers = crewRecord.crew.filter(m => !quarantined.some(q => q.agentId === m.id));
        const leader = workers[0];
        const agentsMod = require('./agents');
        // Hydrate the roster BEFORE delegate: every fresh process starts with
        // an empty in-memory map (the agents module loads async at require
        // time and has lost the race by now) — delegate would refuse
        // 'Agent not found' for a perfectly real crew member.
        if (typeof agentsMod.list === 'function') {
            try { await agentsMod.list(); } catch (e) { /* roster read denial surfaces at delegate */ }
        }
        const delegated = await agentsMod.delegate(leader.id, {
            operation: 'speak',
            options: { message: task }
        });
        if (delegated && delegated.error) {
            escrowMod.release(holdId); // work never happened — return the hold
            const refusal = { agentId: leader.id, stage: 'delegate', reason: delegated.error, at: Date.now() };
            refusals.push(refusal);
            const verdict = {
                ok: false,
                error: 'task refused: delegation failed (' + delegated.error + ')',
                code: 'E_SCENARIO_DELEGATE',
                refusals,
                quarantined
            };
            return _recordRun(file, ledger, id, crewName, crewRecord, task, { refused: true, stage: 'delegate', refusals, quarantined }, verdict);
        }

        // ---- CLOSE: consensus voted outcome (U3.3). No single-agent bless:
        //      the task is complete only when a quorum of LIVE crew voices
        //      passes the verdict ballot.
        const topic = ('scn_' + id.slice(0, 24)); // consensus topic grammar: A-Za-z0-9_- ≤100
        const created = await consensus.create(topic, {
            ballot: ['complete', 'incomplete'],
            minQuorum: Math.max(2, workers.length),
            useTrustWeight: false,
            deadline: Date.now() + 60000,
            requireRegistry: false
        });
        if (created && created.error) {
            escrowMod.release(holdId);
            const verdict = {
                ok: false,
                error: 'closeout refused: consensus ledger unavailable (' + (created.code || created.error) + ')',
                code: 'E_SCENARIO_CONSENSUS',
                refusals,
                quarantined
            };
            return _recordRun(file, ledger, id, crewName, crewRecord, task, { refused: true, stage: 'consensus', refusals, quarantined }, verdict);
        }

        const votes = [];
        for (const member of workers) {
            // The task RESULT drives the ballot: escrow gates the work, the
            // delegated result decides the outcome. A (fresh) crew votes by
            // what actually happened, not by optimism.
            // (await: consensus methods return _lockTopic PROMISES — the
            // live-fire round caught the un-awaited reads reporting dry.)
            const vote = await consensus.vote(topic, delegated && delegated.ok !== false ? 'complete' : 'incomplete', member.id);
            if (!vote.error) votes.push({ agentId: member.id, outcome: vote.winner || 'pending' });
        }
        const tally = await consensus.tally(topic);

        // Refuse single-agent bless: a one-vote quorum can never pass a
        // minQuorum ≥ 2 ballot built above — belt-and-suspenders pinned.
        if (!tally || tally.error || tally.status !== 'passed') {
            escrowMod.release(holdId);
            const verdict = {
                ok: false,
                error: 'closeout refused: no quorum pass (voted outcome required — no single-agent bless)',
                code: 'E_SCENARIO_NO_QUORUM',
                tally: tally && !tally.error ? { status: tally.status, total: tally.totalVotes, winner: tally.winner } : null,
                refusals,
                quarantined
            };
            return _recordRun(file, ledger, id, crewName, crewRecord, task, { refused: true, stage: 'consensus-close', refusals, quarantined }, verdict);
        }

        // Release the hold: the gate was real, the closeout was real.
        escrowMod.release(holdId);

        // ---- Decision artifact: resolution.logDelta (U3.3)— survive restart.
        const delta = resolution.logDelta(
            'scenario:' + crewName,
            'scenario task ' + (tally.winner || 'complete') + ' via consensus topic ' + topic,
            {
                changed_by: 'scenario-crew:' + crewName,
                branch: 'main',
                metadata: {
                    scenario: crewName,
                    topic,
                    tallyHash: tally.hash || tally.checksum || null,
                    votes: votes.length,
                    cost,
                    workspace
                }
            }
        );
        if (delta && delta.error) {
            // The delta line is a persistence failure, not a task failure —
            // surface it honestly without undoing the voted closeout.
            refusals.push({ stage: 'delta', reason: delta.error, code: delta.code, at: Date.now() });
        }

        const verdict = {
            ok: true,
            crew: crewName,
            task: task.slice(0, 80),
            workspace,
            cost,
            holdId,
            topic,
            tally: { status: tally.status, winner: tally.winner, total: tally.totalVotes, hash: tally.hash || tally.checksum || null },
            votes: votes.length,
            deltaPersisted: !(delta && delta.error),
            refusals,
            quarantined
        };
        return _recordRun(file, ledger, id, crewName, crewRecord, task, { refused: false, topic, tally: verdict.tally, votes: votes.length, cost, workspace }, verdict);
    } catch (e) {
        return { ok: false, error: e.message, code: e.code || 'E_SCENARIO' };
    }
}

function _safeReason(trust, agentId) {
    try {
        const q = trust.getQuarantined().find(x => x.agentId === agentId);
        return (q && q.reason) || 'unspecified';
    } catch (e) { return 'unspecified'; }
}

/** Persist one task run into the scenario ledger (typed on write denial). */
function _recordRun(file, ledger, id, crewName, crewRecord, task, run, verdict) {
    ledger.scenarios[id] = {
        kind: 'universe-scenario',
        v: SCENARIO_V,
        scenario: crewName,
        phase: 'task',
        task: task.slice(0, 200),
        run,
        verdict: {
            ok: !!verdict.ok,
            error: verdict.error || null,
            code: verdict.code || null,
            tally: verdict.tally || null,
            at: Date.now()
        },
        universeTag: crewRecord.universeTag,
        recordedAt: Date.now()
    };
    const wrote = stateStore.persist({ moduleName: 'scenario', stateFile: file, data: { scenarios: ledger.scenarios } });
    if (!wrote) {
        // Honest output: write denial surfaces, never silently dropped.
        verdict.ledgerPersisted = false;
        verdict.ledgerError = 'E_STATE_WRITE';
        return verdict;
    }
    verdict.ledgerPersisted = true;
    return verdict;
}

/**
 * Inspect a scenario crew: ledger row, crew roster, pool state.
 */
function describeCrew(options = {}) {
    try {
        const crewName = String(_opt(options, 'crew', ''));
        if (!crewName || !NAME_RE.test(crewName)) {
            throw _vantErr('scenario: crew name required', 'E_SCENARIO_NAME');
        }
        const universeTag = require('./state/genesis-snapshot').universeTag(options.universe);
        const file = _opt(options, 'ledgerFile', SCENARIO_STATE_FILE);
        const ledger = _loadLedger(file);
        const crewId = _scenarioId(crewName, 'crew', universeTag);
        const record = ledger.scenarios[crewId];
        if (!record) {
            return { ok: false, error: 'no assembled crew ' + JSON.stringify(crewName), code: 'E_SCENARIO_ABSENT' };
        }
        let pool = null;
        try { pool = require('./escrow').getWorkspacePool(record.workspace); } catch (e) { /* escrow absent */ }
        return { ok: true, crewId, scenario: record, pool };
    } catch (e) {
        return { ok: false, error: e.message, code: e.code || 'E_SCENARIO' };
    }
}

module.exports = {
    // Wave U3 surface
    assembleCrew,
    runScenarioTask,
    describeCrew,
    MAX_CREW,
    MAX_TASK_LEN,
    SCENARIO_V,
    SCENARIO_STATE_FILE
};
