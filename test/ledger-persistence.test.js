#!/usr/bin/env node
/**
 * Ledger Persistence Tests (pass 38 / prd-vant-os Wave 3)
 *
 * Pins Architecture A for consensus + market (registry/trust/msg already
 * pinned in registry-persistence / state-persistence):
 *   1. consensus round-trip across a REAL process death (create → vote
 *      → kill → new process tallies identically incl. hash)
 *   2. consensus status transitions persist (resolve → passed)
 *   3. market round-trip: list + bid + trade survive a real process
 *      death (listing supply consumed, trade recorded)
 *   4. market supply: Infinity round-trips (null on disk ⇄ Infinity in
 *      memory) — the scarcity opt-out must not silently cap at 1
 *   5. market _reserved never persists (phantom-reservation reset)
 *   6. market search index rebuilt for restored listings (byType)
 *   7. kind marker present on both state files
 *
 * Children receive their contract via VANT_W3_ROLE env (NOT argv — the
 * previous draft had node -e "code" LISTING_ID, which node parses as a
 * SECOND eval script, i.e. self-injection). Consensus children grant
 * sandbox caps explicitly: FileStorage is allow-with-warning on missing
 * caps, but the explicit grant matches how bin/org.js operates.
 *
 * Self-reporting suite: exit 1 on fail. Cleans state files on exit.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = process.cwd();
const results = { passed: 0, failed: 0 };
const failures = [];

function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => {
            results.passed++;
            console.log(`  ✓ ${name}`);
        })
        .catch((e) => {
            results.failed++;
            failures.push(name);
            console.log(`  ✗ ${name}: ${e.message}`);
        });
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

function run(cmd, env) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', cmd], {
            cwd: ROOT,
            env: { ...process.env, ...(env || {}) },
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let out = '', err = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (err += d));
        child.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
        child.on('error', reject);
        child.stdin.end();
    });
}

function parseJsonOut(out) {
    const start = out.indexOf('{');
    const end = out.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('no JSON in output: ' + out.slice(0, 300));
    return JSON.parse(out.slice(start, end + 1));
}

function lastLine(out) {
    const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
    return lines[lines.length - 1] || '';
}

const consensusPath = path.join(ROOT, 'models/private/vant/state/consensus.json');
const marketPath = path.join(ROOT, 'models/private/vant/state/market.json');

const LJ = JSON.stringify(path.join(ROOT, 'lib/consensus.js'));
const MJ = JSON.stringify(path.join(ROOT, 'lib/market.js'));

// Consensus children: registry-verified votes need an alive peer, and
// state IO flows through the sandbox (grant caps the org.js way).
// useTrustWeight:false keeps minQuorum as an integer headcount — trust
// weighting would make a fresh voter (score 0.5) miss minQuorum 1.
const CHILD_CONSENSUS_WRITE = `
const registry = require(${JSON.stringify(path.join(ROOT, 'lib/node-registry.js'))});
const consensus = require(${LJ});
consensus.clearState ? consensus.clearState() : null;
if (!registry.get('wave3_voter')) {
    registry.register({ id: 'wave3_voter', name: 'wave3-voter', host: 'localhost', port: 4300 });
}
const c1 = consensus.create('wave3-topic', { options: ['alpha', 'beta'], minQuorum: 1, useTrustWeight: false });
if (c1.error) { console.error('CREATE_FAIL:' + JSON.stringify(c1)); process.exit(1); }
const v = consensus.vote('wave3-topic', 'alpha', 'wave3_voter');
if (v.error) { console.error('VOTE_FAIL:' + JSON.stringify(v)); process.exit(1); }
console.log('CONSENSUS_WROTE');
`;

const CHILD_CONSENSUS_READ = `
const consensus = require(${LJ});
const r = consensus.tally('wave3-topic');
const l = consensus.list().find(t => t.topic === 'wave3-topic');
console.log(JSON.stringify({
    found: !!l,
    totalVotes: r.totalVotes,
    leading: r.leading,
    status: r.status,
    hashMatches: consensus.verify('wave3-topic').valid !== false
}));
`;

const CHILD_CONSENSUS_RESOLVE = `
const consensus = require(${LJ});
const r = consensus.resolve('wave3-topic', 'beta');
console.log(r.resolved ? 'RESOLVED' : 'RESOLVE_FAIL:' + JSON.stringify(r));
`;

const CHILD_CONSENSUS_AFTER_RESOLVE = `
const consensus = require(${LJ});
const l = consensus.list().find(t => t.topic === 'wave3-topic');
console.log(JSON.stringify({ status: l ? l.status : null }));
`;

const CHILD_MARKET_WRITE = `
require(${JSON.stringify(path.join(ROOT, 'lib/sandbox.js'))}).defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canTrade: true });
const market = require(${MJ});
market.clearState();
(async () => {
    const listing = await market.list('knowledge', { title: 'wave3 artifact', summary: 'persistence probe', price: 'favor:review', seller: 'aria', supply: 3 }, { agentId: 'aria', consentGiven: true });
    if (listing.error) { console.error('LIST_FAIL:' + JSON.stringify(listing)); process.exit(1); }
    const t = await market.trade(listing.id, 'volt', { buyer: 'volt', price: 'favor:review', consentGiven: true });
    if (t.error) { console.error('TRADE_FAIL:' + JSON.stringify(t)); process.exit(1); }
    const bid = await market.bid('wanted:wave3', { reward: 'knowledge:xyz', bidder: 'juno' }, { agentId: 'juno', consentGiven: true });
    if (bid.error) { console.error('BID_FAIL:' + JSON.stringify(bid)); process.exit(1); }
    console.log('MARKET_WROTE:' + listing.id);
})().catch((e) => { console.error('FATAL:' + e.message); process.exit(1); });
`;

const CHILD_MARKET_READ = `
require(${JSON.stringify(path.join(ROOT, 'lib/sandbox.js'))}).defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canTrade: true });
const market = require(${MJ});
const LISTING_ID = process.env.VANT_W3_LISTING_ID || '';
(async () => {
    const stats = market.stats();
    const listing = market.get(LISTING_ID);
    console.log(JSON.stringify({
        listingFound: !!listing,
        listingTrades: listing ? listing.trades : null,
        listingReserved: listing ? (listing._reserved || 0) : null,
        bidsCount: stats.bids,
        tradesCount: stats.trades,
        searchWorks: (await market.search({ type: 'knowledge' })).some(l => l.id === LISTING_ID)
    }));
})().catch((e) => { console.error('FATAL:' + e.message); process.exit(1); });
`;

const CHILD_INFINITY_ROUNDTRIP = `
const market = require(${MJ});
const listing = market.get('inf_listing_probe');
console.log(JSON.stringify({
    supplyIsInfinity: !!(listing && listing.supply === Infinity),
    notNull: !!(listing && listing.supply !== null)
}));
`;

const LJ2 = null; // (kept: LJ/MJ defined above; child() shim no longer needed)
const child = (tpl) => tpl;

async function main() {
    console.log('\n⚖️  LEDGER PERSISTENCE TESTS (Wave 3)\n');

    // Clean slate
    fs.rmSync(path.join(ROOT, 'models/private/vant/state'), { recursive: true, force: true });

    // ---------- consensus ----------
    await test('consensus: create+vote survive a real process death (tally + hash verify)', async () => {
        const w = await run(child(CHILD_CONSENSUS_WRITE));
        assert(lastLine(w.out) === 'CONSENSUS_WROTE', 'writer failed: ' + w.out + w.err);
        assert(fs.existsSync(consensusPath), 'consensus state file should exist');

        const r = await run(child(CHILD_CONSENSUS_READ)); // cold process
        const d = parseJsonOut(r.out);
        assert(d.found === true, 'ledger should hydrate: ' + r.out + r.err);
        assert(d.totalVotes === 1, 'vote should round-trip, got ' + d.totalVotes);
        assert(d.leading === 'alpha', 'leading alpha, got ' + d.leading);
        assert(d.hashMatches === true, 'ledger hash must verify after restore: ' + r.out + r.err);
    });

    await test('consensus: status transitions persist (resolve → passed on disk)', async () => {
        const r = await run(child(CHILD_CONSENSUS_RESOLVE));
        assert(lastLine(r.out) === 'RESOLVED', 'resolve failed: ' + r.out + r.err);
        const r2 = await run(child(CHILD_CONSENSUS_AFTER_RESOLVE)); // cold process
        const d = parseJsonOut(r2.out);
        assert(d.status === 'passed', 'status should be passed after restart, got ' + r2.out + r2.err);
    });

    // ---------- market ----------
    let listingId = null;
    await test('market: list+bid+trade survive a real process death', async () => {
        const w = await run(child(CHILD_MARKET_WRITE));
        const idLine = w.out.split('\n').find((l) => l.startsWith('MARKET_WROTE:'));
        assert(idLine, 'writer failed: ' + w.out + w.err);
        listingId = idLine.slice('MARKET_WROTE:'.length).trim();
        assert(fs.existsSync(marketPath), 'market state file should exist');

        const r = await run(child(CHILD_MARKET_READ), { VANT_W3_LISTING_ID: listingId });
        const d = parseJsonOut(r.out);
        assert(d.listingFound === true, 'listing should hydrate: ' + r.out + r.err);
        assert(d.listingTrades === 1, 'committed trade should count (supply consumed), got ' + d.listingTrades);
        assert(d.listingReserved === 0, '_reserved must be 0 after restore (no phantom), got ' + d.listingReserved);
        assert(d.bidsCount === 1, 'bid should round-trip, got ' + d.bidsCount);
        assert(d.tradesCount === 1, 'trade should round-trip, got ' + d.tradesCount);
        assert(d.searchWorks === true, 'search index must be rebuilt for restored listings');
    });

    await test('market: supply Infinity round-trips (null on disk ⇄ Infinity in memory)', async () => {
        // Plant a null-supply listing directly on disk (exactly what
        // _serializeListings writes for an Infinity-supply listing), then a
        // fresh process must hydrate it back to Infinity — the scarcity
        // opt-out must not silently become a cap of 1.
        const disk = JSON.parse(fs.readFileSync(marketPath, 'utf8'));
        disk.listings.push({
            id: 'inf_listing_probe', type: 'favor', title: 'infinite',
            summary: 'supply opt-out probe', tags: [], price: null, seller: 'aria',
            supply: null, views: 0, trades: 0, created: Date.now()
        });
        fs.writeFileSync(marketPath, JSON.stringify(disk));

        const r = await run(child(CHILD_INFINITY_ROUNDTRIP));
        const d = parseJsonOut(r.out);
        assert(d.supplyIsInfinity === true, 'null on disk must restore as Infinity, got ' + r.out + r.err);
        assert(d.notNull === true, 'in-memory value must not be null');
    });

    await test('kind marker present on both ledger state files', () => {
        for (const [p, mod] of [[consensusPath, 'consensus'], [marketPath, 'market']]) {
            const disk = JSON.parse(fs.readFileSync(p, 'utf8'));
            assert(disk.kind === 'vant-protocol-state', mod + ' state must carry the kind marker');
            assert(disk.module === mod, mod + ' state module field mismatch');
        }
    });

    // Cleanup
    fs.rmSync(path.join(ROOT, 'models/private/vant/state'), { recursive: true, force: true });

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Ledger persistence: ${results.passed} passed, ${results.failed} failed`);
    if (results.failed > 0) console.log('Failures: ' + failures.join(', '));
    console.log('='.repeat(50));

    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('FATAL:', e.message);
    process.exit(1);
});
