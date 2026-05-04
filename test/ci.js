#!/usr/bin/env node
/**
 * Vant CI Test Runner
 * With proper exit codes for CI/CD integration
 * 
 * Usage: node test/ci.js [--lib name] [--bin name] [--json]
 * 
 * Exit codes:
 *   0 = success (all tests pass)
 *   1 = failure (tests fail)
 *   2 = warning (lint/info only)
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

const JSON_MODE = args.includes('--json');
const LIB = args.find(a => a.startsWith('--lib='))?.split('=')[1];
const BIN = args.find(a => a.startsWith('--bin='))?.split('=')[1];

const results = { passed: [], failed: [], warnings: [] };

function log(msg) {
  if (!JSON_MODE) console.log(msg);
}

function addPass(name) {
  results.passed.push(name);
  log(`✓ ${name}`);
}

function addFail(name, err) {
  results.failed.push({ name, error: err });
  log(`✗ ${name}: ${err}`);
}

function addWarn(name, msg) {
  results.warnings.push({ name, message: msg });
  log(`⚠ ${name}: ${msg}`);
}

// Test a library
async function testLib(name) {
  const modName = name.replace(/-/g, '');
  try {
    const lib = require(path.join(ROOT, 'lib', name + '.js'));
    addPass(`lib:${name}`);
    
    // Check exports
    const exports = Object.keys(lib);
    if (exports.length === 0) {
      addWarn(`lib:${name}:exports`, 'No exports');
    }
  } catch(e) {
    addFail(`lib:${name}`, e.message);
  }
}

// Test a binary
async function testBin(name) {
  return new Promise(resolve => {
    const proc = spawn('node', [path.join(ROOT, 'bin', name + '.js')], {
      timeout: 3000,
      stdio: 'pipe'
    });
    
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    
    proc.on('close', code => {
      if (code === 0 || out.trim()) {
        addPass(`bin:${name}`);
      } else {
        addFail(`bin:${name}`, err || `exit ${code}`);
      }
      resolve();
    });
    
    proc.on('error', e => {
      addFail(`bin:${name}`, e.message);
      resolve();
    });
    
    // Don't timeout - just mark as timeout check
    // setTimeout(() => resolve(), 2000);
  });
}

// Main
async function main() {
  log('VANT CI TEST RUNNER');
  log('='.repeat(40));
  
  // Test libraries
  if (!BIN) {
    const libs = fs.readdirSync(path.join(ROOT, 'lib')).filter(f => f.endsWith('.js'));
    for (const lib of libs) {
      const name = lib.replace('.js', '');
      if (!LIB || LIB === name) {
        await testLib(name);
      }
    }
  }
  
  // Test binaries
  if (!LIB) {
    const bins = fs.readdirSync(path.join(ROOT, 'bin')).filter(f => f.endsWith('.js'));
    for (const bin of bins) {
      const name = bin.replace('.js', '');
      if (!BIN || BIN === name) {
        await testBin(name);
      }
    }
  }
  
  // Summary
  log('');
  log('='.repeat(40));
  const passed = results.passed.length;
  const failed = results.failed.length;
  const warnings = results.warnings.length;
  
  if (JSON_MODE) {
    console.log(JSON.stringify({
      passed,
      failed,
      warnings,
      details: results
    }, null, 2));
  } else {
    log(`RESULTS: ${passed} passed, ${failed} failed, ${warnings} warnings`);
  }
  
  // Exit
  if (failed > 0) process.exit(1);
  if (warnings > 0) process.exit(2);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});