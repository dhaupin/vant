#!/usr/bin/env node
const vaf = require("../lib/vaf");
// VAF: No user input - checks .env exists only

/**
 * Vant Health Check
 * Checks system state and model integrity
 * 
 * All args should have both long (--arg) and short (-a) forms.
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

// Check if file exists - tries .md first, falls back to .txt
function fileExists(file) {
    if (fs.existsSync(file)) return true;
    const base = file.replace('.md', '');
    return fs.existsSync(base + '.md') || fs.existsSync(base + '.txt');
}

function checkModel() {
    console.log('\n📦 Model:');
    
    // Try .md first, then .txt for backward compat
    const checks = [
        ['identity.md', 'identity.txt'],
        ['meta.json'],
        ['lessons.md', 'lessons.txt']
    ];
    
    const required = ['identity.md', 'identity.txt'];
    const found = checks.some(pair => pair.some(f => fs.existsSync(path.join('models/public', f))));
    
    if (found) {
        console.log('  ✓ Public model exists');
        
        // Try to read identity
        const identityPath = fs.existsSync('models/public/identity.md') 
            ? 'models/public/identity.md' 
            : fs.existsSync('models/public/identity.txt') 
                ? 'models/public/identity.txt' 
                : null;
        
        if (identityPath) {
            const content = fs.readFileSync(identityPath, 'utf8');
            const modelMatch = content.match(/MODEL:\s*(.+)/);
            if (modelMatch) {
                console.log(`  → ${modelMatch[1]}`);
            }
        }
    } else {
        console.log('  ✗ Public model missing');
        return false;
    }
    
    return true;
}

function checkConfig() {
    console.log('\n⚙️  Config:');
    if (fs.existsSync('config.ini')) {
        console.log('  ✓ config.ini exists');
    } else {
        console.log('  ⚠ config.ini not found (run vant setup)');
    }
}

function checkEnv() {
    console.log('\n🔐 Environment:');
    if (fs.existsSync('.env')) {
        console.log('  ✓ .env exists');
    } else {
        console.log('  ⚠ .env not found');
    }
}

function checkDirs() {
    console.log('\n📁 Directories:');
    const dirs = ['models', 'models/public', 'lib', 'bin', 'states'];
    dirs.forEach(d => {
        if (fs.existsSync(d)) {
            console.log(`  ✓ ${d}/`);
        } else {
            console.log(`  ✗ ${d}/ missing`);
        }
    });
}

function run() {
    console.log('╔═══════════════════════════════════════╗');
    console.log('║         Vant Health Check            ║');
    console.log('╚═══════════════════════════════════════╝');
    
    checkModel();
    checkConfig();
    checkEnv();
    checkDirs();
    
    console.log('\n');
}

run();
module.exports = { checkModel, checkConfig, checkEnv, checkDirs, run };
