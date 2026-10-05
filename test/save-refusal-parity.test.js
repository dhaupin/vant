#!/usr/bin/env node
/**
 * Save-refusal parity gates (pass 116)
 *
 * Pass 115 fixed teams' LYING SUCCESS (create* reported success while
 * _saveTeams was fail-closed refused). This file extends the same contract
 * to the rest of the §8.5 (a)-guarded writers: when the lock cannot be
 * taken, the CALLER must see an honest refusal — never a success that
 * would vanish on restart (or, for auth/vaf, silently unlock an attacker).
 *
 * Findings fixed here (all proven by these gates):
 *   - auth._saveLockedAuth discarded withLock's abort entirely (not even
 *     logged); recordFailedAttempt reported {locked:true} while the
 *     brute-force lockout was memory-only. NOW: {persisted:false,
 *     code:'E_SAVE_REFUSED'}.
 *   - vaf._saveBlockedIPs: same shape; recordFailedAttempt was void.
 *     NOW returns {count, blocked, persisted, code?}.
 *   - mcp brain_share returned {shared:true} on refusal with the insight
 *     written NOWHERE. NOW returns {error, code:'E_SAVE_REFUSED'} and the
 *     insights file is byte-identical (the body never runs on refusal).
 *   - agents._saveAgents resolved undefined on abort AND cleared _dirty,
 *     killing the flush()/beforeExit retry path. NOW it resolves
 *     {ok,reason,aborted}, keeps _dirty, and terminate/prune/restoreState
 *     surface {persisted:false, code:'E_SAVE_REFUSED'}.
 *   - Already honest at pass 111 (re-pinned here for parity): config
 *     (false), citations (null), habitat (null), state-store (false —
 *     gated in lock-failclosed).
 *
 * Technique: lock-failclosed's broken-root (pass 110) — a regular FILE at
 * a lock root makes every acquire() fail with 'unavailable' instantly, so
 * the real filesystem failure path is exercised natively, nothing stubbed.
 * Isolation: VANT_REPO_ROOT -> tmp (auth/vaf circuit files), VANT_BRAIN ->
 * qc-parity (brain-scoped stores + locks). The global lock root
 * (models/.locks-global) is broken/restored in a finally, as the pass-111
 * snapshot-guard gates already do. (scratch brain qc-parity, wiped)
 */

process.env.VANT_BRAIN = 'qc-parity';
const os = require('os');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-parity-'));
process.env.VANT_REPO_ROOT = TMP; // auth/vaf circuit files land here

const BRAIN = path.join(ROOT, 'models', 'private', 'qc-parity');
const GLOBAL_ROOT = path.join(ROOT, 'models', '.locks-global');
const BRAIN_ROOT = path.join(BRAIN, '.locks');
fs.rmSync(BRAIN, { recursive: true, force: true });

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

