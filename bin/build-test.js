const version = require('../lib/version');
/**
 * Vant Build Test
 * Validates all scripts can load without errors
 */

const { execSync } = require('child_process');
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

// Test: Public model exists for fresh installs (template)
const config = require('./lib/config');
const publicDir = config.publicPath();
const identityMd = path.join(publicDir, 'identity.md');
const identityTxt = path.join(publicDir, 'identity.txt');
test('public model exists', () => {
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

// Test: qos.js works (consolidated rate-limit + circuit-breaker + bulkhead)
test('qos.js works', () => {
    const { QoS } = require('../lib/qos');
    const qos = new QoS();
    if (typeof qos.check !== 'function') {
        throw new Error('qos.js missing check()');
    }
    if (typeof qos.getLayerStatus !== 'function') {
        throw new Error('qos.js missing getLayerStatus()');
    }
    const key = 'test-key-' + Date.now();
    qos.reset(key);
    const allowed = qos.check(key, 'read');
    if (!allowed) {
        throw new Error('QoS check blocked first request');
    }
});

// Test: logger.js works
test('logger.js works', () => {
    const logger = require('../lib/audit');
    logger.info('Test log', { test: true });
});

// Test: error.js works
test('error.js works', () => {
    const errors = require('../lib/error');
    if (typeof errors.Error !== 'function') {
        throw new Error('error.js missing vantError()');
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

// Test: resolution.js loads
test('resolution.js loads', () => {
    const res = require('../lib/resolution');
    if (typeof res.resolve !== 'function') {
        throw new Error('resolution.js missing resolve()');
    }
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

// Test: vaf.js loads and works
test('vaf.js works', () => {
    const vaf = require('../lib/vaf');
    // Check key functions exist
    if (typeof vaf.check !== 'function') {
        throw new Error('vaf.js missing check()');
    }
    if (typeof vaf.checkPathTraversal !== 'function') {
        throw new Error('vaf.js missing checkPathTraversal()');
    }
    // Test blocking
    const blocked = vaf.checkPathTraversal('../etc/passwd');
    if (!blocked.blocked) {
        throw new Error('Path traversal not blocked');
    }
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
