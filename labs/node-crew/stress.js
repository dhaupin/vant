#!/usr/bin/env node
/**
 * Vant Node Crew — Protocol Stress Harness (pass 31, v1.0.0 stability)
 *
 * The crew hunts its own bugs. Every probe is adversarial; failures here
 * are FINDINGS for labs/STABILITY.md, not suite regressions (exit code is
 * always 0 — humans triage, suites pin).
 *
 * Probes:
 *   A. Concurrency — parallel vote blitz (same ledger, real limits),
 *      double-vote, market trade race, msg storm vs QoS, trust race
 *   B. Env matrix — missing password, wrong password, fresh-dir isolation,
 *      missing VANT_REPO_ROOT, strict-sandbox rejection
 *   C. Hostile inputs — traversal/prototype payloads through the chain
 *
 * Run: node labs/node-crew/stress.js
 * Exit: always 0 (findings go to labs/STABILITY.md for triage)
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..');
process.chdir(ROOT);

const findings = [];
function record(severity, id, title, detail, fire = null) {
    findings.push({ id, severity, title, detail, fire });
    const icon = { fire: '🔥', watch: '⚠️ ', ok: '✓', finding: '🔍' }[severity] || '•';
    console.log(`  ${icon} [${id}] ${title}`);
    if (fire) console.log(`      ↳ ${String(fire).slice(0, 140).replace(/\n/g, ' | ')}`);
}

function section(name) {
    console.log(`\n--- ${name} ---`);
}

(async () => {
    console.log('🔥 VANT NODE CREW — STRESS HARNESS (v1.0.0 stability hunt)\n');

    // Shared genesis-style setup (mirrors demo.js)
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    const consensus = require(path.join(ROOT, 'lib', 'consensus'));
    const market = require(path.join(ROOT, 'lib', 'market'));
    const msg = require(path.join(ROOT, 'lib', 'msg'));
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    const governance = require(path.join(ROOT, 'lib', 'governance'));
    const registry = require(path.join(ROOT, 'lib', 'node-registry'));

    sandbox.defaultSandbox.setCapabilities({
        canRead: true, canWrite: true, canSpawn: true, canNetwork: true, canExec: true, canTrade: true
    });
    const VOTERS = ['stress-node-a', 'stress-node-b', 'stress-node-c', 'stress-node-d'];
    for (const v of VOTERS) registry.register({ id: v, name: v, metadata: { role: 'stress' } });

    // =====================================================================
    section('A. CONCURRENCY — parallel protocol races');
    // =====================================================================

    // A1. Vote blitz: 4 nodes × 3 votes each (12 total, 9 must reject) —
    // one-vote-per-agent must hold under parallel load.
    {
        const topic = 'stress-blitz-' + Date.now().toString(36);
        await consensus.create(topic, { options: ['yes', 'no'], minQuorum: 4, threshold: 0.5 });
        const jobs = [];
        for (let i = 0; i < 12; i++) {
            const voter = VOTERS[i % VOTERS.length];
            jobs.push(new Promise((res) => setTimeout(async () => {
                try { res(await consensus.vote(topic, 'yes', voter)); } catch (e) { res({ error: e.message }); }
            }, i * 25)));
        }
        const results = await Promise.all(jobs);
        const tally = consensus.tally(topic);
        const accepted = results.filter((r) => r && !r.error).length;
        const rejected = results.filter((r) => r && r.error).length;
        const doubleVotes = results.filter((r) => r && r.error === 'Already voted').length;
        if (tally.totalVotes === VOTERS.length && rejected === 12 - VOTERS.length &&
            doubleVotes === 12 - VOTERS.length) {
            record('ok', 'A1', 'vote blitz: one-vote-per-agent holds under parallel load',
                `${VOTERS.length} accepted, ${rejected} rejected (${doubleVotes} 'Already voted')`);
        } else {
            record('fire', 'A1', 'vote blitz: ledger integrity broken under parallel load',
                `accepted=${accepted} rejected=${rejected} doubleVotes=${doubleVotes} tally=${JSON.stringify(tally)}`,
                JSON.stringify(results.filter((r) => r.error)).slice(0, 200));
        }
    }

    // A2. Double-vote must report the PREVIOUS outcome (audit trail), not
    // just reject.
    {
        const topic = 'stress-dbl-' + Date.now().toString(36);
        await consensus.create(topic, { options: ['yes', 'no'], minQuorum: 1, threshold: 0.5 });
        await consensus.vote(topic, 'yes', VOTERS[0]);
        const second = await consensus.vote(topic, 'no', VOTERS[0]);
        const ok = second && second.error === 'Already voted' &&
            second.previous !== undefined ? second.previous : null;
        if (second.error === 'Already voted' && ok === 'yes') {
            record('ok', 'A2', 'double-vote reports previous outcome for audit');
        } else if (second.error === 'Already voted') {
            record('finding', 'A2', `double-vote rejected but previous outcome was '${second.previous}' (expected 'yes')`);
        } else {
            record('fire', 'A2', 'double-vote ACCEPTED (ledger integrity broken)', JSON.stringify(second));
        }
    }

    // A3. Market trade race: two buyers, one listing, price 1 — at most one
    // trade should fully succeed (escrow hold is the atomicity mechanism).
    {
        const listing = await market.list('knowledge',
            { title: 'stress-scarse-' + Date.now().toString(36), description: 'one copy only', price: 1, tags: [] },
            { agentId: 'agent-stress-master', consentGiven: true });
        const listingId = listing && !listing.error ? (listing.id || (listing.listing && listing.listing.id)) : null;
        if (!listingId) {
            record('finding', 'A3', 'could not create listing for trade race (escrow/budget gate?)',
                JSON.stringify(listing).slice(0, 120));
        } else {
            const [t1, t2] = await Promise.all([
                market.trade(listingId, 'stress-node-a', { agentId: 'stress-node-a', consentGiven: true }),
                market.trade(listingId, 'stress-node-b', { agentId: 'stress-node-b', consentGiven: true })
            ]);
            const winners = [t1, t2].filter((t) => t && !t.error);
            if (winners.length === 1) {
                record('ok', 'A3', 'trade race: exactly one winner (escrow hold atomic)',
                    `winner: ${winners[0].id}; loser: ${(t1.error || t2.error || '').slice(0, 60)}`);
            } else if (winners.length === 0) {
                record('finding', 'A3', 'trade race: BOTH trades failed (possible false-negative deadlock)',
                    JSON.stringify({ t1: t1.error, t2: t2.error }).slice(0, 160));
            } else {
                record('fire', 'A3', 'trade race: BOTH trades succeeded — scarce listing double-sold',
                    JSON.stringify({ t1: t1.id || t1.error, t2: t2.id || t2.error }));
            }
        }
    }

    // A4. Msg storm vs QoS: 10 rapid posts, same conversation. Rate limit
    // must degrade gracefully (structured errors), never throw.
    {
        const conv = msg.create({ id: 'stress-storm-' + Date.now().toString(36) });
        const convId = conv.id;
        let threw = null;
        const results = [];
        for (let i = 0; i < 10; i++) {
            try {
                const r = msg.post(convId, 'storm ' + i, { author: 'stress-node-a' });
                results.push(r && r.error ? 'limited' : 'ok');
            } catch (e) { threw = e.message; break; }
        }
        if (threw) {
            record('fire', 'A4', 'msg storm: post() THREW instead of structured error', threw);
        } else {
            const okCount = results.filter((r) => r === 'ok').length;
            record('ok', 'A4', 'msg storm degrades gracefully (structured rate-limit errors)',
                `${okCount}/10 landed, ${results.length - okCount} rate-limited, no throw`);
        }
    }

    // A5. Trust race: parallel records for the same agent; score must stay
    // bounded and consistent.
    {
        const before = trust.getScore('stress-race-target');
        await Promise.all(Array.from({ length: 20 }, (_, i) => new Promise((res) => setTimeout(async () => {
            try { trust.record('stress-race-target', 'help', { positive: i % 2 === 0, value: 0.05 }); } catch (e) {}
            res();
        }, i * 10))));
        const after = trust.getScore('stress-race-target');
        if (typeof after === 'number' && after >= 0 && after <= 1) {
            record('ok', 'A5', 'trust race: score stays bounded [0,1] under parallel writes',
                `before=${before} after=${after}`);
        } else {
            record('fire', 'A5', 'trust race: score escaped [0,1] bounds', `after=${after}`);
        }
    }

    // =====================================================================
    section('B. ENV MATRIX — fresh dirs, missing config, hostile env');
    // =====================================================================

    const { execFileSync } = require('child_process');

    // B1. Missing password: horcrux restore must fail with a STRUCTURED
    // error naming the remedy, never a stack trace or hang.
    {
        const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vant-stress-'));
        try {
            const horcrux = path.join(dir, 'no-pw.svg');
            const carrier = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32"/></svg>';
            const stego = require(path.join(ROOT, 'lib', 'stego'));
            fs.writeFileSync(horcrux, stego.encodeSvg('{"type":"vant-horcrux"}', carrier, 'real-secret'));

            let out = '';
            try {
                out = execFileSync('node', [path.join(ROOT, 'bin', 'transform.js'), 'extract', horcrux], {
                    cwd: dir, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe']
                });
            } catch (e) {
                out = ((e.stdout || '') + (e.stderr || '')).slice(0, 400);
                if (/Enter brain password/i.test(out) || e.signal === 'SIGTERM') {
                    record('fire', 'B1', 'horcrux extract without password PROMPTS ON STDIN (hangs CI/cron)',
                        'stdin closed + 20s timeout hit — secret.get("brain") prompts');
                } else {
                    record('ok', 'B1', 'horcrux extract without password fails structured (no prompt)',
                        out.replace(/\n+/g, ' | ').slice(0, 120));
                }
            }
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }

    // B2. Wrong password: structured rejection, no garbage write.
    {
        const stego = require(path.join(ROOT, 'lib', 'stego'));
        const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vant-stress-'));
        try {
            const f = path.join(dir, 'wrong-pw.svg');
            const carrier = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32"/></svg>';
            fs.writeFileSync(f, stego.encodeSvg('{"type":"vant-horcrux","payload":{}}', carrier, 'right'));
            let out = '';
            try {
                out = execFileSync('node', [path.join(ROOT, 'bin', 'transform.js'), 'extract', f, 'WRONG'], {
                    cwd: dir, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe']
                });
                record('finding', 'B2', 'wrong-password extract exited 0 (silent garbage?)',
                    out.replace(/\n+/g, ' | ').slice(0, 120));
            } catch (e) {
                record('ok', 'B2', 'wrong password rejected with non-zero exit',
                    (((e.stdout || '') + (e.stderr || '')).replace(/\n+/g, ' | ')).slice(0, 120));
            }
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }

    // B3. Fresh-dir: `vant horcrux create` from a foreign cwd must not
    // scatter state into cwd (fresh-dir-routing contract, pass 21).
    {
        const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vant-stress-'));
        try {
            let out = '';
            try {
                execFileSync('node', [path.join(ROOT, 'bin', 'vant.js'), 'horcrux', 'create', 'stress-pw'], {
                    cwd: dir, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe']
                });
            } catch (e) {
                out = ((e.stdout || '') + (e.stderr || '')).slice(0, 200);
            }
            const litter = fs.readdirSync(dir).filter((f) => !f.startsWith('vant-stress-'));
            const litterFiles = fs.readdirSync(dir, { withFileTypes: true })
                .filter((d) => d.isFile()).map((d) => d.name);
            if (litterFiles.length === 0) {
                record('ok', 'B3', 'fresh-dir horcrux create: cwd stays clean', litter.length ? '(dirs only)' : '');
            } else {
                record('fire', 'B3', 'fresh-dir horcrux create littered caller cwd', litterFiles.join(', '));
            }
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }

    // B4. Strict sandbox: deny-all must hold for spawn + trade (fail-closed).
    {
        const saved = { ...sandbox.defaultSandbox.capabilities };
        try {
            sandbox.defaultSandbox.setCapabilities({
                canRead: false, canWrite: false, canSpawn: false, canNetwork: false, canExec: false, canTrade: false
            });
            const agents = require(path.join(ROOT, 'lib', 'agents'));
            const spawnRes = agents.spawn({ name: 'stress-denied', role: 'x' });
            const spawnBlocked = spawnRes && spawnRes.error && /sandbox/i.test(spawnRes.error);

            const mkt = await market.list('knowledge',
                { title: 'x', description: 'x', price: 0, tags: [] },
                { agentId: 'agent-stress-master', consentGiven: true });
            const listBlocked = mkt && mkt.error;

            if (spawnBlocked && listBlocked) {
                record('ok', 'B4', 'strict sandbox: spawn + market both fail closed');
            } else {
                record('fire', 'B4', 'strict sandbox LEAK: an operation succeeded under deny-all',
                    JSON.stringify({ spawnBlocked, listBlocked }));
            }
        } finally {
            sandbox.defaultSandbox.setCapabilities(saved);
        }
    }

    // =====================================================================
    section('C. HOSTILE INPUTS — payloads through the security chain');
    // =====================================================================

    // C1. Prototype-pollution brain write.
    {
        const brain = require(path.join(ROOT, 'lib', 'brain'));
        let threw = null;
        try {
            await brain.write('__proto__', 'polluted', 'evil', { brain: 'vant' });
        } catch (e) { threw = e.message; }
        const polluted = ({}).polluted !== undefined || ({}).polluted === 'evil';
        if (!polluted) {
            record('ok', 'C1', 'prototype-pollution brain write contained', threw ? 'rejected: ' + threw.slice(0, 80) : 'accepted harmlessly');
        } else {
            record('fire', 'C1', 'prototype pollution: Object prototype tainted via brain.write', threw || '');
        }
    }

    // C2. Traversal brain names through consensus/registry (charset gate).
    {
        const evil = '../evil';
        const reg = registry.register({ id: evil, name: evil });
        const escaped = fs.existsSync(path.join(ROOT, 'models', 'evil')) ||
            fs.existsSync(path.join(require('os').tmpdir(), 'evil'));
        const topic = 'stress-trav-' + Date.now().toString(36);
        await consensus.create(topic, { options: ['a', 'b'], minQuorum: 1, threshold: 0.5 });
        const voteRes = await consensus.vote(topic, 'a', evil);
        registry.unregister(evil);
        if (!escaped) {
            record('ok', 'C2', 'traversal node id contained (no fs escape)',
                voteRes && voteRes.error ? 'vote rejected: ' + voteRes.error : 'vote accepted (string-ops only, no fs)');
        } else {
            record('fire', 'C2', 'traversal node id escaped to filesystem');
        }
    }

    // =====================================================================
    // REPORT
    // =====================================================================
    console.log('\n=== STRESS FINDINGS ===');
    const counts = { fire: 0, watch: 0, finding: 0, ok: 0 };
    for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
    for (const f of findings) {
        console.log(`  [${f.severity.toUpperCase()}] ${f.id}: ${f.title}`);
    }
    console.log(`\n${counts.fire || 0} fires, ${counts.finding || 0} findings, ${counts.ok || 0} held green`);
    console.log('(exit 0 by design — triage lands in labs/STABILITY.md)');
    process.exit(0);
})().catch((e) => {
    console.error('Harness fatal:', e.message);
    process.exit(0); // even harness crashes are findings, not failures
});
