#!/usr/bin/env node
/**
 * Vant v0.8.6 Comprehensive Test Suite
 */

const path = require('path');
const DIR = process.cwd();
let passed = 0;
let failed = 0;

console.log('╔═══════════════════════════════════════╗');
console.log('║  Vant v0.8.6 Comprehensive Tests  ║');
console.log('╚═══════════════════════════════════════╝');

// Brain
console.log('\n[Brain]');
try {
    const brain = require(path.join(DIR, 'lib', 'brain'));
    brain.load();
    console.log('  ✓ load');
    passed++;
} catch (e) { console.log('  ✗', e.message); failed++; }

// Islands
console.log('\n[Islands]');
try {
    const islands = require(path.join(DIR, 'lib', 'islands'));
    console.log('  ✓ require');
    passed++;
    const avail = islands.getAvailable();
    if (Array.isArray(avail)) { console.log('  ✓ getAvailable'); passed++; }
} catch (e) { console.log('  ✗', e.message); failed++; }

// Vibe
console.log('\n[Vibe]');
try {
    const vibe = require(path.join(DIR, 'lib', 'vibe'));
    const mood = vibe.getMood();
    if (typeof mood === 'string') { console.log('  ✓ getMood'); passed++; }
    const config = vibe.getMoodConfig('focus');
    if (typeof config === 'object') { console.log('  ✓ getMoodConfig'); passed++; }
    vibe.setMood('focus');
    console.log('  ✓ setMood');
    passed++;
} catch (e) { console.log('  ✗', e.message); failed++; }

// Stego
console.log('\n[Stego]');
try {
    const stego = require(path.join(DIR, 'lib', 'stego'));
    const buf = stego.encode({ test: true });
    if (Buffer.isBuffer(buf)) { console.log('  ✓ encode'); passed++; }
} catch (e) { console.log('  ✗', e.message); failed++; }

// Prune
console.log('\n[Prune]');
try {
    const prune = require(path.join(DIR, 'lib', 'prune'));
    const v = prune.getVersion();
    if (typeof v === 'string') { console.log('  ✓ getVersion'); passed++; }
    const l = prune.getLearnings();
    if (Array.isArray(l)) { console.log('  ✓ getLearnings'); passed++; }
} catch (e) { console.log('  ✗', e.message); failed++; }

// HybridSearch
console.log('\n[HybridSearch]');
try {
    const search = require(path.join(DIR, 'lib', 'hybrid-search'));
    search.search('test').then(r => {
        if (typeof r === 'object') { console.log('  ✓ search'); passed++; }
    });
} catch (e) { console.log('  ✗', e.message); failed++; }

// Query
console.log('\n[Query]');
try {
    const query = require(path.join(DIR, 'lib', 'query'));
    query.hyde('test').then(r => {
        if (typeof r === 'object') { console.log('  ✓ hyde'); passed++; }
    });
} catch (e) { console.log('  ✗', e.message); failed++; }

// Rerank
console.log('\n[Rerank]');
try {
    const rerank = require(path.join(DIR, 'lib', 'rerank'));
    const r = rerank.compress([{ content: 'test' }], 1000);
    if (Array.isArray(r)) { console.log('  ✓ compress'); passed++; }
} catch (e) { console.log('  ✗', e.message); failed++; }

// Citations
console.log('\n[Citations]');
try {
    const citations = require(path.join(DIR, 'lib', 'citations'));
    const src = citations.addSource('abc', 'ctx');
    if (typeof src === 'object') { console.log('  ✓ addSource'); passed++; }
    const cit = citations.formatCitation(src);
    if (typeof cit === 'string') { console.log('  ✓ formatCitation'); passed++; }
    citations.clear();
} catch (e) { console.log('  ✗', e.message); failed++; }

// Schema
console.log('\n[Schema]');
try {
    const schema = require(path.join(DIR, 'lib', 'schema'));
    const v = schema.validateFile('brain.json');
    if (typeof v === 'object') { console.log('  ✓ validateFile'); passed++; }
    const valid = schema.isValid();
    if (typeof valid === 'object') { console.log('  ✓ isValid'); passed++; }
} catch (e) { console.log('  ✗', e.message); failed++; }

// Audit
console.log('\n[Audit]');
try {
    const audit = require(path.join(DIR, 'lib', 'audit'));
    const entry = audit.log('test:module');
    if (typeof entry === 'object') { console.log('  ✓ log'); passed++; }
    const health = audit.healthCheck();
    if (typeof health === 'object') { console.log('  ✓ healthCheck'); passed++; }
    audit.clear();
} catch (e) { console.log('  ✗', e.message); failed++; }

// Sync
console.log('\n[Sync]');
try {
    const sync = require(path.join(DIR, 'lib', 'sync'));
    const closed = sync.isCircuitClosed('test');
    if (typeof closed === 'boolean') { console.log('  ✓ isCircuitClosed'); passed++; }
    sync.recordFailure('test-prov');
    sync.recordSuccess('test-prov');
    console.log('  ✓ recordFailure/Success');
    passed++;
} catch (e) { console.log('  ✗', e.message); failed++; }

// VAF
console.log('\n[VAF]');
try {
    const vaf = require(path.join(DIR, 'lib', 'vaf'));
    vaf.check('hello', { type: 'string' });
    console.log('  ✓ check string');
    passed++;
    const s = vaf.sanitize({ a: null, b: undefined, c: 'test' });
    if (s.c === 'test') { console.log('  ✓ sanitize'); passed++; }
} catch (e) { console.log('  ✗', e.message); failed++; }

// Providers
console.log('\n[Providers]');
try {
    const providers = require(path.join(DIR, 'lib', 'providers'));
    const all = providers.getAllProviders();
    if (typeof all === 'object') { console.log('  ✓ getAllProviders'); passed++; }
    const gh = providers.getProvider('github');
    if (typeof gh === 'object') { console.log('  ✓ GitHub provider'); passed++; }
} catch (e) { console.log('  ✗', e.message); failed++; }

console.log('\n╔═══════════════════════════════════════╗');
console.log('║  Results: ' + passed + '/' + (passed + failed) + ' passed             ║');
console.log('╚═══════════════════════════════════════╝');

process.exit(failed > 0 ? 1 : 0);