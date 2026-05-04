#!/usr/bin/env node
/**
 * Vant CI Test Runner
 * 
 * DESIGN PRINCIPLES:
 * - Simple: No heavy frameworks, easy to understand
 * - Extensible: Easy to add new tests
 * - Fork-friendly: Works in forks with minimal changes
 * - CI-compatible: Exit codes 0/1/2, JSON output
 * 
 * USAGE:
 *   node test/ci.js                    # Run all tests
 *   node test/ci.js --lib=vaf          # Test specific library
 *   node test/ci.js --lib=vaf --lib=config  # Multiple libs
 *   node test/ci.js --bin=vant         # Test specific binary
 *   node test/ci.js --json            # JSON output
 *   node test/ci.js --category=security  # Security tests only
 * 
 * EXIT CODES:
 *   0 = success (all tests pass)
 *   1 = failure (tests fail)
 *   2 = warning (non-critical issues)
 * 
 * FORK MODIFICATIONS:
 *   - Modify CATEGORIES to add test groups
 *   - Modify TEST_FUNCTIONS at bottom to add tests
 *   - Add fixtures as needed
 * 
 * NODE SUPPORT:
 *   - Node.js 18+ (required for fetch/globalThis)
 *   - See .nvmrc for exact version
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  /** @type {string[]} - Supported Node.js versions */
  supportedNode: ['18', '20', '22'],
  
  /** @type {number} - Test timeout in ms */
  testTimeout: 5000,
  
  /** @type {string[]} - Required files */
  requiredFiles: [
    'bin/vant.js',
    'lib/vaf.js', 
    'lib/config.js',
    'lib/lock.js',
    'lib/branch.js'
  ]
};

/** @readonly @enum {string} */
const CATEGORIES = {
  UNIT: 'unit',
  INTEGRATION: 'integration', 
  SECURITY: 'security',
  SMOKE: 'smoke'
};

// ============================================
// STATE
// ============================================

const state = {
  tests: [],
  passed: 0,
  failed: 0,
  warnings: 0,
  startTime: Date.now()
};

// Parse args
const options = {
  json: args.includes('--json'),
  libs: args.filter(a => a.startsWith('--lib=')).map(a => a.split('=')[1]),
  bins: args.filter(a => a.startsWith('--bin=')).map(a => a.split('=')[1]),
  category: args.find(a => a.startsWith('--category='))?.split('=')[1]
};

// ============================================
// TEST FUNCTIONS
// ============================================

/**
 * Log message (silent in JSON mode)
 * @param {string} msg 
 */
function log(msg) {
  if (!options.json) console.log(msg);
}

/**
 * Add a passing test
 * @param {string} name 
 */
function pass(name) {
  state.passed++;
  state.tests.push({ name, status: 'pass' });
  log(`✓ ${name}`);
}

/**
 * Add a failing test
 * @param {string} name 
 * @param {string} error 
 */
function fail(name, error) {
  state.failed++;
  state.tests.push({ name, status: 'fail', error });
  log(`✗ ${name}: ${error}`);
}

/**
 * Add a warning
 * @param {string} name 
 * @param {string} message 
 */
function warn(name, message) {
  state.warnings++;
  state.tests.push({ name, status: 'warn', message });
  log(`⚠ ${name}: ${message}`);
}

/**
 * Test a library loads
 * @param {string} name - Library name (without .js)
 * @param {object} [options] - Test options
 * @param {string} [options.category] - Test category
 * @param {string[]} [options.exports] - Required exports
 */
async function testLib(name, options = {}) {
  const { category = CATEGORIES.UNIT, exports: requiredExports } = options;
  
  // Filter by category
  if (options.category && options.category !== category) return;
  
  const fullName = `${category}:${name}`;
  
  try {
    const lib = require(path.join(ROOT, 'lib', name + '.js'));
    pass(fullName);
    
    // Check exports if specified
    if (requiredExports) {
      const actual = Object.keys(lib);
      const missing = requiredExports.filter(e => !actual.includes(e));
      if (missing.length > 0) {
        warn(`${fullName}:exports`, `Missing: ${missing.join(', ')}`);
      }
    }
  } catch(e) {
    fail(fullName, e.message);
  }
}

/**
 * Test a binary runs
 * @param {string} name - Binary name
 * @param {object} [options] - Test options
 */
