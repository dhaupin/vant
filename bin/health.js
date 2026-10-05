#!/usr/bin/env node
const vaf = require("../lib/vaf");
const theme = require("../lib/theme");

/**
 * Vant Health Check
 * Checks system state and model integrity
 * 
 * Usage: vant health [-h|--help] [-q|--quiet]
 */

// -h/--help: show help and exit
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log('Usage: vant health [-h|--help] [-q|--quiet]');
    console.log('');
    console.log('  -h, --help   Show this help');
    console.log('  -q, --quiet  Minimal output');
    console.log('  --sweep      Remove stranded write temps (debris janitor, pass 117)');
    process.exit(0);
}

// Parse: support both -q/--quiet, and --sweep (pass 117 debris janitor:
// operator intent to actually REMOVE stranded write temps, not just report)
const argsSet = new Set(args);
const quiet = argsSet.has('-q') || argsSet.has('--quiet');
const sweep = argsSet.has('--sweep');

const fs = require('fs');

// Lazy-load sandbox
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) { try { _sandbox = require("../lib/sandbox"); } catch (e) {} }
    return _sandbox;
}
function _checkRead() { const sandbox = _getSandbox(); if (sandbox && !sandbox.canRead()) throw new Error("Read required"); }
function _checkWrite() { const sandbox = _getSandbox(); if (sandbox && !sandbox.canWrite()) throw new Error("Write required"); }
const path = require('path');

// (fs→storage migration) brain-file existence/reads go through FileStorage so
// the sandbox + vaf security chain gates every access. config.ini/.env checks
// and dir listings stay on fs (app-config + enumeration classes,
// prd-storage.md).
function _brainStore(brainPath) {
    const Storage = require('../lib/storage');
    return new Storage.FileStorage({ basePath: path.resolve(brainPath) });
}

// Check if file exists - tries .md first, falls back to .txt
function fileExists(file) {
    if (fs.existsSync(file)) return true;
    const base = file.replace('.md', '');
    return fs.existsSync(base + '.md') || fs.existsSync(base + '.txt');
}

function checkModel() {
    console.log('\n' + theme.label('📦 Model:'));
    
    // Try .md first, then .txt for backward compat
    const checks = [
        ['identity.md', 'identity.txt'],
        ['meta.json'],
        ['lessons.md', 'lessons.txt']
    ];
    
    const required = ['identity.md', 'identity.txt'];
    // Check the ACTIVE brain (pass 74, multibrain census): getBrainPath()
    // honors VANT_BRAIN env > currentBrain; MODEL_PATH / VANT_BRAIN_PATH /
    // VANT_STORAGE_PATH remain explicit escapes.
    let brainPath = process.env.MODEL_PATH || process.env.VANT_BRAIN_PATH || process.env.VANT_STORAGE_PATH || null;
    if (!brainPath) {
        try { brainPath = require('../lib/brain').getBrainPath(); } catch (e) { brainPath = 'models/private'; }
    }
    const brainFs = _brainStore(brainPath);
    const markerFound = checks.some(pair => pair.some(f => brainFs.has(f)));
    // (pass 89 — prime #111) Template markers are NOT the definition of
    // "initialized": a brain grown by real use (orgchart/, state/, learned
    // docs) may never create identity.md/meta.json/lessons.md at its root,
    // and health contradicted itself — "not initialized" for a brain whose
    // very next section confirms the dir exists. Any content = initialized.
    const wantedMarkers = 'identity.md, meta.json, lessons.md';
    let contentCount = 0;
    try {
        const walk = (dir) => {
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
                if (ent.isDirectory()) walk(path.join(dir, ent.name));
                else contentCount++;
            }
        };
        walk(brainPath);
    } catch (e) {
        // Missing/unreadable dir → no content → genuinely uninitialized
        contentCount = 0;
    }
    const found = markerFound || contentCount > 0;

    if (found) {
        console.log('  ' + theme.status.ok('Brain exists at ' + brainPath));
        if (!markerFound) {
            console.log('  ' + theme.status.warn('No template markers at root (wanted: ' + wantedMarkers + ') — brain is in use, scaffold skipped'));
        }
        
        // Try to read identity
        const identityRel = brainFs.has('identity.md') 
            ? 'identity.md' 
            : brainFs.has('identity.txt') 
                ? 'identity.txt' 
                : null;
        
        if (identityRel) {
            const content = brainFs.read(identityRel, 'utf8');
            const modelMatch = content.match(/MODEL:\s*(.+)/);
            if (modelMatch) {
                console.log('  → ' + theme.value(modelMatch[1]));
            }
        }
    } else {
        console.log('  ' + theme.status.fail('Private model not initialized at ' + brainPath + ' (run vant setup)'));
        console.log('  Wanted marker files: ' + wantedMarkers);
        console.log('  Use models/public templates for fresh install');
    }
    
    return true;
}

function checkConfig() {
    console.log('\n' + theme.label('⚙️  Config:'));
    if (fs.existsSync('config.ini')) {
        console.log('  ' + theme.status.ok('config.ini exists'));
    } else {
        console.log('  ' + theme.status.warn('config.ini not found (run vant setup)'));
    }
}

function checkEnv() {
    console.log('\n' + theme.label('🔐 Environment:'));
    if (fs.existsSync('.env')) {
        console.log('  ' + theme.status.ok('.env exists'));
    } else {
        console.log('  ' + theme.status.warn('.env not found'));
    }
}

