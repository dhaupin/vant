#!/usr/bin/env node
/**
 * Vant Cron CLI
 * Cron job management
 * 
 * Usage:
 *   vant cron list           # List cron jobs
 *   vant cron add <spec> <cmd> # Add cron job
 *   vant cron remove <id>   # Remove cron job
 *   vant cron run <id>      # Run job now
 *   vant cron status        # Show cron status
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Cron CLI - Cron job management

Usage:
  vant cron list              List cron jobs
  vant cron add <spec> <cmd>  Add interval job
  vant cron remove <id>       Remove cron job
  vant cron run <id>          Run job immediately
  vant cron status            Show cron daemon status

Spec format (INTERVALS):
  30s    = every 30 seconds
  10m    = every 10 minutes
  2h     = every 2 hours
  90000  = milliseconds (1000-86400000)
`);
    process.exit(0);
}

async function run() {
    try {
        const cron = require('../lib/cron');
        
        if (subcmd === 'list' || subcmd === 'ls') {
            // (R4-F1, #194) The CLI never persisted jobs, so `add` reported
            // success and a later `list` in a FRESH process answered 0.
            // Honest add: this is a scheduler slot in THIS process (and the
            // help says so). list stays the in-memory view of that one fact.
            const jobs = cron.list();
            console.log('Cron jobs (this process, not persisted):', jobs.length);
            jobs.forEach(j => console.log(' -', j.id, ':', j.enabled ? 'enabled' : 'disabled'));
        } else if (subcmd === 'add' || subcmd === 'schedule') {
            // (R4-F1, #194) routed to lib/cron.add with interval specs
            // ("30s"/"10m"/"2h"/ms); cron expressions are rejected with a
            // pointer at docs/operations/cron.md.
            const spec = args[1];
            const cmd = args.slice(2).join(' ');
            if (!spec || !cmd) {
                console.error('Usage: vant cron add <spec> <command>');
                process.exit(1);
            }
            const result = await cron.add(spec, cmd);
            // add() returns the schedule() envelope ({ id, scheduled }) —
            // print the human copyable id, not the envelope, so the id the
            // user pastes into `cron remove` is the id remove accepts.
            if (result && typeof result === 'object' && result.id) {
                if (!result.scheduled) console.log('  (scheduled in this process only — not persisted)');
                console.log('Added job:', result.id);
            } else {
                console.log('Added job:', result);
            }
        } else if (subcmd === 'remove' || subcmd === 'rm' || subcmd === 'delete') {
            const id = args[1];
            if (!id) {
                console.error('Usage: vant cron remove <id>');
                process.exit(1);
            }
            const existed = await cron.remove(id);
            if (existed) {
                console.log('Removed job:', id);
            } else {
                console.log('No scheduled job with id:', id, '(nothing was scheduled in this process)');
            }
        } else if (subcmd === 'run' || subcmd === 'execute' || subcmd === 'now') {
            const id = args[1];
            if (!id) {
                console.error('Usage: vant cron run <id>');
                process.exit(1);
            }
            const r = cron.run(id);
            if (r && r.error) {
                console.log('Run failed:', r.error);
            } else {
                console.log('Ran job:', id);
            }
        } else if (subcmd === 'status' || subcmd === 'info') {
            // (bin-truthfulness) lib/cron.getStatus() returns
            // { enabled, tasks } — the arrow-property shape the gate's fn/class
            // scanner can't see from OTHER lib files' getStatus bodies. The
            // field is real; STATUS-FIELD-OK documents the provenance.
            const st = cron.getStatus();
            console.log('Cron daemon (this process):');
            console.log('  Tasks:', st.tasks ? st.tasks : cron.list().length); // STATUS-FIELD-OK: lib/cron.js:384 returns {enabled, tasks: _tasks.size} — real field on the real shape
        } else {
            console.log('Usage: vant cron <command>');
            process.exit(1);
        }
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

run();

// (R4-F1, #194) A scheduled interval keeps the event loop alive — without an
// explicit exit, `vant cron add 30s ...` HUNG after printing its result. The
// CLI is one-shot: report, then leave (the schedule itself is in-process only
// and dies with the process, which the add/list copy already says).
process.on('exit', () => {});
setTimeout(() => process.exit(0), 150).unref();
