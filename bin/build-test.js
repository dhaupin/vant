const version = require('../lib/version');
/**
 * Vant Build Test
 * Validates all scripts can load without errors
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TESTS = [];

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

// Test: Public model exists (check both .md and .txt for backward compat)
test('public model exists', () => {
    const identityMd = path.join('models/public', 'identity.md');
    const identityTxt = path.join('models/public', 'identity.txt');
    if (!fs.existsSync(identityMd) && !fs.existsSync(identityTxt)) {
        throw new Error('identity.md or identity.txt not found in public model');
    }
});

// Test: run.js can start
test('run.js starts without error', () => {
    const runPath = path.join(__dirname, '..', 'run.js');
    if (fs.existsSync(runPath)) {
        require(runPath);
    } else {
        // run.js not in public release - this is expected
    }
});

// Test: health.js runs
test('health.js runs', () => {
    require('./health');
});

// Test: load.js runs
test('load.js runs', () => {
    require('./load');
});

// Test: rate-limit.js works
test('rate-limit.js works', () => {
    const rl = require('../lib/rate-limit');
    if (typeof rl.getStatus !== 'function') {
        throw new Error('rate-limit.js missing get()');
    }
});

// Test: logger.js works
test('logger.js works', () => {
    const logger = require('../lib/logger');
    logger.info('Test log', { test: true });
});

// Test: errors.js works
test('errors.js works', () => {
    const errors = require('../lib/errors');
    if (typeof errors.VantError !== 'function') {
        throw new Error('errors.js missing vantError()');
    }
});

// Test: stego.js works
test('stego.js works', () => {
    const stego = require('../lib/stego');
    if (typeof stego.encode !== 'function') {
        throw new Error('stego.js missing encode()');
    }
});

// Test: branch.js loads
test('branch.js loads', () => {
    const branch = require('../lib/branch');
});

// Test: lock.js loads
test('lock.js loads', () => {
    const lock = require('../lib/lock');
});

// Test: example configs exist
test('example configs exist', () => {
    const configs = ['config.example.ini', '.env.example'];
    configs.forEach(c => {
        if (!fs.existsSync(c)) {
            throw new Error(`${c} not found`);
        }
    });
});

// Run tests
let passed = 0;
let failed = 0;

console.log('╔═══════════════════════════════════════╗');
console.log('║       Vant Build Test v' + version + '         ║');
console.log('╚═══════════════════════════════════════╝');

for (const t of TESTS) {
    try {
        t.fn();
        console.log(`✓ ${t.name}`);
        passed++;
    } catch (e) {
        console.log(`✗ ${t.name}: ${e.message}`);
        failed++;
    }
}

console.log('\n═══════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════');

if (failed > 0) {
    process.exit(1);
}
