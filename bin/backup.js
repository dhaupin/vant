#!/usr/bin/env node
/**
 * Vant Backup - Brain backup and restore
 * 
 * Usage:
 *   vant backup create          # Create backup
 *   vant backup restore <file>  # Restore from backup
 *   vant backup list           # List backups
 *   vant backup schedule       # Start the real in-process backup scheduler
 */

const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const action = args[0];

// Show help
if (args.includes('--help') || args.includes('-h') || !action) {
    console.log(`
Vant Brain Backup

USAGE:
  vant backup create                    # Create backup
  vant backup restore <file>           # Restore from backup
  vant backup list                     # List backups
  vant backup schedule [start|stop|status]  # Drive the backup scheduler

EXAMPLES:
  vant backup create
  vant backup restore brain-backup-2024.tar.gz
  vant backup list
  vant backup schedule start
`);
    process.exit(0);
}

// (pass 24) Install root via VANT_REPO_ROOT anchor (dispatcher sets it for
// routed commands; direct invocation falls back to this install tree).
const ROOT = require('../lib/anchor').getRepoRoot();

// Lazy-load backup module
let backup = null;
function getBackup() {
    if (!backup) {
        try { backup = require('../lib/backup'); } catch(e) {}
    }
    return backup;
}

async function main() {
    const mod = getBackup();
    
    if (!mod) {
        console.error('Backup module not available');
        process.exit(1);
    }
    
    switch (action) {
        case 'create':
            if (mod.create) {
                const result = await mod.create();
                console.log('Backup created:', result);
            } else {
                console.log('Creating backup...');
                // Basic backup functionality
                const brainDir = path.join(ROOT, 'models');
                if (fs.existsSync(brainDir)) {
                    console.log('Brain directory:', brainDir);
                    console.log('Files:', fs.readdirSync(brainDir).length);
                }
            }
            break;
            
        case 'restore':
            const backupFile = args[1];
            if (!backupFile) {
                console.error('Usage: vant backup restore <file>');
                process.exit(1);
            }
            // (pass 24) lib/backup.restore was never exported — this used to
            // print 'Restoring from: X' and exit 0 doing nothing. Fail loudly
            // if the module can't restore; report AFTER success, and let
            // main().catch surface validation/decoding failures.
            if (!mod.restore) {
                console.error('Error: backup module does not support restore');
                process.exit(1);
            }
            await mod.restore(backupFile);
            console.log('Restored from:', backupFile);
            break;
            
        case 'list':
            console.log('Available backups:');
            const backupDir = path.join(ROOT, 'backups');
            if (fs.existsSync(backupDir)) {
                const files = fs.readdirSync(backupDir);
                files.forEach(f => console.log(' -', f));
            } else {
                console.log('No backups found');
            }
            break;
            
        case 'schedule': {
            // (pass 23 census) this was a silent stub — printed 'Scheduling'
            // and did nothing. (pass 189) REAL PLUMBING EXISTS now:
            // lib/backup.js's BackupScheduler registers the daily/weekly
            // backup jobs with lib/cron.js (and the nature entropy trigger),
            // so the CLI drives THAT instead of printing a cron recipe.
            // Note: like every CLI run this is its own process — 'start'
            // schedules jobs into that process; a long-running runtime
            // should call lib/backup.start() at boot, or run the scheduler
            // via cron driving `vant backup create`.
            const sub = (args[1] || 'status').toLowerCase();
            const scheduler = mod.getInstance && mod.getInstance();
            if (sub === 'start') {
                const sched = mod.start();
                console.log('Backup scheduler started in this process.');
                console.log('  Registered jobs:');
                for (const s of sched.config.schedules) {
                    console.log(`    ${s.id}: cron ${s.cron} (keep ${s.retention})`);
                }
                console.log('  Keep-alive: this process stays alive running the schedules.');
                await new Promise(() => {}); // hold the process for the cron jobs
            } else if (sub === 'stop') {
                mod.stop();
                console.log('Backup scheduler stopped.');
            } else if (sub === 'status') {
                const jobs = scheduler && scheduler._jobs ? [...scheduler._jobs.keys()] : [];
                console.log('Backup scheduler:');
                console.log('  type: in-process BackupScheduler (lib/backup.js)');
                console.log('  jobs defined (daily/weekly): ' + (scheduler && scheduler.config ? scheduler.config.schedules.map(s => `${s.id} ${s.cron}`).join(', ') : 'n/a'));
                console.log('  jobs registered in THIS process: ' + (jobs.length ? jobs.join(', ') : 'none (start first)'));
                console.log('  backups dir: ' + path.join(ROOT, 'backups'));
            } else {
                console.error('Usage: vant backup schedule [start|stop|status]');
                process.exit(1);
            }
        }
        break;

        default:
            console.log('Unknown action:', action);
            console.log('Run: vant backup --help');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
