#!/usr/bin/env node
/**
 * Cross-process market scarcity tests (pass 100)
 *
 * Live-fire finding: the market's ATOMIC scarcity reserve (pass-31, stress A3)
 * is per-process — `_reserved` is intentionally NOT persisted, and the
 * committed `trades` counter only increments AFTER the escrow awaits. Two
 * processes could therefore each hydrate a supply-1 listing with trades=0,
 * reserve it, and both "sell" it (proven live: double-sell + a persisted
 * counter that desynced to 1 while TWO trade records existed). `_applyMarket`
 * also skips held listings (in-memory wins), so a peer's committed `trades`
 * never reached the other process.
 *
 * Fix (pass 100): `market.trade` holds a per-listing cross-process lock
 * (lib/flock) across reserve→commit and re-reads the committed `trades` from
 * disk under it (`_adoptCommittedTrades`), so peers serialize on a listing.
 *
 * Gated here:
 *   A. two barrier-synced processes trade ONE supply-1 listing → exactly one
 *      succeeds, the other gets "Listing sold out", persisted trades === 1.
 *   B. an open-ended (supply: Infinity) listing is NOT over-serialized — two
 *      concurrent trades both succeed and both trade rows persist.
 *   C. pass 101 lock scope: a scarce trade takes the per-listing flock, an
 *      open-ended trade takes NONE (proven with a flock.withLock spy).
 *   D. pass 101 fail-closed: when the lock cannot be acquired a scarce trade
 *      is REFUSED (E_TRADE_LOCK) instead of proceeding unlocked, and the
 *      buyer's escrow hold is released (no leak).
 *
 * Run: node test/market-crossprocess.test.js
 * (scratch brain qc-market-x wiped before and after)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAIN = 'qc-market-x';
const DIR = path.join(ROOT, 'models', 'private', BRAIN);
const STATE = path.join(DIR, 'state', 'market.json');

const results = { passed: 0, failed: 0 };

function report(name, ok, err) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${err || 'assertion failed'}`); }
}
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; } }
function wipe() { fs.rmSync(DIR, { recursive: true, force: true }); }

function runChild(script) {
    return new Promise((resolve, reject) => {
        const r = spawn(process.execPath, ['-e', script], {
            cwd: ROOT,
            env: { ...process.env, VANT_BRAIN: BRAIN },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let out = '', err = '';
        r.stdout.on('data', (d) => { out += d; });
        r.stderr.on('data', (d) => { err += d; });
        const killer = setTimeout(() => { r.kill('SIGKILL'); }, 30000);
        r.on('close', (code) => {
            clearTimeout(killer);
            if (code === 0) resolve(out);
            else reject(new Error('child exit ' + code + ': ' + (err || out || 'no output')));
        });
    });
}

const PRELUDE = `
const boot = require("./lib/boot");
boot.init({ taskId: "market-x", scopes: ["read", "write", "spawn", "execute"], debug: false });
require("./lib/sandbox").defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true });
const market = require("./lib/market");
`;

// Seed one listing (optionally open-ended) and return its id.
function seedListing(supplyJson) {
    return runChild(PRELUDE + `
(async () => {
    const l = await market.list("knowledge", { title: "x", summary: "x", seller: "sellerX", supply: ${supplyJson}, price: 1 }, { agentId: "sellerX", consentGiven: true });
    if (!l || !l.id) throw new Error("seed failed: " + JSON.stringify(l));
    console.log("LISTING=" + l.id);
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`);
}

function trader(id, buyer, start) {
    return PRELUDE + `
const S = ${start};
(async () => {
    while (Date.now() < S) {}
    const r = await market.trade(${JSON.stringify(id)}, ${JSON.stringify(buyer)}, { agentId: ${JSON.stringify(buyer)}, consentGiven: true });
    console.log(r && r.error ? ("ERR:" + r.error) : ("OK:" + r.id));
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`;
}

(async () => {
    console.log('\n🏷  CROSS-PROCESS MARKET SCARCITY TESTS (pass 100)\n');

    // ============================================
    // GATE A — supply-1 listing is not oversold
    // ============================================
    try {
        wipe();
        const id = ((await seedListing('1')).match(/LISTING=(\S+)/) || [])[1];
        const start = Date.now() + 1500;
        const outs = await Promise.all([runChild(trader(id, 'buyerP', start)), runChild(trader(id, 'buyerQ', start))]);
        const okCount = outs.filter((o) => /OK:/.test(o)).length;
        const disk = readJson(STATE);
        const listing = (disk.listings || []).find((l) => l.id === id);
        report('supply-1 listing: exactly ONE of two concurrent trades succeeds (was 2 pre-fix)',
            okCount === 1,
            `succeeded=${okCount} outputs=${outs.map((o) => o.trim()).join(' | ')}`);
        report('persisted counter matches reality (trades === 1, one trade record)',
            listing && listing.trades === 1 && (disk.trades || []).length === 1,
            `trades=${listing && listing.trades} records=${(disk.trades || []).length}`);
    } catch (e) {
        report('gate A (scarcity oversell)', false, e.message);
    }

    // ============================================
    // GATE B — open-ended listings are not over-serialized
    // ============================================
    try {
        wipe();
        const id = ((await seedListing('Infinity')).match(/LISTING=(\S+)/) || [])[1];
        const start = Date.now() + 1500;
        const outs = await Promise.all([runChild(trader(id, 'buyerP', start)), runChild(trader(id, 'buyerQ', start))]);
        const okCount = outs.filter((o) => /OK:/.test(o)).length;
        const listing = (readJson(STATE).listings || []).find((l) => l.id === id);
        // (pass 101) Open-ended listings no longer take the per-listing lock,
        // so the exact cross-process `trades` counter is now a best-effort
        // stat (each process increments its hydrated copy; persist merges
        // rows). The guarantees that remain: BOTH buyers succeed (no
        // over-serialization) and BOTH trade rows are persisted.
        const records = (readJson(STATE).trades || []).length;
        report('open-ended listing: two concurrent trades both succeed (no over-serialization)',
            okCount === 2 && records === 2,
            `succeeded=${okCount} records=${records}`);
        report('open-ended listing: counter reflects committed sales (>= 1)',
            listing && listing.trades >= 1,
            `trades=${listing && listing.trades}`);
    } catch (e) {
        report('gate B (open-ended trades)', false, e.message);
    }

    // ============================================
    // GATE C — lock scope: scarce locks, open-ended does not
    // ============================================
    const SPY_HEAD = `
const boot = require("./lib/boot");
boot.init({ taskId: "market-c", scopes: ["read", "write", "spawn", "execute"], debug: false });
require("./lib/sandbox").defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true });
const flock = require("./lib/flock");
let calls = 0; const _orig = flock.withLock;
flock.withLock = (...a) => { calls++; return _orig(...a); };
const market = require("./lib/market");
`;
    const spyTrade = (supplyJson) => SPY_HEAD + `
(async () => {
    const l = await market.list("knowledge", { title: "x", summary: "x", seller: "sellerX", supply: ${supplyJson}, price: 1 }, { agentId: "sellerX", consentGiven: true });
    const r = await market.trade(l.id, "buyerC", { agentId: "buyerC", consentGiven: true });
    console.log("CALLS=" + calls + " RESULT=" + (r && r.error ? ("ERR:" + r.error) : ("OK:" + r.id)));
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`;
    try {
        wipe();
        const scarceOut = await runChild(spyTrade('1'));
        report('scarce listing takes exactly one per-listing flock',
            /CALLS=1\b/.test(scarceOut) && /RESULT=OK:/.test(scarceOut), scarceOut.trim());

        wipe();
        const openOut = await runChild(spyTrade('Infinity'));
        report('open-ended listing takes NO per-listing flock (over-serialization removed)',
            /CALLS=0\b/.test(openOut) && /RESULT=OK:/.test(openOut), openOut.trim());
    } catch (e) {
        report('gate C (lock scope)', false, e.message);
    }

    // ============================================
    // GATE D — lock unavailable → fail closed + release the hold
    // ============================================
    try {
        wipe();
        const out = await runChild(`
const boot = require("./lib/boot");
boot.init({ taskId: "market-d", scopes: ["read", "write", "spawn", "execute"], debug: false });
require("./lib/sandbox").defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true });
const flock = require("./lib/flock");
flock.withLock = (p, fn) => fn(false);   // simulate lock acquisition failure
const market = require("./lib/market");
const escrow = require("./lib/escrow");
(async () => {
    const l = await market.list("knowledge", { title: "x", summary: "x", seller: "sellerX", supply: 1, price: 1 }, { agentId: "sellerX", consentGiven: true });
    const r = await market.trade(l.id, "buyerD", { agentId: "buyerD", consentGiven: true });
    const holdLeft = escrow.checkHold("trade:" + l.id + ":buyerD").held;
    console.log("CODE=" + (r && r.code) + " ERR=" + (r && r.error) + " HOLD_LEFT=" + holdLeft);
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`);
        report('lock-unavailable scarce trade FAILS CLOSED (no unlocked double-sell)',
            /CODE=E_TRADE_LOCK/.test(out), out.trim());
        report('lock-unavailable refusal releases the buyer hold (no escrow leak)',
            /HOLD_LEFT=false/.test(out), out.trim());
    } catch (e) {
        report('gate D (fail-closed)', false, e.message);
    }

    console.log(`\n${results.passed} passed, ${results.failed} failed`);
    wipe();
    process.exit(results.failed > 0 ? 1 : 0);
})().catch((e) => {
    console.error('fatal:', e.message);
    wipe();
    process.exit(1);
});
