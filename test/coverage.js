#!/usr/bin/env node
/**
 * Vant Coverage Tests
 * 
 * Tests critical modules not covered by ci.js or runner.js
 * Focus: Security, schema, data integrity
 * 
 * Usage:
 *   node test/coverage.js        # Run all
 *   node test/coverage.js --lib  # Single module
 *   node test/coverage.js --json # JSON output
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const MODELS_DIR = path.join(ROOT, 'models');

// Track results
let results = { passed: 0, failed: 0, warnings: 0 };
let tests = [];

// ============================================
// TEST UTILITIES
// ============================================

function test(name, fn) {
    try {
        fn();
        results.passed++;
        tests.push({ name, status: 'passed' });
        console.log(`✓ ${name}`);
    } catch (e) {
        results.failed++;
        tests.push({ name, status: 'failed', error: e.message });
        console.log(`✗ ${name}: ${e.message}`);
    }
}

function warn(name, fn) {
    try {
        fn();
        results.warnings++;
        tests.push({ name, status: 'warning' });
        console.log(`⚠ ${name}`);
    } catch (e) {
        //Warnings don't fail
    }
}

// ============================================
// SCHEMA TESTS
// ============================================

function testSchema() {
    const schema = require(path.join(ROOT, 'lib/schema'));
    
    test('schema loads', () => {
        assert(typeof schema.isValid === 'function');
    });
    
    test('schema validates brain.json', () => {
        // Create valid brain
        const brain = { 
            identity: { name: 'Test' },
            learnings: [],
            memories: [],
            decisions: [],
            todos: []
        };
        // Should not throw
        schema.isValid(brain);
    });
    
    test('schema validates empty brain', () => {
        schema.isValid({});
    });
    
    test('schema checkFile method exists', () => {
        assert(typeof schema.checkFile === 'function' || typeof schema.validateFile === 'function');
    });
}

// ============================================
// AUDIT TESTS
// ============================================

function testAudit() {
    const audit = require(path.join(ROOT, 'lib/audit'));
    
    test('audit loads', () => {
        assert(audit);
    });
    
    test('audit.log method exists', () => {
        assert(typeof audit.log === 'function' || typeof audit.write === 'function');
    });
    
    test('audit creates ledger', () => {
        const ledger = path.join(MODELS_DIR, '.audit.json');
        // Should exist or create
        if (fs.existsSync(ledger)) {
            const data = JSON.parse(fs.readFileSync(ledger, 'utf8'));
            assert(Array.isArray(data.entries));
        }
    });
}

// ============================================
// CITATIONS TESTS
// ============================================

function testCitations() {
    const citations = require(path.join(ROOT, 'lib/citations'));
    
    test('citations loads', () => {
        assert(citations);
    });
    
    test('citations.addSource', () => {
        assert(typeof citations.addSource === 'function' || typeof citations.add === 'function');
    });
    
    test('citations.formatCitation', () => {
        assert(typeof citations.formatCitation === 'function' || typeof citations.format === 'function');
    });
    
    test('citations format correctness', () => {
        // Check format [Source: hash], expects {commit, context}
        const source = { commit: 'abc123def', context: 'test' };
        const out = citations.formatCitation(source);
        assert(out && out.includes('abc123'));
    });
}

// ============================================
// ISLANDS TESTS
// ============================================

function testIslands() {
    const islands = require(path.join(ROOT, 'lib/islands'));
    
    test('islands loads', () => {
        assert(islands);
    });
    
    test('islands.findTriggers', () => {
        assert(typeof islands.findTriggers === 'function' || typeof islands.trigger === 'function');
    });
    
    test('islands.autoHydrate', () => {
        assert(typeof islands.autoHydrate === 'function' || typeof islands.hydrate === 'function');
    });
    
    test('islands trigger detection', () => {
        if (islands.findTriggers) {
            const found = islands.findTriggers('github pr issue');
            assert(Array.isArray(found) || typeof found === 'string');
        }
    });
}

// ============================================
// STATE TESTS
// ============================================

function testState() {
    const state = require(path.join(ROOT, 'lib/state'));
    
    test('state loads', () => {
        assert(state);
    });
    
    test('state.getStatic', () => {
        assert(typeof state.getStatic === 'function' || typeof state.get === 'function');
    });
    
    test('state.setStatic', () => {
        assert(typeof state.setStatic === 'function' || typeof state.set === 'function');
    });
    
    test('state.clearTemp', () => {
        assert(typeof state.clearTemp === 'function' || typeof state.clear === 'function');
    });
}

// ============================================
// VIBE TESTS
// ============================================

function testVibe() {
    const vibe = require(path.join(ROOT, 'lib/vibe'));
    
    test('vibe loads', () => {
        assert(vibe);
    });
    
    test('vibe.setMood', () => {
        assert(typeof vibe.setMood === 'function' || typeof vibe.set === 'function');
    });
    
    test('vibe.getMood', () => {
        assert(typeof vibe.getMood === 'function' || typeof vibe.get === 'function');
    });
    
    test('vibe.onTaskSuccess', () => {
        assert(typeof vibe.onTaskSuccess === 'function' || typeof vibe.success === 'function');
    });
    
    test('vibe.onTaskError', () => {
        assert(typeof vibe.onTaskError === 'function' || typeof vibe.error === 'function');
    });
}

// ============================================
// HYBRID SEARCH TESTS
// ============================================

function testHybridSearch() {
    const search = require(path.join(ROOT, 'lib/search'));
    
    test('hybrid-search loads', () => {
        assert(search);
    });
    
    test('hybrid-search.search exists', () => {
        assert(typeof search.search === 'function');
    });
}

// ============================================
// QUERY TESTS
// ============================================

function testQuery() {
    const query = require(path.join(ROOT, 'lib/search-hyde'));
    
    test('query loads', () => {
        assert(query);
    });
    
    test('query.multiQuery exists', () => {
        assert(typeof query.multiQuery === 'function' || typeof query.transform === 'function');
    });
}

// ============================================
// RERANK TESTS
// ============================================

function testRerank() {
    const rerank = require(path.join(ROOT, 'lib/rerank'));
    
    test('rerank loads', () => {
        assert(rerank);
    });
    
    test('rerank.rerank exists', () => {
        assert(typeof rerank.rerank === 'function' || typeof rerank.rank === 'function');
    });
}

// ============================================
// REPOS TESTS
// ============================================

function testRepos() {
    const repos = require(path.join(ROOT, 'lib/repos'));
    
    test('repos loads', () => {
        assert(repos);
    });
    
    test('repos.register exists', () => {
        assert(typeof repos.register === 'function' || typeof repos.add === 'function');
    });
    
    test('repos.mount exists', () => {
        assert(typeof repos.mount === 'function');
    });
}

// ============================================
// HYBRID SYNC TESTS
// ============================================

function testHybrid() {
    const hybrid = require(path.join(ROOT, 'lib/hybrid'));
    
    test('hybrid loads', () => {
        assert(hybrid);
    });
    
    test('hybrid.pushPublic exists', () => {
        assert(typeof hybrid.pushPublic === 'function' || typeof hybrid.push === 'function');
    });
}

// ============================================
// GALLERY TESTS
// ============================================

function testGallery() {
    const gallery = require(path.join(ROOT, 'lib/gallery'));
    
    test('gallery loads', () => {
        assert(gallery);
    });
    
    test('gallery.saveImage exists', () => {
        assert(typeof gallery.saveImage === 'function' || typeof gallery.save === 'function');
    });
    
    test('gallery.loadImage exists', () => {
        assert(typeof gallery.loadImage === 'function' || typeof gallery.load === 'function');
    });
}

// ============================================
// HORCRUX TESTS
// ============================================

function testHorcrux() {
    const horcrux = require(path.join(ROOT, 'lib/horcrux'));
    
    test('horcrux loads', () => {
        assert(horcrux);
    });
    
    test('horcrux.generateManifest exists', () => {
        assert(typeof horcrux.generateManifest === 'function' || typeof horcrux.manifest === 'function');
    });
    
    test('horcrux.createBootstrap exists', () => {
        assert(typeof horcrux.createBootstrap === 'function' || typeof horcrux.create === 'function');
    });
}

// ============================================
// SEARCH (BASE) TESTS
// ============================================

function testSearch() {
    const search = require(path.join(ROOT, 'lib/search'));
    
    test('search loads', () => {
        assert(search);
    });
    
    test('search.getCurrentCommit exists', () => {
        assert(typeof search.getCurrentCommit === 'function');
    });
}

// ============================================
// RUN ALL
// ============================================

function run() {
    console.log('╔═══════════════════════════════════════╗');
    console.log('║  Vant Coverage Tests                   ║');
    console.log('╚═══════════════════════════════════════╝\n');
    
    console.log('📦 Testing: schema');
    testSchema();
    
    console.log('\n📦 Testing: audit');
    testAudit();
    
    console.log('\n📦 Testing: citations');
    testCitations();
    
    console.log('\n📦 Testing: islands');
    testIslands();
    
    console.log('\n📦 Testing: state');
    testState();
    
    console.log('\n📦 Testing: vibe');
    testVibe();
    
    console.log('\n📦 Testing: hybrid-search');
    testHybridSearch();
    
    console.log('\n📦 Testing: query');
    testQuery();
    
    console.log('\n📦 Testing: rerank');
    testRerank();
    
    console.log('\n📦 Testing: repos');
    testRepos();
    
    console.log('\n📦 Testing: hybrid');
    testHybrid();
    
    console.log('\n📦 Testing: gallery');
    testGallery();
    
    console.log('\n📦 Testing: horcrux');
    testHorcrux();
    
    console.log('\n📦 Testing: search');
    testSearch();
    
    // Summary
    console.log('\n==================================================');
    console.log(`RESULTS: ${results.passed} passed, ${results.failed} failed, ${results.warnings} warnings`);
    console.log('==================================================');
    
    // Exit code
    process.exit(results.failed > 0 ? 1 : 0);
}

// Run
run();