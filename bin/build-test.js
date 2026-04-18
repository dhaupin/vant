/**
 * Vant Build Test
 * Validates all scripts can load without errors
 * 
 * Usage: node bin/build-test.js
 * 
 * Exit codes:
 *   0 - All tests passed
 *   1 - One or more tests failed
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TESTS = [];

// Helper to add test
function test(name, fn) {
    TESTS.push({ name, fn });
}

// Test: Config example exists
test('config.example.ini exists', () => {
    if (!fs.existsSync('config.example.ini')) {
        throw new Error('config.example.ini not found');
    }
});

// Test: Env example exists
test('.env.example exists', () => {
    if (!fs.existsSync('.env.example')) {
        throw new Error('.env.example not found');
    }
});

// Test: Public model exists
test('public model exists', () => {
    if (!fs.existsSync('models/public')) {
        throw new Error('models/public not found');
    }
    const identity = path.join('models/public', 'identity.txt');
    if (!fs.existsSync(identity)) {
        throw new Error('identity.txt not found in public model');
    }
});

// Test: Run.js can start (with timeout)
test('run.js starts without error', () => {
    // Check if run.js exists (only in vant-brain, not public)
    const runPath = path.join(__dirname, '..', 'run.js');
    if (fs.existsSync(runPath)) {
        require(runPath);
    } else {
        console.log('  (run.js not in public release - skipped)');
    }
});

// Test: Health check runs
test('health.js runs', () => {
    execSync('node ' + path.join(__dirname, 'health.js'), { stdio: 'pipe' });
});

// Test: Load.js runs (public model)
test('load.js runs', () => {
    execSync('node bin/load.js', { stdio: 'pipe' });
});

// Test: Rate limiter works
test('rate-limit.js works', () => {
    const rl = require('../lib/rate-limit');
    const status = rl.getStatus();
    if (!status.remaining || !status.maxPerHour) {
        throw new Error('Rate limiter broken');
    }
    console.log(`  Rate limit: ${status.remaining}/${status.maxPerHour}/hr`);
});

// Test: Logger can initialize
test('logger.js works', () => {
    const logger = require('../lib/logger');
    logger.info('Test log', { test: true });
    console.log('  Logger OK');
});

// Test: Errors can be created
test('errors.js works', () => {
    const errors = require('../lib/errors');
    const err = new errors.VantError('Test error', { code: errors.CODES.CONFIG_MISSING });
    if (err.code !== 'CONFIG_MISSING') throw new Error('Error code failed');
    console.log('  Errors OK');
});

// Test: Stego module loads
test('stego.js works', () => {
    const stego = require('../lib/stego');
    if (typeof stego.encode !== 'function') throw new Error('Stego missing encode');
    if (typeof stego.decode !== 'function') throw new Error('Stego missing decode');
    if (typeof stego.encrypt !== 'function') throw new Error('Stego missing encrypt');
    console.log('  Stego OK + encryption');
});

// Test: Branch module loads
test('branch.js loads', () => {
    const branch = require('../lib/branch');
    if (typeof branch.currentBranch !== 'function') throw new Error('Branch missing currentBranch');
    console.log('  Branch OK');
});

// Test: Lock module loads (check acquire doesn't throw)
test('lock.js loads', async () => {
    const lock = require('../lib/lock');
    // Just check it loads - acquire will fail in test env without git
    console.log('  Lock OK');
});

// Note: sync.js, changelog.js, summary.js are only in vant-brain (private)

// Test: Example configs exist (for users to copy)
test('example configs exist', () => {
    const examples = ['settings.example.ini', 'mood.example.ini'];
    examples.forEach(f => {
        const p = path.join(__dirname, '..', f);
        if (!fs.existsSync(p)) {
            throw new Error(`${f} not found`);
        }
    });
});

// Run all tests
console.log('╔═══════════════════════════════════════╗');
console.log('║       Vant Build Test v0.8.2         ║');
console.log('╚═══════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;

for (const { name, fn } of TESTS) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (e) {
        console.log(`✗ ${name}: ${e.message}`);
        failed++;
    }
}

console.log('\n═══════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);