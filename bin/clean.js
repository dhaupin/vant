#!/usr/bin/env node
/**
 * Vant Clean CLI
 * Unified cleanup for logs, tmp, cache, and prune
 * 
 * Usage:
 *   vant clean                   # Clean everything
 *   vant clean --dry-run        # Preview without changes
 *   vant clean logs             # Clean logs only
 *   vant clean tmp              # Clean tmp only
 *   vant clean cache            # Clean cache only
 *   vant clean prune            # Run prune only
 *   vant clean all              # Clean everything
 *   vant clean --auto           # Auto-clean based on config
 */

const args = process.argv.slice(2);
const fs = require('fs');
const path = require('path');

const config = require('../lib/config');

// Handle cron setup commands early
if (args.includes('--setup-cron') || args.includes('--install')) {
    const cron = require('../lib/cron');
    const jobs = [
        { spec: '0 3 * * *', cmd: 'vant clean prune', name: 'daily-prune' },
        { spec: '0 * * * *', cmd: 'vant clean cache', name: 'hourly-cache-clean' },
        { spec: '0 2 * * *', cmd: 'vant clean logs', name: 'daily-log-clean' },
        { spec: '0 0 * * *', cmd: 'vant clean tmp', name: 'daily-tmp-clean' }
    ];
    console.log('Setting up auto-clean cron jobs...\n');
    for (const job of jobs) {
        try {
            const existing = cron.list().find(j => j.id === job.name);
            if (existing) console.log(`  [SKIP] ${job.name} (exists)`);
            else { 
                // Parse cron spec to get interval in ms
                const parts = job.spec.split(' ');
                const intervalMs = parseCronToMs(job.spec);
                cron.schedule({ 
                    id: job.name, 
                    handler: () => console.log(`[CLEAN] Running: ${job.cmd}`),
                    interval: intervalMs,
                    enabled: true
                }); 
                console.log(`  [ADD] ${job.name}: ${job.spec} (${intervalMs/1000}s)`); 
            }
        } catch (e) { console.log(`  [ERROR] ${job.name}: ${e.message}`); }
    }
    console.log('\n✓ Done. Run "vant cron list" to verify.');
    process.exit(0);
}

// Simple cron spec to ms converter (supports basic specs)
function parseCronToMs(spec) {
    const parts = spec.trim().split(/\s+/);
    if (parts.length < 5) return 60000; // Default 1 min
    
    const [min, hour, day, month, dow] = parts;
    
    // Simple cases
    if (min === '*' && hour === '*') return 60000; // Every minute
    if (min === '0' && hour === '*') return 3600000; // Every hour
    if (min === '0' && hour === '2') return 86400000; // Daily at 2am
    if (min === '0' && hour === '3') return 86400000; // Daily at 3am
    
    // Weekly (Sunday) - use 6 days as max is 1 day
    if (min === '0' && hour === '0' && dow === '0') return 518400000; // Every 6 days
    
    return 3600000; // Default to hourly
}

if (args.includes('--remove-cron') || args.includes('--uninstall')) {
    const cron = require('../lib/cron');
    const names = ['daily-prune', 'hourly-cache-clean', 'daily-log-clean', 'weekly-tmp-clean'];
    console.log('Removing auto-clean cron jobs...\n');
    for (const name of names) { try { cron.cancel(name); console.log(`  [REMOVE] ${name}`); } catch (e) { console.log(`  [SKIP] ${name}`); } }
    console.log('\n✓ Done.');
    process.exit(0);
}

if (args.includes('--list-cron') || args.includes('--list')) {
    const cron = require('../lib/cron');
    const jobs = cron.list().filter(j => j.name?.includes('prune') || j.name?.includes('cache') || j.name?.includes('log') || j.name?.includes('tmp') || j.cmd?.includes('vant clean'));
    console.log('Auto-Clean Cron Jobs:\n');
    if (jobs.length === 0) console.log('  None configured. Run "vant clean --setup-cron".\n');
    else jobs.forEach(j => console.log(`  ${j.name}: ${j.spec} → ${j.cmd}\n`));
    process.exit(0);
}