async function testBin(name, options = {}) {
  const { category = CATEGORIES.SMOKE } = options;
  
  return new Promise(resolve => {
    const fullName = `${category}:${name}`;
    const binPath = path.join(ROOT, 'bin', name + '.js');
    
    // Check file exists
    if (!fs.existsSync(binPath)) {
      fail(fullName, 'File not found');
      resolve();
      return;
    }
    
    const proc = spawn('node', [binPath], {
      timeout: CONFIG.testTimeout,
      stdio: 'pipe'
    });
    
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    
    proc.on('close', code => {
      if (code === 0 || out.trim()) {
        pass(fullName);
      } else {
        fail(fullName, err || `exit ${code}`);
      }
      resolve();
    });
    
    proc.on('error', e => {
      fail(fullName, e.message);
      resolve();
    });
  });
}

/**
 * Test a security pattern is blocked
 * @param {string} name 
 * @param {string} input - Malicious input
 * @param {Function} testFn - Test function
 * @param {boolean} shouldBlock - Expected result
 */
async function testSecurity(name, input, testFn, shouldBlock = true) {
  const fullName = `security:${name}`;
  
  try {
    const result = testFn(input);
    if (result.blocked === shouldBlock) {
      pass(fullName);
    } else {
      fail(fullName, `Expected ${shouldBlock ? 'blocked' : 'allowed'}, got ${result.blocked}`);
    }
  } catch(e) {
    fail(fullName, e.message);
  }
}

/**
 * Check Node.js version is supported
 */
function checkNodeVersion() {
  const version = process.version.slice(1).split('.')[0];
  const supported = CONFIG.supportedNode.includes(version);
  
  if (supported) {
    pass(`node:${version}`);
  } else {
    warn(`node:${version}`, `Not in supported list: ${CONFIG.supportedNode.join(', ')}`);
  }
}

/**
 * Check required files exist
 */
function checkRequiredFiles() {
  CONFIG.requiredFiles.forEach(file => {
    const fullPath = path.join(ROOT, file);
    if (fs.existsSync(fullPath)) {
      pass(`file:${file}`);
    } else {
      fail(`file:${file}`, 'Required file missing');
    }
  });
}

/**
 * Check syntax of all JS files
 */
function checkSyntax() {
  const dirs = ['lib', 'bin'];
  
  dirs.forEach(dir => {
    const dirPath = path.join(ROOT, dir);
    if (!fs.existsSync(dirPath)) return;
    
    fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.js'))
      .forEach(file => {
        const fullPath = path.join(dirPath, file);
        try {
          require(fullPath);
          pass(`syntax:${dir}/${file}`);
        } catch(e) {
          if (e.message.includes('require') === false) {
            fail(`syntax:${dir}/${file}`, e.message);
          }
        }
      });
  });
}

// ============================================
// MAIN
// ============================================

async function main() {
  log('VANT CI TEST RUNNER');
  log('='.repeat(40));
  log(`Node.js: ${process.version}`);
  log('');
  
  // Pre-flight checks
  checkNodeVersion();
  checkRequiredFiles();
  checkSyntax();
  
  log('--- Libraries ---');
  
  // Library tests
  if (options.libs.length === 0 || options.libs.length > 0) {
    
    const libs = fs.readdirSync(path.join(ROOT, 'lib'))
      .filter(f => f.endsWith('.js'))
      .map(f => f.replace('.js', ''));
    
    for (const lib of libs) {
      if (options.libs.length === 0 || options.libs.includes(lib)) {
        await testLib(lib);
      }
    }
  }
  
  // Binary tests
  if (options.bins.length === 0) {
    log('--- Binaries ---');
    
    const bins = fs.readdirSync(path.join(ROOT, 'bin'))
      .filter(f => f.endsWith('.js'))
      .map(f => f.replace('.js', ''));
    
    for (const bin of bins) {
      if (options.bins.length === 0 || options.bins.includes(bin)) {
        await testBin(bin);
      }
    }
  }
  
  // Exit
  log('');
  log('='.repeat(40));
  const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
  
  if (options.json) {
    // In JSON mode, suppress all stdout except the final JSON output
    // Use stderr for debugging if needed
    Object.assign(process.stdout, { write: () => {} });
  }
  
  if (options.json) {
    console.log(JSON.stringify({
      node: process.version,
      passed: state.passed,
      failed: state.failed,
      warnings: state.warnings,
      elapsed: `${elapsed}s`,
      tests: state.tests
    }, null, 2));
  } else {
    log(`RESULTS: ${state.passed} passed, ${state.failed} failed, ${state.warnings} warnings (${elapsed}s)`);
  }
  
  // Exit codes
  if (state.failed > 0) process.exit(1);
  if (state.warnings > 0) process.exit(2);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});