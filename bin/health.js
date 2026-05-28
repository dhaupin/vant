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
    const found = checks.some(pair => pair.some(f => fs.existsSync(path.join(brainPath, f))));
    
    if (found) {
        console.log('  ' + theme.status.ok('Brain exists at ' + brainPath));
        
        // Try to read identity
        const identityPath = fs.existsSync(brainPath + '/identity.md') 
            ? brainPath + '/identity.md' 
            : fs.existsSync(brainPath + '/identity.txt') 
                ? brainPath + '/identity.txt' 
                : null;
        
        if (identityPath) {
            const content = fs.readFileSync(identityPath, 'utf8');
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
    if (fs.existsSync(brainPath + '/.state.json')) {
        console.log('  ' + theme.status.ok(brainPath + '/.state.json'));
    }
}

function run() {
    console.log('\n' + theme.vantHeader + ' Health Check\n');
    
    checkModel();
    checkConfig();
    checkEnv();
    checkDirs();
    
    console.log('\n');
}

run();
module.exports = { checkModel, checkConfig, checkEnv, checkDirs, run };