// Parse flags
const flags = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    force: args.includes('--force') || args.includes('-f'),
    auto: args.includes('--auto') || args.includes('-a'),
    verbose: args.includes('--verbose') || args.includes('-v')
};

// Get targets
const targets = args.filter(a => !a.startsWith('-'));

if (args.includes('-h') || args.includes('--help')) {
    console.log(`
Vant Clean CLI - Unified cleanup

Usage:
  vant clean                       Clean everything (logs, tmp, cache)
  vant clean --dry-run            Preview without making changes
  vant clean --force              Skip confirmation
  vant clean --auto               Auto-clean based on config settings
  vant clean logs                 Clean log files only
  vant clean tmp                  Clean temp files only
  vant clean cache                Clean cache only
  vant clean prune                Run prune only
  vant clean all                  Clean everything

Config (env):
  VANT_CLEAN_LOGS=true           Enable log cleaning (default: true)
  VANT_CLEAN_TMP=true            Enable tmp cleaning (default: true)
  VANT_CLEAN_CACHE=true          Enable cache cleaning (default: true)
  VANT_CLEAN_MAX_LOG_MB=10      Max log file size MB
  VANT_CLEAN_MAX_LOG_AGE_DAYS=7 Max log age in days
`);
    process.exit(0);
}

function log(msg) {
    if (flags.verbose || !flags.dryRun) {
        console.log(msg);
    }
}

function dry(msg) {
    if (flags.dryRun) {
        console.log('[DRY-RUN] ' + msg);
    } else {
        log(msg);
    }
}

// Get files in directory
function getFiles(dir, ext) {
    try {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter(f => f.endsWith(ext))
            .map(f => path.join(dir, f));
    } catch (e) {
        return [];
    }
}

