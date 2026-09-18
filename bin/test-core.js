/**
 * Vant Test Runner
 * 
 * Modes:
 *   smoke     - Quick sanity checks (default)
 *   core      - Brain, storage, core modules
 *   full      - All 500+ tests
 * 
 * Usage:
 *   vant test           # smoke tests
 *   vant test smoke    # same as above
 *   vant test core     # brain + storage + core
 *   vant test full     # everything
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const DIR = path.join(__dirname, '..');
const TEST_DIR = path.join(DIR, 'test');

// Test groupings
const TEST_MODES = {
    smoke: [
        'health.test.js',
        'error.test.js',
        'stego.test.js',
        'event.test.js',
        'config.test.js',
    ],
    core: [
        'brain.test.js',
        'storage.test.js',
        'sandbox.test.js',
        'event.test.js',
        'audit.test.js',
        'config.test.js',
    ],
    full: []  // Filled dynamically
};

// Tests that need external test runners (mocha/jest) - skip in standalone mode
const SKIP_TESTS = [
    // No skipped tests - all converted to standard format
];

function getFullSuite() {
    // Collect all .test.js and *-test.js files, excluding skip list
    const files = fs.readdirSync(TEST_DIR)
        .filter(f => (f.endsWith('.test.js') || f.endsWith('-test.js')) && !SKIP_TESTS.includes(f))
        .sort();
    return files;
}

// Fill in full mode
TEST_MODES.full = getFullSuite();

function printBanner(title) {
    console.log('');
    console.log('╔' + '═'.repeat(50) + '╗');
    console.log('║ ' + title.padEnd(48) + '║');
    console.log('╚' + '═'.repeat(50) + '╝');
}

function runTestFile(filename) {
    const filepath = path.join(TEST_DIR, filename);
    try {
        execSync(`node "${filepath}"`, { 
            cwd: DIR, 
            stdio: 'pipe',
            timeout: 30000 
        });
        return { name: filename, passed: true, output: '' };
    } catch (e) {
        return { 
            name: filename, 
            passed: false, 
            output: e.stdout?.toString() || e.message 
        };
    }
}

async function runTests(mode = 'smoke') {
    const tests = TEST_MODES[mode];
    if (!tests) {
        console.error(`Unknown mode: ${mode}`);
        console.error(`Available modes: ${Object.keys(TEST_MODES).join(', ')}`);
        process.exit(1);
    }
    
    printBanner(`Vant Test Suite: ${mode.toUpperCase()}`);
    console.log(`Running ${tests.length} test files...\n`);
    
    let passed = 0, failed = 0;
    const results = [];
    
    for (const testFile of tests) {
        process.stdout.write(`  ${testFile}... `);
        const result = runTestFile(testFile);
        
        if (result.passed) {
            console.log('✓');
            passed++;
        } else {
            console.log('✗');
            failed++;
            results.push({ file: testFile, error: result.output.slice(0, 200) });
        }
    }
    
    printBanner('Results');
    console.log(`  Passed:  ${passed}`);
    console.log(`  Failed:  ${failed}`);
    console.log(`  Total:   ${passed + failed}`);
    
    if (failed > 0) {
        console.log('\nFailed tests:');
        results.forEach(r => console.log(`  - ${r.file}`));
        process.exit(1);
    }
    
    if (mode === 'full') {
        console.log(`\n✅ Full suite: ${passed} tests passed`);
    }
}

// CLI args
const args = process.argv.slice(2);
const mode = args[0] || 'smoke';
runTests(mode);