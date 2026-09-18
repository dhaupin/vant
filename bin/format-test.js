/**
 * Format.js Test Suite (v0.8.6)
 * Comprehensive tests for format.js - CRITICAL for Vant workflow system
 * 
 * Run with: node bin/format-test.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const SUITE = [];

function test(name, fn) {
    SUITE.push({ name, fn });
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEq(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(msg || `Expected ${expected}, got ${actual}`);
    }
}

// ==================== TEST DATA ====================

const TEST_FILES = {
    'test.json': JSON.stringify({ intent: 'Test json', format: 'json' }),
    'test.yaml': 'intent: Test yaml\nformat: yaml',
    'test.md': '---\nintent: Test md\nformat: md\n---\n# Body',
    'test.txt': 'Just plain text intent',
};

// Temp dir for file tests
const TEMP_DIR = path.join(__dirname, '..', '.agent_tmp', 'format-test');

function setup() {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    for (const [name, content] of Object.entries(TEST_FILES)) {
        fs.writeFileSync(path.join(TEMP_DIR, name), content);
    }
}

function cleanup() {
    if (fs.existsSync(TEMP_DIR)) {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
}

// ==================== DETECTION TESTS ====================

test('format.detect - JSON', () => {
    const format = require('../lib/format');
    const result = format.detect('{"a":1}');
    assertEq(result.format, 'json', 'Should detect JSON');
    assert(result.confidence > 0.8, 'High confidence for JSON');
});

test('format.detect - YAML', () => {
    const format = require('../lib/format');
    const result = format.detect('key: value\nanother: thing');
    assertEq(result.format, 'yaml', 'Should detect YAML');
});

test('format.detect - Markdown frontmatter', () => {
    const format = require('../lib/format');
    const result = format.detect('---\nfoo: bar\n---\nBody');
    assertEq(result.format, 'md', 'Should detect MD with frontmatter');
});

test('format.detect - Plain text', () => {
    const format = require('../lib/format');
    const result = format.detect('just plain text');
    assertEq(result.format, 'txt', 'Should detect plain text');
});

test('format.detect - explicit JSON override', () => {
    const format = require('../lib/format');
    const result = format.detect('{"a":1}', { format: 'json' });
    assertEq(result.format, 'json', 'Should use explicit');
});

// ==================== PATH DETECTION ====================

test('format.detectFromPath - .json', () => {
    const format = require('../lib/format');
    const result = format.detectFromPath('config.json');
    assertEq(result.format, 'json', 'Should detect .json');
});

test('format.detectFromPath - .yaml', () => {
    const format = require('../lib/format');
    const result = format.detectFromPath('config.yaml');
    assertEq(result.format, 'yaml', 'Should detect .yaml');
});

test('format.detectFromPath - .yml normalizes to yaml', () => {
    const format = require('../lib/format');
    const result = format.detectFromPath('config.yml');
    assertEq(result.format, 'yaml', 'Should normalize .yml to yaml');
});

test('format.detectFromPath - .md', () => {
    const format = require('../lib/format');
    const result = format.detectFromPath('readme.md');
    assertEq(result.format, 'md', 'Should detect .md');
});

test('format.detectFromPath - .txt', () => {
    const format = require('../lib/format');
    const result = format.detectFromPath('notes.txt');
    assertEq(result.format, 'txt', 'Should detect .txt');
});

test('format.detectFromPath - .ini maps to txt parser', () => {
    const format = require('../lib/format');
    const result = format.detectFromPath('config.ini');
    assertEq(result.format, 'txt', 'INI mapped to txt parser');
});

// ==================== PARSE TESTS ====================

test('format.parse - JSON', () => {
    const format = require('../lib/format');
    const result = format.parse('{"intent": "test"}');
    assert(result.data, 'Should parse JSON');
    assertEq(result.data.intent, 'test', 'Should extract intent');
});

test('format.parse - YAML', () => {
    const format = require('../lib/format');
    const result = format.parse('intent: test\ngoal: done');
    assert(result.data, 'Should parse YAML');
    assertEq(result.data.intent, 'test', 'Should extract intent');
    assertEq(result.data.goal, 'done', 'Should extract goal');
});

test('format.parse - YAML list', () => {
    const format = require('../lib/format');
    const result = format.parse('steps:\n  - one\n  - two');
    assert(Array.isArray(result.data.steps), 'Should parse list');
    assertEq(result.data.steps.length, 2, 'Should have 2 items');
});

test('format.parse - MD with frontmatter', () => {
    const format = require('../lib/format');
    const result = format.parse('---\nintent: test\n---\n# Body', { format: 'md' });
    assertEq(result.data.meta.intent, 'test', 'Should extract frontmatter to meta');
});

test('format.parse - explicit format bypasses detection', () => {
    const format = require('../lib/format');
    // Not valid JSON but we force txt
    const result = format.parse('not json', { format: 'txt' });
    assert(result.data, 'Should return data');
});

// ==================== SERIALIZE TESTS ====================

test('format.serialize - JSON output', () => {
    const format = require('../lib/format');
    const result = format.serialize({ intent: 'test' }, 'json');
    assert(result.includes('intent'), 'Should serialize to JSON');
    assert(result.includes('"test"'), 'Should include value');
});

test('format.serialize - YAML output', () => {
    const format = require('../lib/format');
    const result = format.serialize({ intent: 'test', goal: 'done' }, 'yaml');
    assert(result.includes('intent: test'), 'Should serialize to YAML');
    assert(result.includes('goal: done'), 'Should include goal');
});

test('format.serialize - TXT output uses intent', () => {
    const format = require('../lib/format');
    const result = format.serialize({ intent: 'myintent' }, 'txt');
    assertEq(result, 'myintent', 'Should return intent');
});

// ==================== PIPELINE TESTS ====================

test('format.prepare - auto detect yaml', () => {
    const format = require('../lib/format');
    const result = format.prepare('intent: test\ngoal: done');
    assertEq(result.data.intent, 'test', 'Should auto-detect and parse');
    assertEq(result.format, 'yaml', 'Should detect format');
});

test('format.prepare - explicit json format', () => {
    const format = require('../lib/format');
    const result = format.prepare('{"a":1}', { format: 'json' });
    assertEq(result.data.a, 1, 'Should use explicit format');
});

test('format.prepare - string input passes through', () => {
    const format = require('../lib/format');
    // Note: pipeline expects string input, not objects
    const result = format.prepare('intent: test\ngoal: done');
    assertEq(result.data.intent, 'test', 'Should handle string input');
});

// ==================== FILE LOAD TESTS ====================

test('format.loadFile - json file', async () => {
    const format = require('../lib/format');
    const result = await format.loadFile('models/islands.json');
    assert(result.data, 'Should load JSON');
    assertEq(result.data.version, '1.0', 'Should parse version');
});

test('format.loadFile - yaml file', async () => {
    const format = require('../lib/format');
    const result = await format.loadFile('docker-compose.yml');
    assert(result.data, 'Should load YAML');
    assert(result.data.services, 'Should parse services');
});

test('format.loadFile - ini example', async () => {
    const format = require('../lib/format');
    const result = await format.loadFile('config.example.ini');
    assert(result.data, 'Should load INI');
    assert(result.data.intent || result.data.VANT_VERSION, 'Should parse INI');
});

// ==================== VALIDATOR TESTS ====================

test('format.registerValidator - custom schema', () => {
    const format = require('../lib/format');
    let validatesCalled = false;
    format.registerValidator('test-schema', (data) => {
        if (!data.requiredProp) throw new Error('Missing required');
        validatesCalled = true;
    });
    // Valid data should pass
    format.validate({ requiredProp: true }, 'test-schema');
    assert(validatesCalled, 'Should have called validator');
});

test('format.getStatus - reports enabled', () => {
    const format = require('../lib/format');
    const status = format.getStatus();
    assert(status.format === true, 'Should be enabled');
    assert(Array.isArray(status.supported), 'Should list supported formats');
});

// ==================== INTEGRATION TESTS ====================

test('Full round-trip: json -> parse -> serialize', () => {
    const format = require('../lib/format');
    const original = { intent: 'RoundTrip', format: 'test' };
    const serialized = format.serialize(original, 'json');
    const parsed = format.parse(serialized);
    assertEq(parsed.data.intent, 'RoundTrip', 'Should round-trip correctly');
});

test('Full round-trip: yaml -> parse -> serialize', () => {
    const format = require('../lib/format');
    const yamlIn = 'intent: Test\nmax_duration: 5m';
    const parsed = format.parse(yamlIn);
    const serialized = format.serialize(parsed.data, 'yaml');
    assert(serialized.includes('intent: Test'), 'Should round-trip YAML');
});

// ==================== EDGE CASES ====================

test('format.parse - empty string graceful', () => {
    const format = require('../lib/format');
    const result = format.parse('', { validate: false });
    // Empty should not throw
    assert(result.data !== undefined, 'Should handle empty string');
});

test('format.parse - invalid json graceful fallback', () => {
    const format = require('../lib/format');
    const result = format.parse('not valid json {', { validate: false });
    // Should either error or return data - just shouldn't crash
    assert(result.error || result.data, 'Should handle gracefully');
});

test('format.serialize - undefined falls back to empty', () => {
    const format = require('../lib/format');
    const result = format.serialize(undefined, 'json');
    assertEq(result, '', 'Should handle undefined gracefully');
});

// ==================== RUNNER ====================

async function runTests() {
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║      Format.js Test Suite v0.8.6         ║');
    console.log('╚═══════════════════════════════════════════╝');
    console.log('');
    
    // Setup temp test files
    setup();
    
    for (const { name, fn } of SUITE) {
        try {
            await fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (e) {
            console.log(`❌ ${name}`);
            console.log(`   → ${e.message}`);
            failed++;
        }
    }
    
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════');
    
    // Cleanup
    cleanup();
    process.exit(failed > 0 ? 1 : 0);
}

runTests();