function checkDirs() {
    console.log('\n' + theme.label('📁 Directories:'));
    // Check base dirs + the ACTIVE brain (pass 74: VANT_BRAIN-aware
    // resolution; explicit env escapes win)
    let brainPath = process.env.MODEL_PATH || process.env.VANT_BRAIN_PATH || null;
    if (!brainPath) {
        try { brainPath = require('../lib/brain').getBrainPath(); } catch (e) { brainPath = 'models/private'; }
    }
    const dirs = ['models', 'models/private', 'lib', 'bin', brainPath];
    dirs.forEach(d => {
        if (fs.existsSync(d)) {
            console.log('  ' + theme.status.ok(d + '/'));
        } else {
            console.log('  ' + theme.status.fail(d + '/ missing'));
        }
    });

    // State now in brain path
    if (_brainStore(brainPath).has('.state.json')) {
        console.log('  ' + theme.status.ok(brainPath + '/.state.json'));
    }
}

function checkMigration() {
    // Cheap, silent-when-happy alert surface: a legacy (pre-multibrain)
    // tree is reported here on every `vant health` until it's migrated.
    try {
        const migrations = require('../lib/migrations');
        const s = migrations.status();
        const legacy = s.pending.find(p => p.id === 'legacy.multibrain-import');
        if (legacy) {
            console.log('\n' + theme.label('🧠 Brain layout:'));
            console.log('  ' + theme.status.warn('OLD-STYLE BRAIN detected (pre-multi-brain layout)'));
            console.log('  Your brain is not visible to the current loader until migrated.');
            console.log('  Run: ' + theme.value('vant migrate') + '   (name it: vant migrate --brain-name <name>)');
        }
    } catch (e) { /* never fail health over the notice */ }
}

function checkLock() {
    // (pass 107, S3) `vant health` shows lock state. Reports the active brain's
    // authorization lease (who may write) and the leases held across the stack;
    // never fails health over a lock-probe error.
    console.log('\n' + theme.label('🔐 Lock:'));
    try {
        const brainLock = require('../lib/brain-lock');
        const layer = brainLock.getLayerStatus();
        console.log('  ' + theme.status.ok(layer.name + ' (' + layer.type + ') enabled=' + layer.enabled));
        const status = brainLock.brainLockStatus();
        if (status && status.valid) {
            console.log('  ' + theme.status.ok('Lease held by ' + status.agentId + ' (' + status.age + 'ms old)'));
        } else {
            console.log('  ' + theme.status.ok('No active lease (brain is free to write)'));
        }
        const held = brainLock.listStackLocks();
        console.log('  Held across stack: ' + held.length);
        // (pass 117, target #2) Observability counters: contention and
        // fail-closed refusals as facts, not just stderr lines. In-process
        // counters — deltas between polls are the intended read.
        const lockMod = require('../lib/lock');
        const m = lockMod.stats();
        console.log('  Mutex (this process): acquires=' + m.acquires + ' held=' + m.held
            + ' unavailable=' + m.unavailable + ' takeovers=' + m.takeovers
            + ' refusals=' + m.aborted + ' bodyErrors=' + m.bodyErrors
            + ' holdMaxMs=' + m.holdMsMax);
        const l = brainLock.leaseStats();
        console.log('  Lease (this process): granted=' + l.granted + ' refreshed=' + l.refreshed
            + ' denied=' + l.denied + ' released=' + l.released
            + ' releaseDenied=' + l.releaseDenied + ' forced=' + l.forced);
    } catch (e) {
        console.log('  ' + theme.status.warn('Lock status unavailable: ' + e.message));
    }
}

// (pass 117, target #3) Debris janitor. `vant health` always REPORTS stranded
// <file>.<uuid> temps (read path, never mutates). `vant health --sweep` is
// the operator-intent action: actually remove them (age-guarded; fresh
// in-flight temps are never touched).
function checkDebris(sweep) {
    console.log('\n' + theme.label('🧹 Write debris:'));
    try {
        const storage = require('../lib/storage');
        const rep = storage.sweepTemps({ dryRun: !sweep });
        if (rep.found.length === 0) {
            console.log('  ' + theme.status.ok('No stranded write temps (' + rep.scanned + ' files scanned)'));
            return;
        }
        if (sweep) {
            console.log('  ' + theme.status.ok('Swept ' + rep.removed + ' debris file(s) of ' + rep.found.length + ' found (' + rep.scanned + ' scanned):'));
        } else {
            console.log('  ' + theme.status.warn(rep.found.length + ' stranded temp file(s) (' + rep.scanned + ' scanned) — run `vant health --sweep` to remove:'));
        }
        for (const f of rep.found.slice(0, 5)) {
            console.log('    - ' + f.file + ' (' + Math.round(f.ageMs / 1000) + 's old, ' + f.bytes + 'B)');
        }
        if (rep.found.length > 5) console.log('    … and ' + (rep.found.length - 5) + ' more');
        if (rep.errors > 0) console.log('  ' + theme.status.warn(rep.errors + ' unreadable entries skipped'));
    } catch (e) {
        console.log('  ' + theme.status.warn('Debris scan unavailable: ' + e.message));
    }
}

function run() {
    console.log('\n' + theme.vantHeader + ' Health Check\n');
    
    checkModel();
    checkConfig();
    checkEnv();
    checkDirs();
    checkMigration();
    checkLock();
    checkDebris(sweep);
    
    console.log('\n');
}

run();
module.exports = { checkModel, checkConfig, checkEnv, checkDirs, run };
