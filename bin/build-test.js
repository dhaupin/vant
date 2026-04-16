/**
 * VANT Build Test
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

// Test: Config loads
test('config.ini parses', () => {
    const content = fs.readFileSync('config.ini', 'utf8');
    if (!content.includes('VANT_VERSION=')) {
        throw new Error('VANT_VERSION not found');
    }
});

// Test: Settings loads
test('settings.ini parses', () => {
    const content = fs.readFileSync('settings.ini', 'utf8');
    if (!content.includes('HANDLE=')) {
        throw new Error('HANDLE not found');
    }
});

// Test: Mood loads
test('mood.ini parses', () => {
    const content = fs.readFileSync('mood.ini', 'utf8');
    if (!content.includes('MOOD=')) {
        throw new Error('MOOD not found');
    }
});

// Test: Model exists
test('latest model exists', () => {
    const dirs = fs.readdirSync('models').filter(d => d.startsWith('v'));
    if (!dirs.length) throw new Error('No models found');
});

// Test: Identity loads
test('identity.txt loads', () => {
    const dirs = fs.readdirSync('models').filter(d => d.startsWith('v'));
    const latest = dirs.sort().pop();
    const identity = path.join('models', latest, 'identity.txt');
    if (!fs.existsSync(identity)) {
        throw new Error('identity.txt not found');
    }
});

// Test: Run.js can start (with timeout)
test('run.js starts without error', () => {
    // Just check syntax by loading - use absolute path
    require(path.join(__dirname, '..', 'run.js'));
});

// Test: Health check runs
test('health.js runs', () => {
    execSync('node ' + path.join(__dirname, 'health.js'), { stdio: 'pipe' });
});

// Test: Load.js runs
test('load.js runs', () => {
    execSync('node bin/load.js v0.5.0', { stdio: 'pipe', cwd: '..' });
});

// Test: Sync.js runs
test('sync.js runs', () => {
    execSync('node bin/sync.js', { stdio: 'pipe', timeout: 10000, cwd: '..' });
});

// Test: Changelog.js runs
test('changelog.js runs', () => {
    execSync('node bin/changelog.js', { stdio: 'pipe', timeout: 10000, cwd: '..' });
});

// Test: Summary.js runs
test('summary.js runs', () => {
    execSync('node bin/summary.js', { stdio: 'pipe', cwd: '..' });
});

// Run all tests
console.log('╔═══════════════════════════════════════╗');
console.log('║       VANT Build Test v0.5.7         ║');
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