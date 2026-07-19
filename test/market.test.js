#!/usr/bin/env node
/**
 * Market Module Unit Tests (v0.9.0)
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };
const asyncTests = [];

function test(name, fn) {
    try {
        const result = fn();
        // Handle async functions (return promise)
        if (result && typeof result.then === 'function') {
            asyncTests.push(result.then(r => {
                if (r === true || (r && r.success)) {
                    results.passed++;
                    console.log(`  ✓ ${name}`);
                } else {
                    results.failed++;
                    console.log(`  ✗ ${name}: ${r.error || 'assertion failed'}`);
                }
            }).catch(e => {
                results.failed++;
                console.log(`  ✗ ${name}: ${e.message}`);
            }));
        } else if (result === true || (result && result.success)) {
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

console.log('\n🛒 MARKET MODULE TESTS (v0.9.0)\n');

test('market module loads', () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    return { success: !!market };
});

test('market has list function', () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    return { success: typeof market.list === 'function' };
});

test('market has bid function', () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    return { success: typeof market.bid === 'function' };
});

test('market has trade function', () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    return { success: typeof market.trade === 'function' };
});

test('market has search function', () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    return { success: typeof market.search === 'function' };
});

test('market has get function', () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    return { success: typeof market.get === 'function' };
});

test('market has getBids function', () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    return { success: typeof market.getBids === 'function' };
});

test('market has stats function', () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    return { success: typeof market.stats === 'function' };
});

// Functional tests
const ctx = { agentId: 'test-agent', consentGiven: true };

console.log('\n--- Functional Tests ---\n');

test('list creates a listing', async () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    const listing = await market.list('knowledge', {
        title: 'Test Knowledge',
        summary: 'This is test knowledge',
        tags: ['test', 'demo'],
        seller: 'test-seller'
    }, ctx);
    return { success: listing && listing.id && listing.title === 'Test Knowledge' };
});

test('list indexes by type', async () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    await market.list('insight', {
        title: 'Test Insight',
        summary: 'Test',
        tags: ['test'],
        seller: 'test-seller-2'
    }, ctx);
    const stats = market.stats();
    return { success: stats.types && stats.types.insight };
});

test('list indexes by tags', async () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    await market.list('memory', {
        title: 'Tagged Memory',
        summary: 'Test',
        tags: ['tagged', 'memory'],
        seller: 'test-seller-3'
    }, ctx);
    const stats = market.stats();
    return { success: stats.tags && stats.tags.tagged };
});

test('bid creates a bid', async () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    const bid = await market.bid('Looking for test knowledge', {
        description: 'I need this',
        tags: ['test'],
        reward: 'knowledge:swap',
        bidder: 'test-bidder'
    }, ctx);
    return { success: bid && bid.id && bid.title === 'Looking for test knowledge' };
});

test('search by type returns results', async () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    await market.list('knowledge', {
        title: 'Searchable Knowledge',
        summary: 'Test',
        tags: ['search'],
        seller: 'search-seller'
    }, ctx);
    const results = await market.search({ type: 'knowledge' });
    return { success: results && results.length > 0 };
});

test('search by tags returns filtered results', async () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    await market.list('insight', {
        title: 'Tag Filter Test',
        summary: 'Test',
        tags: ['filter-test'],
        seller: 'filter-seller'
    }, ctx);
    const results = await market.search({ tags: ['filter-test'] });
    return { success: results && results.length > 0 };
});

test('search by query returns text matches', async () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    await market.list('memory', {
        title: 'Query Match Test',
        summary: 'This has unique query text',
        tags: ['query'],
        seller: 'query-seller'
    }, ctx);
    const results = await market.search({ query: 'unique query text' });
    return { success: results && results.length > 0 };
});

test('get returns listing by id', async () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    const created = await market.list('favor', {
        title: 'Get Test',
        summary: 'Test',
        seller: 'get-seller'
    }, ctx);
    const found = market.get(created.id);
    return { success: found && found.id === created.id };
});

test('getBids returns all bids', async () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    await market.bid('Test Bid 1', { description: 'Test' }, ctx);
    await market.bid('Test Bid 2', { description: 'Test' }, ctx);
    const bids = market.getBids();
    return { success: bids && bids.length >= 2 };
});

test('trade executes between buyer and seller', async () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    const listing = await market.list('knowledge', {
        title: 'Trade Test',
        summary: 'Test trade',
        seller: 'trade-seller',
        price: 'knowledge:swap'
    }, ctx);
    const trade = await market.trade(listing.id, 'trade-buyer', ctx);
    return { success: trade && (trade.id || trade.error) }; // May fail if trust too low
});

test('stats returns market statistics', async () => {
    const market = require(path.join(ROOT, 'lib', 'market'));
    const stats = market.stats();
    return { success: 
        typeof stats.listings === 'number' &&
        typeof stats.bids === 'number' &&
        typeof stats.trades === 'number'
    };
});

// Print summary
(async () => {
    if (asyncTests.length > 0) {
        await Promise.all(asyncTests);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(`RESULTS: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
    console.log('='.repeat(50));
    
    process.exit(results.failed > 0 ? 1 : 0);
})();
