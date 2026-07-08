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
  vant cron add <spec> <cmd>  Add cron job (e.g., "0 * * * *" "npm test")
  vant cron remove <id>      Remove cron job
  vant cron run <id>         Run job immediately
  vant cron status           Show cron daemon status

Spec format: minute hour day month weekday
  */5 * * * *   = every 5 minutes
  0 * * * *     = every hour
  0 0 * * *     = daily at midnight
`);
    process.exit(0);
}

async function run() {
    try {
        const cron = require('../lib/cron');
        
        if (subcmd === 'list' || subcmd === 'ls') {
            const jobs = await cron.list();
            console.log('Cron jobs:', jobs.length);
            jobs.forEach(j => console.log(' -', j.id, ':', j.spec));
        } else if (subcmd === 'add' || subcmd === 'schedule') {
            const spec = args[1];
            const cmd = args.slice(2).join(' ');
            if (!spec || !cmd) {
                console.error('Usage: vant cron add <spec> <command>');
                process.exit(1);
            }
            const id = await cron.add(spec, cmd);
            console.log('Added job:', id);
        } else if (subcmd === 'remove' || subcmd === 'rm' || subcmd === 'delete') {
            const id = args[1];
            if (!id) {
                console.error('Usage: vant cron remove <id>');
                process.exit(1);
            }
            await cron.remove(id);
            console.log('Removed job:', id);
        } else if (subcmd === 'run' || subcmd === 'execute' || subcmd === 'now') {
            const id = args[1];
            if (!id) {
                console.error('Usage: vant cron run <id>');
                process.exit(1);
            }
            console.log('Running job:', id);
        } else if (subcmd === 'status' || subcmd === 'info') {
            console.log('Cron daemon:');
            console.log('  Status: (use cron.list() for jobs)');
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
