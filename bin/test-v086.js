/**
 * Vant v0.8.6 Test Suite
 */

const path = require('path');
const assert = require('assert');
const fs = require('fs');

const DIR = path.join(__dirname, '..');
const MODELS_DIR = path.join(DIR, 'models');

function resetBrain() {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    fs.writeFileSync(path.join(MODELS_DIR, 'brain.json'), JSON.stringify({
        identity: { name: 'Test', version: '0.8.6' },
        learnings: [],
        memories: [],
        decisions: [],
        todos: []
    }));
}

async function runTests() {
    console.log('╔═══════════════════════════════════════╗');
    console.log('║    Vant v0.8.6 Test Suite          ║');
    console.log('╚═══════════════════════════════════════╝');
    
    resetBrain();
    
    let passed = 0, failed = 0;
    
    // Islands
    try {
        console.log('\n[Islands]');
        const islands = require(path.join(DIR, 'lib/islands'));
        const manifest = islands.getManifest();
        assert(manifest.islands, 'Missing islands');
        const available = islands.getAvailable();
        assert(available.includes('identity'), 'No identity');
        const found = islands.findTriggers('github pr');
        assert(found.includes('github'), 'Trigger failed');
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    // State
    try {
        console.log('\n[State]');
        const state = require(path.join(DIR, 'lib/state'));
        state.setStatic({ t: 'v' });
        assert(state.getStatic('t') === 'v');
        state.setCurrent({ task: 'test' });
        assert(state.getCurrent('task') === 'test');
        const summary = state.getSummary();
        assert(summary.includes('static='));
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    // Horcrux
    try {
        console.log('\n[Horcrux]');
        const horcrux = require(path.join(DIR, 'lib/horcrux'));
        const m = horcrux.generateManifest({ provider: 'github' });
        assert(m.type === 'vant-horcrux');
        const bs = horcrux.createBootstrap(m, 'pass');
        const parsed = horcrux.parseBootstrap(bs, 'pass');
        assert(parsed.type === 'vant-horcrux');
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    // Search
    try {
        console.log('\n[Search]');
        const search = require(path.join(DIR, 'lib/search'));
        const commit = search.getCurrentCommit();
        assert(commit && commit.length >= 7);
        const summary = search.getSummary();
        assert(summary.currentCommit);
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    // Sync
    try {
        console.log('\n[Sync]');
        const sync = require(path.join(DIR, 'lib/sync'));
        const providers = sync.getConfiguredProviders();
        assert(Array.isArray(providers));
        const isRAID = sync.isRAID();
        assert(typeof isRAID === 'boolean');
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    // Stego
    try {
        console.log('\n[Stego]');
        const stego = require(path.join(DIR, 'lib/stego'));
        assert(typeof stego.encodeBrain === 'function');
        assert(typeof stego.decodeBrain === 'function');
        assert(typeof stego.getCapacity === 'function');
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    // Prune
    try {
        console.log('\n[Prune]');
        const prune = require(path.join(DIR, 'lib/prune'));
        assert(typeof prune.prune === 'function');
        const result = await prune.prune({ dryRun: true });
        assert(result);
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    // Providers
    try {
        console.log('\n[Providers]');
        const { getAllProviders, getProvider } = require(path.join(DIR, 'lib/providers'));
        const all = getAllProviders();
        assert(all.github);
        assert(all.gitlab);
        const auto = getProvider();
        assert(auto);
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    // Gallery
    try {
        console.log('\n[Gallery]');
        const gallery = require(path.join(DIR, 'lib/gallery'));
        const index = gallery.getIndex();
        assert(index.version === '1.0');
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    // Vibe
    try {
        console.log('\n[Vibe]');
        const vibe = require(path.join(DIR, 'lib/vibe'));
        assert(typeof vibe.getMood === 'function');
        assert(typeof vibe.setMood === 'function');
        const available = vibe.getAvailableVibes();
        assert(available.includes('experimental'));
        assert(available.includes('safety_first'));
        const commitVibe = vibe.getCommitVibe();
        assert(commitVibe.includes('[vibe:'));
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    // Repos
    try {
        console.log('\n[Repos]');
        const repos = require(path.join(DIR, 'lib/repos'));
        assert(typeof repos.list === 'function');
        assert(typeof repos.mount === 'function');
        const list = repos.list();
        assert(list.includes('github'));
        assert(list.includes('herbalism'));
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    // Hybrid
    try {
        console.log('\n[Hybrid]');
        const hybrid = require(path.join(DIR, 'lib/hybrid'));
        assert(typeof hybrid.setPrivacy === 'function');
        assert(typeof hybrid.getPrivacy === 'function');
        const summary = hybrid.getSummary();
        assert(typeof summary === 'object');
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    // HybridSearch
    try {
        console.log('\n[HybridSearch]');
        const hs = require(path.join(DIR, 'lib/hybrid-search'));
        assert(typeof hs.search === 'function');
        assert(typeof hs.indexDocument === 'function');
        const stats = hs.getStats();
        assert(typeof stats === 'object');
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    // Query
    try {
        console.log('\n[Query]');
        const query = require(path.join(DIR, 'lib/query'));
        assert(typeof query.multiQuery === 'function');
        assert(typeof query.hyde === 'function');
        const vars = query.multiQuery('how to setup vesc');
        assert(vars.length > 0);
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    // Rerank
    try {
        console.log('\n[Rerank]');
        const rerank = require(path.join(DIR, 'lib/rerank'));
        assert(typeof rerank.rerank === 'function');
        assert(typeof rerank.compress === 'function');
        const result = rerank.rerank([{ title: 'test', content: 'test content' }], 'test');
        assert(result.length > 0);
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    // Citations
    try {
        console.log('\n[Citations]');
        const citations = require(path.join(DIR, 'lib/citations'));
        assert(typeof citations.addSource === 'function');
        assert(typeof citations.formatCitation === 'function');
        citations.clear(); // Reset
        const src = citations.addSource('abc123def', 'test context');
        assert(src.commit === 'abc123def');
        console.log('  ✓');
        passed++;
    } catch (e) { console.log('  ✗', e.message); failed++; }
    
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║  Results: ' + passed + '/' + (passed + failed) + ' passed             ║');
    console.log('╚═══════════════════════════════════════╝');
    
    process.exit(failed > 0 ? 1 : 0);
}

runTests();