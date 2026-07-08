#!/usr/bin/env node
/**
 * Vant Prune CLI
 * Clean up old/stale brain files
 * 
 * All args should have both long (--arg) and short (-a) forms.
 * 
 * Usage:
 *   vant prune -h|--help
 *   vant prune -d|--dry-run [-f|--force]
 *   vant prune -D|--daemon
 *   vant prune -s|--stats
 *   vant prune -l|--list
 */

// -h/--help
const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
    console.log('Usage: vant prune [-h|--help] [-d|--dry-run] [-f|--force] [-D|--daemon] [-s|--stats] [-l|--list]');
    console.log('');
    console.log('  -h, --help     Show this help');
    console.log('  -d, --dry-run  Preview without changes');
    console.log('  -f, --force   Force prune without confirmation');
    console.log('  -D, --daemon  Run as background daemon');
    console.log('  -s, --stats   Show prune statistics');
    console.log('  -l, --list    List prunable files');
    process.exit(0);
}

const fs = require('fs');
const path = require('path');
const prune = require('../lib/prune');

const command = args[0];

/**
 * Run prune operation
 */
async function runPrune(args) {
    const dryRun = args.includes('--dry-run') || args.includes('-d');
    const force = args.includes('--force') || args.includes('-f');
    const verbose = args.includes('--verbose') || args.includes('-v');
    
    // Get options
    const staleDaysOption = args.find(a => a.startsWith('--stale-days=') || a.startsWith('-D='));
    const staleDays = staleDaysOption ? parseInt(staleDaysOption.slice(12)) : null;
    
    const options = {
        dryRun: dryRun || !force,
        staleDays,
        removeFluff: true,
        // CLI user - in production this would come from auth
        userCtx: { role: 'admin', id: 'cli-user' }
    };
    
    if (dryRun) {
        console.log('[Prune] DRY RUN - No changes will be made');
    }
    
    try {
        const stats = await prune.prune(options);
        
        console.log('\n[Prune] Results:');
        console.log(`  Files scanned: ${stats.filesScanned}`);
        console.log(`  Stale removed: ${stats.staleRemoved}`);
        console.log(`  Fluff removed: ${stats.fluffRemoved}`);
        console.log(`  Kept: ${stats.kept}`);
        console.log(`  LTC entries: ${stats.ltcEntries}`);
        
        if (stats.errors.length > 0) {
            console.log('\n[Prune] Errors:');
            stats.errors.forEach(e => console.log(`  - ${e}`));
        }
    } catch (e) {
        console.error(`[Prune] Error: ${e.message}`);
        process.exit(1);
    }
}

/**
 * Show prune statistics
 */
function showStats() {
    const stats = prune.getStats();
    
    if (!stats.operations || stats.operations.length === 0) {
        console.log('[Prune] No prune operations recorded');
        return;
    }
    
    const recent = stats.operations.slice(-10);
    console.log('[Prune] Recent operations:');
    
    recent.forEach(op => {
        console.log(`\n${op.date}`);
        if (op.dryRun) console.log('  DRY RUN');
        console.log(`  Scanned: ${op.stats.filesScanned}`);
        console.log(`  Removed: ${op.stats.staleRemoved + op.stats.fluffRemoved}`);
        console.log(`  Kept: ${op.stats.kept}`);
    });
}

/**
 * List prunable files
 */
function listPrunable(args) {
    const staleDaysOption = args.find(a => a.startsWith('--stale-days='));
    const staleDays = staleDaysOption ? parseInt(staleDaysOption.slice(12)) : null;
    const noFluff = args.includes('--no-fluff');
    
    const options = { staleDays, removeFluff: !noFluff };
    const files = prune.listPrunable(options);
    
    if (files.length === 0) {
        console.log('[Prune] No prunable files found');
        return;
    }
    
    console.log(`[Prune] Prunable files (${files.length}):`);
    files.forEach(f => console.log(`  - ${f}`));
}

/**
 * Run daemon mode
 */
async function runDaemon(args) {
    const intervalOption = args.find(a => a.startsWith('--interval='));
    const interval = intervalOption ? parseInt(intervalOption.slice(11)) : 24 * 60 * 60 * 1000; // 24h default
    
    const verbose = args.includes('--verbose');
    
    console.log(`[Prune] Daemon started, interval: ${interval / (1000 * 60 * 60)} hours`);
    
    async function tick() {
        try {
            const stats = await prune.prune({ staleDays: 90, removeFluff: true });
            
            if (verbose || stats.staleRemoved > 0 || stats.fluffRemoved > 0) {
                console.log(`[Prune] ${new Date().toISOString()}`);
                console.log(`  Removed: ${stats.staleRemoved + stats.fluffRemoved}`);
                console.log(`  LTC entries: ${stats.ltcEntries}`);
            }
        } catch (e) {
            console.error(`[Prune] Error: ${e.message}`);
        }
    }
    
    // Run immediately then on interval
    await tick();
    setInterval(tick, interval);
}

/**
 * Show help
 */
function help() {
    console.log(`
Vant Prune CLI v0.8.6

Usage: node bin/prune.js <command> [options]

Commands:
  (none)          Run prune once
  --dry-run      Preview without making changes
  --daemon       Run as background daemon
  --stats        Show prune statistics
  --list         List prunable files

Options:
  --stale-days=<n>   Age threshold (default: 90)
  --interval=<ms>     Daemon interval in ms (default: 24h)
  --verbose          Verbose output
  --force           Force non-dry-run (requires --daemon)

Examples:
  # Preview what would be pruned
  node bin/prune.js --dry-run

  # List prunable files
  node bin/prune.js --list

  # Run actual prune
  node bin/prune.js --force

  # Check stats
  node bin/prune.js --stats

  # Run daemon (every 6 hours)
  node bin/prune.js --daemon --interval=21600000
`);
}

// Main
async function main() {
    switch (command) {
        case '--dry-run':
            await runPrune(args.slice(1));
            break;
        case '--force':
            await runPrune(args.slice(1));
            break;
        case '--stats':
            showStats();
            break;
        case '--list':
            listPrunable(args.slice(1));
            break;
        case '--daemon':
            await runDaemon(args.slice(1));
            break;
        case 'help':
        case '--help':
        case '-h':
        default:
            if (!command || command.startsWith('--')) {
                await runPrune(args);
            } else {
                help();
            }
    }
}

main().catch(e => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
});