// Clean log files
async function cleanLogs() {
    const maxSize = config.get('clean.maxLogSize', 10) * 1024 * 1024;
    const maxAge = config.get('clean.maxLogAge', 7); // days
    
    if (!config.get('clean.logs', true)) {
        log('Log cleaning disabled in config');
        return { cleaned: 0, skipped: 0 };
    }
    
    let cleaned = 0;
    let skipped = 0;
    const now = Date.now();
    const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;
    
    // Clean vant.log
    const logFile = 'vant.log';
    if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        
        // Check size
        if (stats.size > maxSize) {
            dry(`Log file ${logFile} exceeds ${maxSize / 1024 / 1024}MB (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
            if (!flags.dryRun) {
                // Rotate: rename to vant.log.old
                const oldLog = 'vant.log.old';
                if (fs.existsSync(oldLog)) fs.unlinkSync(oldLog);
                fs.renameSync(logFile, oldLog);
                // Create new empty log
                fs.writeFileSync(logFile, '');
                cleaned++;
            }
        }
        
        // Check age
        const age = now - stats.mtimeMs;
        if (age > maxAgeMs) {
            dry(`Log file ${logFile} older than ${maxAge} days`);
            if (!flags.dryRun) {
                fs.unlinkSync(logFile);
                cleaned++;
            }
        }
        skipped++;
    }
    
    // Clean vant.log.old
    if (fs.existsSync('vant.log.old')) {
        dry('Removing vant.log.old');
        if (!flags.dryRun) {
            fs.unlinkSync('vant.log.old');
            cleaned++;
        }
    }
    
    return { cleaned, skipped };
}

// Clean tmp files
async function cleanTmp() {
    if (!config.get('clean.tmp', true)) {
        log('Tmp cleaning disabled in config');
        return { cleaned: 0, skipped: 0 };
    }
    
    let cleaned = 0;
    let skipped = 0;
    
    const tmpDirs = ['.agent_tmp', 'tmp', '/tmp'];
    
    for (const dir of tmpDirs) {
        if (!fs.existsSync(dir)) continue;
        
        try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const filePath = path.join(dir, file);
                try {
                    const stats = fs.statSync(filePath);
                    if (stats.isFile()) {
                        dry(`Would remove tmp: ${filePath}`);
                        if (!flags.dryRun) {
                            fs.unlinkSync(filePath);
                            cleaned++;
                        }
                    } else if (stats.isDirectory()) {
                        // Skip directories for safety
                        skipped++;
                    }
                } catch (e) {
                    // Skip inaccessible files
                    skipped++;
                }
            }
        } catch (e) {
            // Skip inaccessible directories
            skipped++;
        }
    }
    
    return { cleaned, skipped };
}

// Clean cache
async function cleanCache() {
    if (!config.get('clean.cache', true)) {
        log('Cache cleaning disabled in config');
        return { cleaned: 0, skipped: 0 };
    }
    
    let cleaned = 0;
    
    // Clean cache files in models/
    const cacheFiles = [
        '.cache.json',
        'cache.json',
        '.search-index.json',
        '.vector-index.json'
    ];
    
    for (const cacheFile of cacheFiles) {
        const cachePath = path.join('models', cacheFile);
        if (fs.existsSync(cachePath)) {
            dry(`Removing cache: ${cachePath}`);
            if (!flags.dryRun) {
                fs.unlinkSync(cachePath);
                cleaned++;
            }
        }
    }
    
    return { cleaned, skipped: 0 };
}

// Run prune
async function runPrune() {
    dry('Running prune...');
    
    try {
        const prune = require('../lib/prune');
        const brain = require('../lib/brain');
        
        const result = await prune.prune({ 
            dryRun: flags.dryRun,
            userCtx: { userId: 'cli-clean', permissions: ['write'] }
        });
        
        return { cleaned: result.stats?.pruned || 0, skipped: result.stats?.kept || 0 };
    } catch (e) {
        log('Prune error: ' + e.message);
        return { cleaned: 0, skipped: 0 };
    }
}

// Main
async function run() {
    const target = targets[0] || 'all';
    
    console.log('╔══════════════════════════════════════════╗');
    console.log('║         Vant Clean                      ║');
    console.log('╚══════════════════════════════════════════╝');
    
    if (flags.dryRun) {
        console.log('[DRY-RUN MODE - No changes will be made]\n');
    }
    
    let totalCleaned = 0;
    let totalSkipped = 0;
    
    if (target === 'all' || target === 'logs') {
        console.log('\n--- Cleaning Logs ---');
        const result = await cleanLogs();
        console.log(`  Cleaned: ${result.cleaned}, Skipped: ${result.skipped}`);
        totalCleaned += result.cleaned;
        totalSkipped += result.skipped;
    }
    
    if (target === 'all' || target === 'tmp') {
        console.log('\n--- Cleaning Tmp ---');
        const result = await cleanTmp();
        console.log(`  Cleaned: ${result.cleaned}, Skipped: ${result.skipped}`);
        totalCleaned += result.cleaned;
        totalSkipped += result.skipped;
    }
    
    if (target === 'all' || target === 'cache') {
        console.log('\n--- Cleaning Cache ---');
        const result = await cleanCache();
        console.log(`  Cleaned: ${result.cleaned}`);
        totalCleaned += result.cleaned;
    }
    
    if (target === 'all' || target === 'prune') {
        console.log('\n--- Running Prune ---');
        const result = await runPrune();
        console.log(`  Pruned: ${result.cleaned}, Kept: ${result.skipped}`);
        totalCleaned += result.cleaned;
    }
    
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║  Results                                 ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log(`  Total cleaned: ${totalCleaned}`);
    console.log(`  Total skipped: ${totalSkipped}`);
    
    if (flags.dryRun) {
        console.log('\n[DRY-RUN COMPLETE - No changes made]');
        console.log('Run without --dry-run to apply changes');
    }
}

run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
