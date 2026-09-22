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
    process.exit(0);
}

// Parse: support both -q/--quiet
const argsSet = new Set(args);
const quiet = argsSet.has('-q') || argsSet.has('--quiet');

const fs = require('fs');

// Lazy-load sandbox
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) { try { _sandbox = require("./lib/sandbox"); } catch (e) {} }
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
    // Check user's brain (determined by MODEL_PATH or config)
    const brainPath = process.env.MODEL_PATH || process.env.VANT_BRAIN_PATH || process.env.VANT_STORAGE_PATH || 'models/private';
    const brainFs = _brainStore(brainPath);
    const found = checks.some(pair => pair.some(f => brainFs.has(f)));
    
    if (found) {
        console.log('  ' + theme.status.ok('Brain exists at ' + brainPath));
        
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
        console.log('  ' + theme.status.fail('Private model not initialized (run vant setup)'));
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
    // Check base dirs + user's brain (MODEL_PATH or default private)
    const brainPath = process.env.MODEL_PATH || process.env.VANT_BRAIN_PATH || 'models/private';
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

function run() {
    console.log('\n' + theme.vantHeader + ' Health Check\n');
    
    checkModel();
    checkConfig();
    checkEnv();
    checkDirs();
    checkMigration();
    
    console.log('\n');
}

run();
module.exports = { checkModel, checkConfig, checkEnv, checkDirs, run };
