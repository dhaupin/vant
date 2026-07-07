#!/usr/bin/env node
/**
 * Canvas, Embed, Theme, Version, Cache, Network, Schema Module Tests
 *
 * Run individually or all: node test/test-integrations.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Test results
const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

// ============================================
// CANVAS
// ============================================
console.log('\n=== Canvas Module Tests ===\n');
const canvas = require('../lib/canvas');

test('has paintSpiral function', () => { return typeof canvas.paintSpiral === 'function'; });
test('has toSVG function', () => { return typeof canvas.toSVG === 'function'; });
test('has save function', () => { return typeof canvas.save === 'function'; });
test('has toMarkdown function', () => { return typeof canvas.toMarkdown === 'function'; });
test('has share function', () => { return typeof canvas.share === 'function'; });
test('has list function', () => { return typeof canvas.list === 'function'; });
test('has load function', () => { return typeof canvas.load === 'function'; });
test('has embed function', () => { return typeof canvas.embed === 'function'; });
test('has getCanvasPath function', () => { return typeof canvas.getCanvasPath === 'function'; });

// ============================================
// EMBED
// ============================================
console.log('\n=== Embed Module Tests ===\n');
const embed = require('../lib/embed');

test('has register function', () => { return typeof embed.register === 'function'; });
test('has setEmbedder function', () => { return typeof embed.setEmbedder === 'function'; });
test('has getEmbedder function', () => { return typeof embed.getEmbedder === 'function'; });
test('has listEmbedders function', () => { return typeof embed.listEmbedders === 'function'; });
test('has embed function', () => { return typeof embed.embed === 'function'; });
test('has embedBatch function', () => { return typeof embed.embedBatch === 'function'; });
test('has cosineSimilarity function', () => { return typeof embed.cosineSimilarity === 'function'; });
test('has EMBED_DIM constant', () => { return typeof embed.EMBED_DIM === 'number'; });

// ============================================
// THEME
// ============================================
console.log('\n=== Theme Module Tests ===\n');
const theme = require('../lib/theme');

test('has Theme class', () => { return typeof theme.Theme === 'function'; });
test('has create function', () => { return typeof theme.create === 'function'; });
test('has default object', () => { return typeof theme.default === 'object'; });
test('has vant string', () => { return typeof theme.vant === 'string'; });
test('has vantHeader string', () => { return typeof theme.vantHeader === 'string'; });
test('has vantError string', () => { return typeof theme.vantError === 'string'; });
test('has ok string', () => { return typeof theme.ok === 'string'; });
test('has fail string', () => { return typeof theme.fail === 'string'; });
test('has warn string', () => { return typeof theme.warn === 'string'; });
test('has info function', () => { return typeof theme.info === 'function'; });
test('has success function', () => { return typeof theme.success === 'function'; });
test('has error function', () => { return typeof theme.error === 'function'; });
test('has bold function', () => { return typeof theme.bold === 'function'; });
test('has dim function', () => { return typeof theme.dim === 'function'; });

// ============================================
// VERSION
// ============================================
console.log('\n=== Version Module Tests ===\n');
const version = require('../lib/version');

test('version is array-like', () => { return version.length >= 5; });
test('version has string elements', () => { return typeof version[0] === 'string'; });

// ============================================
// CACHE
// ============================================
console.log('\n=== Cache Module Tests ===\n');
const cache = require('../lib/cache');

test('has configure function', () => { return typeof cache.configure === 'function'; });
test('has set function', () => { return typeof cache.set === 'function'; });
test('has get function', () => { return typeof cache.get === 'function'; });
test('has remove function', () => { return typeof cache.remove === 'function'; });
test('has clear function', () => { return typeof cache.clear === 'function'; });
test('has has function', () => { return typeof cache.has === 'function'; });
test('has size function', () => { return typeof cache.size === 'function'; });
test('has compress function', () => { return typeof cache.compress === 'function'; });
test('has decompress function', () => { return typeof cache.decompress === 'function'; });
test('has createPool function', () => { return typeof cache.createPool === 'function'; });

// ============================================
// NETWORK
// ============================================
console.log('\n=== Network Module Tests ===\n');
const network = require('../lib/network');

test('has CONFIG object', () => { return typeof network.CONFIG === 'object'; });
test('has isDomainAllowed function', () => { return typeof network.isDomainAllowed === 'function'; });
test('has setAllowedDomains function', () => { return typeof network.setAllowedDomains === 'function'; });
test('has isOnline function', () => { return typeof network.isOnline === 'function'; });
test('has checkOnline function', () => { return typeof network.checkOnline === 'function'; });
test('has getLatency function', () => { return typeof network.getLatency === 'function'; });
test('has fetch function', () => { return typeof network.fetch === 'function'; });
test('has fetchJson function', () => { return typeof network.fetchJson === 'function'; });
test('has retry function', () => { return typeof network.retry === 'function'; });
test('has withTimeout function', () => { return typeof network.withTimeout === 'function'; });

// ============================================
// SCHEMA
// ============================================
console.log('\n=== Schema Module Tests ===\n');
const schema = require('../lib/schema');

test('has validateFile function', () => { return typeof schema.validateFile === 'function'; });
test('has validateState function', () => { return typeof schema.validateState === 'function'; });
test('has isValid function', () => { return typeof schema.isValid === 'function'; });
test('has getSchema function', () => { return typeof schema.getSchema === 'function'; });
test('has BRAIN_SCHEMA object', () => { return typeof schema.BRAIN_SCHEMA === 'object'; });

// ============================================
// RESULTS
// ============================================
console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped ===\n`);

if (results.failed > 0) {
    console.log('FAILED TESTS');
    process.exit(1);
}

console.log('All integration tests passed! 🔗\n');
