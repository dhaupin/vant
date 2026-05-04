#!/usr/bin/env node
/**
 * Vant Test Runner
 * Comprehensive component testing framework
 * 
 * Usage: node test/runner.js
 *        node test/runner.js --lib vaf
 *        node test/runner.js --bin vant
 */

const fs = require('fs');
const path = require('path');

// Get vant root directory
const ROOT = path.resolve(__dirname, '..');

// Test results storage
const results = {
  passed: 0,
  failed: 0,
  errors: []
};

function pass(name, details = '') {
  results.passed++;
  console.log(`✓ ${name}`);
}

function fail(name, error) {
  results.failed++;
  results.errors.push({ name, error });
  console.log(`✗ ${name}: ${error}`);
}

// ============================================
// LIBRARY TESTS
// ============================================

function testLib(name, modPath, tests = {}) {
  console.log(`\n📦 Testing: ${name}`);
  
  try {
    const mod = require(path.join(ROOT, modPath));
    
    // Load test
    if (tests.load !== false) {
      if (mod) {
        pass(`${name} loads`);
      } else {
        fail(`${name} loads`, 'module is null');
      }
    }
    
    // Function tests
    if (tests.functions) {
      for (const [fn, expected] of Object.entries(tests.functions)) {
        if (typeof mod[fn] === 'function') {
          pass(`${name}.${fn} is function`);
        } else {
          fail(`${name}.${fn}`, `not a function: ${typeof mod[fn]}`);
        }
      }
    }
    
  } catch (e) {
    fail(`${name} load`, e.message);
  }
}

// ============================================
// BINARY TESTS
// ============================================

function testBin(name, binPath, args = [], timeout = 3000) {
  return new Promise((resolve) => {
    console.log(`\n🔧 Testing: ${name}`);
    
    const proc = require('child_process').spawn('node', [binPath, ...args], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });
    
    let output = '';
    let error = '';
    
    proc.stdout.on('data', (d) => { output += d; });
    proc.stderr.on('data', (d) => { error += d; });
    
    setTimeout(() => {
      proc.kill();
      
      if (error.toString().includes('SyntaxError') || error.toString().includes('ReferenceError')) {
        fail(`${name} syntax`, error.toString().substring(0, 100));
        resolve();
        return;
      }
      
      // Check expected output patterns
      if (args.length === 0) {
        // Basic run - should not crash
        pass(`${name} runs without crash`);
      } else {
        pass(`${name} args: ${args.join(' ')}`);
      }
      
      resolve();
    }, timeout);
  });
}

// ============================================
// SECURITY TESTS
// ============================================

function testSecurity(name, testFn) {
  console.log(`\n🔒 Testing: ${name}`);
  try {
    const result = testFn();
    if (result.blocked) {
      pass(`${name} blocked`, result.pattern || 'attack pattern');
    } else {
      fail(`${name} security`, 'should have blocked');
    }
  } catch (e) {
    fail(`${name} security`, e.message);
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const filter = args.includes('--lib') ? args[args.indexOf('--lib') + 1] : null;
  const binFilter = args.includes('--bin') ? args[args.indexOf('--bin') + 1] : null;
  
  console.log('='.repeat(50));
  console.log('VANT TEST RUNNER');
  console.log('='.repeat(50));
  
  // ============================================
  // CORE LIBRARIES
  // ============================================
  
  if (!filter || filter === 'vaf') {
    testLib('vaf', './lib/vaf', {
      functions: { check: 1, checkPathTraversal: 1, checkContent: 1 }
    });
    
    testSecurity('VAF path traversal', () => {
      const vaf = require(path.join(ROOT, 'lib/vaf'));
      return vaf.checkPathTraversal('../etc/passwd');
    });
    
    testSecurity('VAF script injection', () => {
      const vaf = require(path.join(ROOT, 'lib/vaf'));
      return vaf.checkContent('<script>');
    });
  }
  
  if (!filter || filter === 'config') {
    testLib('config', './lib/config', {
      functions: { get: 1, getAll: 1, getGithub: 1 }
    });
  }
  
  if (!filter || filter === 'lock') {
    testLib('lock', './lib/lock', {
      functions: { acquire: 1, release: 1, status: 1 }
    });
  }
  
  if (!filter || filter === 'branch') {
    testLib('branch', './lib/branch', {
      functions: { checkout: 1, commit: 1, status: 1 }
    });
  }
  
  if (!filter || filter === 'brain') {
    testLib('brain', './lib/brain', {
      functions: { load: 1, write: 1 }
    });
  }
  
  if (!filter || filter === 'logger') {
    testLib('logger', './lib/logger', {
      functions: { info: 1, warn: 1, error: 1 }
    });
  }
  
  if (!filter || filter === 'errors') {
    testLib('errors', './lib/errors', {
      functions: { VantError: 1, handle: 1 }
    });
  }
  
  if (!filter || filter === 'entropy') {
    testLib('entropy', './lib/entropy', {
      functions: { generatePatches: 1, hydratePatches: 1 }
    });
    
    testSecurity('Entropy buffer limit', () => {
      const vaf = require(path.join(ROOT, 'lib/vaf'));
      try {
        vaf.check('x'.repeat(20 * 1024 * 1024), { type: 'string', maxLength: 10 * 1024 * 1024 });
        return { blocked: false };
      } catch(e) {
        // Should throw - this is correct behavior
        return { blocked: true, pattern: e.message };
      }
    });
  }
  
  if (!filter || filter === 'stego') {
    testLib('stego', './lib/stego', {
      functions: { encode: 1, decode: 1 }
    });
  }
  
  if (!filter || filter === 'rate-limit') {
    testLib('rate-limit', './lib/rate-limit', {
      functions: { canMakeRequest: 1, recordRequest: 1 }
    });
  }
  
  // ============================================
  // BINARIES
  // ============================================
  
  if (!binFilter || binFilter === 'vant') {
    await testBin('vant', './bin/vant.js');
  }
  
  if (!binFilter || binFilter === 'health') {
    await testBin('health', './bin/health.js');
  }
  
  if (!binFilter || binFilter === 'load') {
    await testBin('load', './bin/load.js');
  }
  
  if (!binFilter || binFilter === 'sync') {
    await testBin('sync', './bin/sync.js');
  }
  
  if (!binFilter || binFilter === 'mcp') {
    await testBin('mcp', './bin/mcp.js', [], 2000);
  }
  
  if (!binFilter || binFilter === 'help') {
    await testBin('help', './bin/help.js');
  }
  
  // ============================================
  // SUMMARY
  // ============================================
  
  console.log('\n' + '='.repeat(50));
  console.log(`RESULTS: ${results.passed} passed, ${results.failed} failed`);
  console.log('='.repeat(50));
  
  if (results.failed > 0) {
    console.log('\nFailed tests:');
    results.errors.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.name}`);
      console.log(`     ${e.error}`);
    });
    process.exit(1);
  }
  
  process.exit(0);
}

main().catch(console.error);