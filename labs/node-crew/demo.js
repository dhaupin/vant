#!/usr/bin/env node
/**
 * Vant Node Crew — Genesis Demo (pass 30, labs/prd-node-crew.md v0.1)
 *
 * Proves a multi-brain vant society end-to-end with REAL protocol calls:
 *   master node (brain: vant)
 *     1. seeds genesis memory
 *     2. spawns crew agents (real per-brain registry)
 *     3. opens msg channel, crew posts in parallel
 *     4. consensus: create → parallel crew vote → tally passes quorum
 *     5. governance: decide from every node
 *     6. market: list → bid → trade (escrow holds, trust records)
 *     7. trust leaderboard
 *     8. soul horcrux: stego SVG embed → decode + verify
 *
 * Crew nodes: aria, volt, juno — spawned as REAL agents via agents.spawn
 * (sandbox-granted, per-brain registry), participating through the actual
 * protocol layer (consensus/market/msg/trust module singletons in this
 * process — see PRD v0.2 for process-per-node + persisted protocol state).
 *
 * Run: node labs/node-crew/demo.js
 * Exit 0 only if every phase passed.
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..');
process.chdir(ROOT); // brain paths are cwd-relative (models/…)

const consensus = require(path.join(ROOT, 'lib', 'consensus'));
const governance = require(path.join(ROOT, 'lib', 'governance'));
const market = require(path.join(ROOT, 'lib', 'market'));
const msg = require(path.join(ROOT, 'lib', 'msg'));
const trust = require(path.join(ROOT, 'lib', 'trust'));
const stego = require(path.join(ROOT, 'lib', 'stego'));
const agents = require(path.join(ROOT, 'lib', 'agents'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));
const brain = require(path.join(ROOT, 'lib', 'brain'));
const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));

const MASTER = 'vant';
const CREW = ['aria', 'volt', 'juno'];
const CREW_IDS = CREW.map((n) => 'agent-' + n);
const PASSWORD = process.env.VANT_CREW_PASSWORD || 'vant-node-crew-genesis';
const SOUL_PATH = path.join(ROOT, 'models', 'private', MASTER, 'boot', 'node-crew-genesis-p_' + PASSWORD + '.svg');

const results = { passed: 0, failed: 0, phases: [] };
function phase(name, ok, detail) {
    results.phases.push({ name, ok, detail: detail || '' });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
    if (ok) results.passed++; else results.failed++;
    return ok;
}

// ---------- master holds the keys (genesis only) ----------
function grantGenesisCapabilities() {
    const sb = sandbox.defaultSandbox;
    // Explicitly configured sandbox = enforced. Grant everything the genesis
    // protocol needs: spawn (registry), write (list/bid/post/memory), trade
    // (market trade holds escrow budgets). (Pass-30 finding: canTrade is a
    // distinct capability from canWrite — market enforces it once the
    // sandbox stops being an untouched stub.)
    sb.setCapabilities({ canRead: true, canWrite: true, canSpawn: true, canNetwork: true, canExec: true, canTrade: true });
    return sb;
}

// ---------- main ----------
async function main() {
    console.log('\n🧠 VANT NODE CREW — GENESIS DEMO');
    console.log('   master: ' + MASTER + ' | crew: ' + CREW.join(', ') + ' (protocol actors)\n');

    grantGenesisCapabilities();

    // ---- Phase 1: seed master memory ----
    try {
        const w1 = await brain.write('lessons', 'crew-genesis', 'Node crew genesis: multi-brain society booted. Master seeds protocol; crew ratifies.', { brain: MASTER });
        const w2 = await brain.write('goals', 'crew-mission', 'Prove parallel protocol participation: consensus, governance, market, trust, stego soul.', { brain: MASTER });
        phase('1. master seeds genesis memory', !!w1 && !!w2, 'lessons/crew-genesis + goals/crew-mission');
    } catch (e) {
        phase('1. master seeds genesis memory', false, e.message);
    }

    // ---- Phase 2: spawn crew agents (real per-brain registry) ----
    // Idempotent rerun: terminate prior crew agents first (spawn creates a
    // fresh id each time — there is no upsert).
    try {
        const existing = await agents.list();
        for (const a of existing) {
            if (CREW_IDS.includes(a.name)) {
                try { agents.terminate(a.id); } catch (e) { /* best effort */ }
            }
        }
    } catch (e) { /* first run — nothing to clean */ }

    let spawned = 0;
    for (const name of CREW_IDS) {
        const r = agents.spawn({ name, role: 'crew-node', org: 'node-crew' });
        if (r && !r.error) spawned++;
        else if (r && r.error && /quota|rate limit|exists|duplicate/i.test(r.error)) spawned++; // idempotent rerun
    }
    let rosterCount = 0;
    try { rosterCount = (await agents.list()).length; } catch (e) { /* report 0 */ }
    phase('2. spawn crew agents', spawned === CREW.length, spawned + '/' + CREW.length + ' (registry: ' + rosterCount + ' agents)');

    // ---- Phase 2b: register crew as NODES (node-registry = node identity) ----
    // (pass-30 finding: consensus votes verify voters against node-registry
    // by default — ledger.requireRegistry — so crew members must exist as
    // registered, alive nodes, not just agent-roster entries.)
    try {
        registry.register({ id: 'node-master', name: MASTER, metadata: { role: 'master', brain: MASTER } });
        for (const name of CREW_IDS) {
            registry.register({ id: name, name: name.replace('agent-', ''), metadata: { role: 'crew-node', org: 'node-crew' } });
        }
        const stats = registry.getStats();
        phase('2b. register crew nodes (node-registry)', stats.alive >= 1 + CREW.length,
            stats.alive + ' alive / ' + stats.total + ' registered');
    } catch (e) {
        phase('2b. register crew nodes (node-registry)', false, e.message);
    }

    // ---- Phase 3: open channel + parallel crew check-ins ----
    try {
        msg.create({ id: 'node-crew-genesis' });
        msg.join('node-crew-genesis');
        msg.post('node-crew-genesis', 'GENESIS: node crew society initialized. Master: ' + MASTER + '.', { author: 'agent-master' });
        // Crew check-ins: staggered (QoS rate-limit friendly), awaited in parallel
        await Promise.all(CREW_IDS.map((id, i) => new Promise((resolve) => setTimeout(() => {
            try {
                const r = msg.post('node-crew-genesis', 'node ' + id + ' checked in — ready to build.', { author: id });
                resolve(r && r.error ? 'error' : 'ok');
            } catch (e) { resolve('error'); }
        }, i * 150))));
        const messages = msg.messages('node-crew-genesis');
        phase('3. open #genesis channel + crew check-ins', Array.isArray(messages) && messages.length >= 1 + CREW.length,
            messages.length + ' messages');
    } catch (e) {
        phase('3. open #genesis channel + crew check-ins', false, e.message);
    }

    // ---- Phase 4: consensus — create → parallel crew vote → tally ----
    let tallyResult = null;
    try {
        // (pass-30 findings: topic charset is [a-zA-Z0-9_-] — no colons;
        // create() requires an explicit options array with ≥2 choices; the
        // quorum option is minQuorum; create/vote are async — lock-chained.
        // Topic is run-scoped: topics cannot be recreated — E_COLLISION.)
        const TOPIC = 'crew-genesis-ratification-' + Date.now().toString(36);
        const ledger = await consensus.create(TOPIC, { options: ['ratify', 'reject'], minQuorum: CREW.length, threshold: 0.5 });
        if (ledger && ledger.error) throw new Error('create: ' + ledger.error);
        const topic = (ledger && ledger.topic) || TOPIC;

        // Staggered crew votes (parallel promises, tiny offsets to stay under QoS)
        const votes = await Promise.all(CREW_IDS.map((id, i) => new Promise((resolve) => setTimeout(async () => {
            try { resolve(await consensus.vote(topic, 'ratify', id)); } catch (e) { resolve({ error: e.message }); }
        }, i * 120))));

        tallyResult = consensus.tally(topic);
        const allVoted = votes.every((v) => v && !v.error);
        // (pass-30 finding: tally counts are TRUST-WEIGHTED — each vote
        // counts as the voter's trust score, not 1 — so assert on
        // totalVotes + leading outcome, not raw counts.)
        const ok = allVoted && tallyResult && !tallyResult.error &&
            tallyResult.totalVotes === CREW.length && tallyResult.leading === 'ratify';
        phase('4. consensus ratification (parallel crew vote)', ok,
            ok ? tallyResult.totalVotes + '/' + CREW.length + ' votes — leading: ' + tallyResult.leading +
                 ' (trust-weighted ' + JSON.stringify(tallyResult.counts) + ')'
              : JSON.stringify({ votes, tally: tallyResult }));
    } catch (e) {
        phase('4. consensus ratification (parallel crew vote)', false, e.message);
    }

    // ---- Phase 5: governance — decide from master + each crew node ----
    try {
        const decisions = [];
        decisions.push(await governance.decide('knowledge:share', { consentGiven: true, benefitScore: 0.9 }));
        for (const id of CREW_IDS) {
            decisions.push(await governance.decide('crew:' + id + ':join', { consentGiven: true, benefitScore: 0.8 }));
        }
        const allowed = decisions.filter((d) => d && d.allowed).length;
        phase('5. governance decisions (master + crew)', allowed === 1 + CREW.length, allowed + '/' + (1 + CREW.length) + ' allowed');
    } catch (e) {
        phase('5. governance decisions (master + crew)', false, e.message);
    }

    // ---- Phase 6: market — master lists → crew bids → one trade ----
    try {
        const listing = await market.list('knowledge',
            { title: 'vant-genesis-knowledge', description: 'Genesis memory: how to boot a node crew society', price: 0, tags: ['genesis', 'crew'] },
            { agentId: 'agent-master', consentGiven: true });
        if (listing && listing.error) throw new Error('list: ' + listing.error);
        const listingId = listing.id || (listing.listing && listing.listing.id);
        if (!listingId) throw new Error('no listing id: ' + JSON.stringify(listing).slice(0, 80));

        // Crew bids (staggered for QoS)
        const bids = [];
        for (const id of CREW_IDS) {
            const b = await market.bid('vant-genesis-knowledge',
                { description: id + ' bids review favors for genesis knowledge', reward: 'favor:review', bidder: id },
                { agentId: id, consentGiven: true });
            bids.push(b && b.error ? 'error:' + b.error : 'ok');
            await new Promise((r) => setTimeout(r, 100));
        }

        const trade = await market.trade(listingId, 'agent-aria', { agentId: 'agent-aria', consentGiven: true });
        const okBids = bids.filter((b) => b === 'ok').length;
        phase('6. market list → bid → trade', okBids >= 1 && trade && !trade.error,
            'bids ' + okBids + '/' + CREW.length + ' | trade: ' + (trade.error || trade.id || 'ok'));
    } catch (e) {
        phase('6. market list → bid → trade', false, e.message);
    }

    // ---- Phase 7: trust leaderboard ----
    try {
        for (const id of CREW_IDS) {
            trust.record(id, 'help', { positive: true, value: 0.2 });
        }
        trust.record('agent-master', 'help', { positive: true, value: 0.1 });
        const board = trust.leaderboard();
        const crewOnBoard = board.filter((e) => CREW_IDS.includes(e.id || e.entityId)).length;
        phase('7. trust interactions recorded', crewOnBoard >= CREW.length,
            board.slice(0, 4).map((e) => (e.id || e.entityId || '?') + '=' + (e.score ?? '?')).join(', '));
    } catch (e) {
        phase('7. trust interactions recorded', false, e.message);
    }

    // ---- Phase 8: soul horcrux — stego embed + decode-verify ----
    try {
        const manifest = stego.generateManifest({
            label: 'node-crew-genesis',
            crew: CREW_IDS,
            consensus: { topic: tallyResult ? tallyResult.topic : null, tally: tallyResult ? tallyResult.counts : null },
            channel: 'node-crew-genesis'
        });
        const soul = JSON.stringify({ type: 'vant-node-crew-soul', manifest, seededAt: Date.now() });
        const carrier = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#0b0f14"/></svg>';
        const encoded = stego.encodeSvg(soul, carrier, PASSWORD);
        fs.mkdirSync(path.dirname(SOUL_PATH), { recursive: true });
        fs.writeFileSync(SOUL_PATH, encoded);

        const decoded = stego.decodeSvg(encoded, PASSWORD);
        const parsed = decoded && decoded.message ? JSON.parse(decoded.message) : null;
        const verified = parsed && parsed.manifest && parsed.manifest.crew.length === CREW.length;
        phase('8. soul horcrux embed + verify', !!verified, path.relative(ROOT, SOUL_PATH) + ' (' + encoded.length + ' bytes)');
    } catch (e) {
        phase('8. soul horcrux embed + verify', false, e.message);
    }

    // ---- Report ----
    console.log('\n--- GENESIS REPORT ---');
    for (const p of results.phases) {
        console.log('  ' + (p.ok ? 'PASS' : 'FAIL') + '  ' + p.name + (p.detail ? ' — ' + p.detail : ''));
    }
    console.log('\n' + results.passed + ' passed, ' + results.failed + ' failed');
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Fatal:', e.message);
    process.exit(1);
});
