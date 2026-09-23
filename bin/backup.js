#!/usr/bin/env node
/**
 * Vant Backup - Brain backup and restore
 * 
 * Usage:
 *   vant backup create          # Create backup
 *   vant backup restore <file>  # Restore from backup
 *   vant backup list           # List backups
 *   vant backup schedule       # NOT IMPLEMENTED (prints a cron recipe)
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
  vant backup schedule [interval]      # Schedule backups

EXAMPLES:
  vant backup create
  vant backup restore brain-backup-2024.tar.gz
  vant backup list
  vant backup schedule daily
`);
    process.exit(0);
}

const ROOT = path.resolve(__dirname, '..');

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
            console.log('Restoring from:', backupFile);
            if (mod.restore) {
                await mod.restore(backupFile);
            }
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
            // and did nothing. There is no scheduler plumbing for full brain
            // backups yet; say so instead of pretending.
            const interval = args[1] || 'daily';
            console.log(`Backup scheduling (${interval}) is not implemented yet.`);
            console.log('Until then, drive it from cron:');
            console.log(`  0 3 * * * cd ${ROOT} && node bin/vant.js backup create >> vant-backup.log 2>&1`);
            process.exit(1);
        }
            
        default:
            console.log('Unknown action:', action);
            console.log('Run: vant backup --help');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
