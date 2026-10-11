#!/usr/bin/env node
/**
 * Vant Scenario CLI (Wave U3 — labs/prd-universe.md Governance Playbook)
 *
 * Escrow + consensus are the REAL gates: a crew draws from one shared
 * escrow workspace pool, a quarantined agent is refused delegation
 * (fail-closed), and a task only CLOSES on a voted consensus outcome —
 * never a single-agent bless. One PRF / one encoder holds; the ledger
 * rides the arch-A state store (WAL included).
 *
 * Usage:
 *   vant scenario crew <name> [--agents N] [--budget N] [--json]
 *                                             Spawn the crew over a shared pool
 *   vant scenario task <crew> <desc> [--cost N] [--json]
 *                                             Delegate one gated task end-to-end
 *   vant scenario status <crew> [--json]      Crew roster + live pool state
 *
 * Exit codes: 0 ok; 1 typed lib error (code on stderr); 2 usage error.
 */
const vaf = require('../lib/vaf');
const scenario = require('../lib/scenario');
const sandbox = require('../lib/sandbox');

// Crew assembly spawns agents: grant the operator caps the way `vant org
// demo` does (deny-by-default caps would otherwise refuse E_SCENARIO_SPAWN).
// This grants THIS process only — session-scoped, never persisted.
sandbox.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');

function flagValue(flag) {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
}

const positionals = [];
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agents' || args[i] === '--budget' || args[i] === '--cost') { i++; continue; }
    if (args[i] === '--json') continue;
    positionals.push(args[i]);
}

if (args.includes('-h') || args.includes('--help') || positionals.length === 0) {
    console.log(`Vant Scenario — governance playbook (U3, prd-universe.md)

Usage:
  vant scenario crew <name> [--agents N] [--budget N] [--json]
        Spawn an untrusted scenario crew over ONE shared escrow budget pool
  vant scenario task <crew> <description> [--cost N] [--json]
        Delegate ONE task end-to-end: quarantine gate → escrow hold →
        delegation → consensus voted closeout (resolution delta logged)
  vant scenario status <crew> [--json]
        Roster + pool headroom for the assembled crew

The gates are real:
  • quarantined agent → refused BEFORE any escrow draw (ledger records who/why)
  • empty shared pool → task refused fail-closed (E_SCENARIO_BUDGET)
  • task closeout → QUORUM vote (complete/incomplete); no single-agent bless

Exit codes: 0 ok · 1 typed lib error (code on stderr) · 2 usage error
`);
    process.exit(0);
}

const cmd = positionals[0];
vaf.check(cmd, { type: 'string', name: 'cmd', maxLength: 12 });

function _fail(r) {
    console.error('Scenario refused: ' + (r.error || 'unknown'));
    console.error('  code: ' + (r.code || 'E_SCENARIO'));
    process.exit(1);
}

(async () => {
    try {
        if (cmd === 'crew') {
            const name = positionals[1];
            if (!name) { console.error('Usage: vant scenario crew <name> [--agents N] [--budget N]'); process.exit(2); }
            vaf.check(name, { type: 'string', name: 'crew name', maxLength: 64 });
            const r = scenario.assembleCrew({
                name,
                agents: flagValue('--agents'),
                budget: flagValue('--budget')
            });
            if (!r.ok) return _fail(r);
            // (pass 88/#109 pattern) The crew's spawn persistence is async;
            // drain the save chain before exit or the roster never lands and
            // the NEXT process's `scenario task` refuses 'Agent not found'.
            await require('../lib/agents').flush();
            if (jsonOut) console.log(JSON.stringify(r, null, 2));
            else {
                console.log(`\nScenario crew: ${name} (${r.crew.length} agents, pool ${r.budget} credits)`);
                console.log(`  workspace: ${r.workspace}`);
                for (const m of r.crew) console.log(`  • ${m.name}  [${m.perm}]  (${m.id})`);
                console.log('  pool: ' + (r.pool ? (r.pool.available + '/' + r.pool.limit + ' available') : 'unreported'));
                console.log('\nRun a gated task: vant scenario task ' + name + ' "<description>"');
            }
            process.exit(0);
        }

        if (cmd === 'task') {
            const crew = positionals[1];
            const desc = positionals.slice(2).join(' ');
            if (!crew || !desc) { console.error('Usage: vant scenario task <crew> "<description>" [--cost N]'); process.exit(2); }
            vaf.check(crew, { type: 'string', name: 'crew', maxLength: 64 });
            vaf.check(desc, { type: 'string', name: 'task', maxLength: 512 });
            const r = await scenario.runScenarioTask({ crew, task: desc, cost: flagValue('--cost') });
            if (jsonOut) console.log(JSON.stringify(r, null, 2));
            else if (!r.ok) {
                console.log(`\n✗ ${crew}: task refused`);
                if (r.quarantined && r.quarantined.length) {
                    console.log('  quarantine drill:');
                    for (const q of r.quarantined) console.log('    • ' + q.agentId + ' — ' + q.reason);
                }
                if (r.refusals && r.refusals.length) {
                    console.log('  refusals recorded:');
                    for (const x of r.refusals) console.log('    • [' + x.stage + '] ' + (x.reason || x.code || 'refused'));
                }
                if (r.error) console.log('  ' + r.error);
                process.exit(1);
            } else {
                console.log(`\n✓ ${crew}: task complete (voted ${r.tally.winner}, ${r.votes} ballots)`);
                console.log(`  workspace:  ${r.workspace} (draw ${r.cost} credits, held then released)`);
                console.log(`  consensus:  ${r.topic} → ${r.tally.status}` + (r.tally.hash ? ' (tally hash ' + String(r.tally.hash).slice(0, 12) + '…)' : ''));
                console.log(`  decision:   ${r.deltaPersisted ? 'logged via resolution delta' : '⚠ delta not persisted (refusal recorded)'}`);
                process.exit(0);
            }
        }

        if (cmd === 'status') {
            const crew = positionals[1];
            if (!crew) { console.error('Usage: vant scenario status <crew>'); process.exit(2); }
            vaf.check(crew, { type: 'string', name: 'crew', maxLength: 64 });
            const r = scenario.describeCrew({ crew });
            if (!r.ok) return _fail(r);
            if (jsonOut) console.log(JSON.stringify(r, null, 2));
            else {
                const rec = r.scenario;
                console.log(`\nScenario crew: ${rec.scenario} (phase: ${rec.phase})`);
                console.log(`  workspace: ${rec.workspace}`);
                for (const m of rec.crew) console.log(`  • ${m.name}  [${m.perm}]  (${m.id})`);
                if (r.pool) console.log('  pool: ' + r.pool.available + '/' + r.pool.limit + ' available');
            }
            process.exit(0);
        }

        console.error('Unknown subcommand: ' + cmd + ' (try: vant scenario --help)');
        process.exit(2);
    } catch (e) {
        console.error('Scenario error: ' + e.message);
        process.exit(1);
    }
})();