const results = { passed: 0, failed: 0 };
function report(name, ok, err) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${err || 'assertion failed'}`); }
}
function breakRoot(root) {
    fs.rmSync(root, { recursive: true, force: true });
    fs.writeFileSync(root, 'not a directory');
}
function fixRoot(root) {
    fs.rmSync(root, { recursive: true, force: true });
}
const refusal = (r) => !!(r && r.code === 'E_SAVE_REFUSED' && r.persisted === false);

console.log('\n🚫 SAVE-REFUSAL PARITY GATES (pass 116)\n');

(async () => {
    // ============================================
    // GATE 1 — auth: a brute-force LOCKOUT must confess it is memory-only
    // ============================================
    try {
        const { Auth } = require(path.join(ROOT, 'lib', 'auth'));
        breakRoot(GLOBAL_ROOT);
        let r2, file;
        try {
            const a = new Auth({ maxAttempts: 2, lockoutDuration: 60000 });
            const r1 = a.recordFailedAttempt('attacker-one'); // count 1 → no lockout yet
            r2 = a.recordFailedAttempt('attacker-one');       // count 2 → LOCKOUT + save
            file = path.join(TMP, '.circuit-auth.json');
            report('auth gate: attempt 1 increments without a lockout (its save is refused too)',
                r1 && r1.locked === false && refusal(r1), JSON.stringify(r1));
        } finally {
            fixRoot(GLOBAL_ROOT);
        }
        report('auth gate: lockout refusal surfaced (persisted:false + E_SAVE_REFUSED)',
            refusal(r2) && r2.locked === true && r2.until > 0, JSON.stringify(r2));
        report('auth gate: nothing written under a refused save',
            !fs.existsSync(file), file + ' exists');
        // Honest success path after the root is restored.
        const a2 = new Auth({ maxAttempts: 2, lockoutDuration: 60000 });
        a2.recordFailedAttempt('attacker-two');
        const r4 = a2.recordFailedAttempt('attacker-two');
        report('auth gate: restored root → lockout persists (persisted:true, file written)',
            r4.locked === true && r4.persisted === true && fs.existsSync(file), JSON.stringify(r4));
    } catch (e) {
        report('gate 1 (auth lockout parity)', false, e.message);
    }

    // ============================================
    // GATE 2 — vaf: an attacker BLOCK must confess it is memory-only
    // ============================================
    try {
        const vaf = require(path.join(ROOT, 'lib', 'vaf'));
        breakRoot(GLOBAL_ROOT);
        let refused = null;
        try {
            for (let i = 0; i < 6; i++) refused = vaf.recordFailedAttempt('203.0.113.9', 'parity');
        } finally {
            fixRoot(GLOBAL_ROOT);
        }
        report('vaf gate: block refusal surfaced (persisted:false + E_SAVE_REFUSED)',
            refusal(refused) && refused.blocked === true && refused.count === 6, JSON.stringify(refused));
        const okPath = path.join(TMP, '.circuit-vaf.json');
        let ok = null;
        for (let i = 0; i < 6; i++) ok = vaf.recordFailedAttempt('198.51.100.7', 'parity');
        report('vaf gate: restored root → block persists (persisted:true, file written)',
            ok.blocked === true && ok.persisted === true && fs.existsSync(okPath), JSON.stringify(ok));
    } catch (e) {
        report('gate 2 (vaf blocklist parity)', false, e.message);
    }

    // ============================================
    // GATE 3 — mcp brain_share: {shared:true} must mean the row LANDED
    // ============================================
    try {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const insights = path.join(ROOT, 'models', 'public', 'insights.json');
        const before = fs.existsSync(insights) ? fs.readFileSync(insights) : null;
        breakRoot(GLOBAL_ROOT);
        let res;
        try {
            res = await mcp.execute('brain_share', { insight: 'parity refusal probe ' + Date.now(), source: 'parity-test' });
        } finally {
            fixRoot(GLOBAL_ROOT);
        }
        const after = fs.existsSync(insights) ? fs.readFileSync(insights) : null;
        report('mcp gate: brain_share refusal surfaced (E_SAVE_REFUSED, no shared:true)',
            res && res.code === 'E_SAVE_REFUSED' && !res.shared, JSON.stringify(res).slice(0, 120));
        report('mcp gate: insights.json byte-identical under a refused save (body never ran)',
            Buffer.compare(before || Buffer.alloc(0), after || Buffer.alloc(0)) === 0,
            'insights.json changed');
    } catch (e) {
        report('gate 3 (mcp insights parity)', false, e.message);
    }

    // ============================================
    // GATE 4 — agents: refusal surfaces AND the retry path stays alive
    // ============================================
    try {
        const agents = require(path.join(ROOT, 'lib', 'agents'));
        breakRoot(BRAIN_ROOT);
        let res, roster;
        try {
            res = await agents.restoreState({ agents: [{ id: 'agent_parity1', name: 'ParityAgent', role: 'Tester', state: 'idle', created: Date.now() }] });
        } finally {
            fixRoot(BRAIN_ROOT);
        }
        roster = path.join(BRAIN, 'orgchart', 'agents.json'); // _getAgentStorePath
        report('agents gate: restoreState refusal surfaced (persisted:false + E_SAVE_REFUSED)',
            res && res.restored === 1 && refusal(res), JSON.stringify(res));
        report('agents gate: roster file absent under a refused save',
            !fs.existsSync(roster), roster + ' exists');
        // (pass 116 core fix) _dirty survived the abort, so flush() RETRIES
        // the refused save once the root works again.
        const drained = await agents.flush();
        const disk = fs.existsSync(roster) ? JSON.parse(fs.readFileSync(roster, 'utf8')) : [];
        report('agents gate: flush() retries the refused save (roster lands)',
            drained && drained.ok !== false && Array.isArray(disk)
                && disk.some(e => Array.isArray(e) && e[0] === 'agent_parity1'),
            'flush=' + JSON.stringify(drained) + ' disk=' + JSON.stringify(disk).slice(0, 80));
        // terminate honours the same contract (agent exists on disk now).
        breakRoot(BRAIN_ROOT);
        let t;
        try { t = await agents.terminate('agent_parity1'); } finally { fixRoot(BRAIN_ROOT); }
        report('agents gate: terminate surfaces a refused roster save',
            t && t.terminated === true && refusal(t), JSON.stringify(t));
        const drained2 = await agents.flush();
        const disk2 = fs.existsSync(roster) ? JSON.parse(fs.readFileSync(roster, 'utf8')) : [];
        report('agents gate: flush() retries the terminate save (roster clean)',
            drained2 && drained2.ok !== false && !disk2.some(e => Array.isArray(e) && e[0] === 'agent_parity1'),
            'flush=' + JSON.stringify(drained2) + ' disk=' + JSON.stringify(disk2).slice(0, 80));
    } catch (e) {
        report('gate 4 (agents parity)', false, e.message);
    }

    // ============================================
    // GATE 5 — parity rows: the already-honest APIs stay honest
    // ============================================
    try {
        const config = require(path.join(ROOT, 'lib', 'config'));
        const citations = require(path.join(ROOT, 'lib', 'citations'));
        const Habitat = require(path.join(ROOT, 'lib', 'habitat'));
        breakRoot(BRAIN_ROOT);
        let cfg = null, cite = null, hab = null;
        try {
            cfg = config.saveBrainConfig('qc-parity', { parity: 1 });
            cite = citations.addSource('deadbeefcafe0123', 'parity probe');
            const h = new Habitat({ persistence: { recall: async () => null, state: async () => {} } });
            hab = await h.save();
        } finally {
            fixRoot(BRAIN_ROOT);
        }
        report('parity: config.saveBrainConfig → false under a refused save', cfg === false, JSON.stringify(cfg));
        report('parity: citations.addSource → null under a refused save', cite === null, JSON.stringify(cite));
        report('parity: habitat.save → null under a refused save', hab === null, JSON.stringify(hab));
    } catch (e) {
        report('gate 5 (parity rows)', false, e.message);
    }

    // ============================================
    // Summary
    // ============================================
    fs.rmSync(BRAIN, { recursive: true, force: true });
    fs.rmSync(TMP, { recursive: true, force: true });

    console.log(`\n--- RESULTS ---\n`);
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})().catch(e => {
    console.error('fatal:', e.message);
    fs.rmSync(BRAIN, { recursive: true, force: true });
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(1);
});
