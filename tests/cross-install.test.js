#!/usr/bin/env node
/**
 * CROSS-INSTALL FEDERATION (pass 386) — two INDEPENDENT vant installs
 *
 * The first real two-install run, pinned. This test builds a HERMETIC peer
 * install (its own lib + its own brain) in a temp dir and runs the real-run
 * harness (labs/mesh/cross-install-real-run.js) against it, then asserts the
 * whole federation: independent boots, the genesis join ceremony across the
 * install boundary, a REMOTE agora ballot on the live wire, and the GAPPED
 * traveler leg (mint -> carry -> advance -> return -> verify) that needs no
 * socket at all.
 *
 * DISCRIMINATING: the gapped leg fails on the pre-pass-386 carriers.js
 * (decode refused the artifact the lane itself emitted), so this test is red
 * without the fix and green with it.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
async function pin(name, fn) {
    try { await fn(); passed++; console.log('  ✓ ' + name); }
    catch (e) { failed++; console.log('  ✗ FAILED: ' + name + ' — ' + (e.message || e)); }
}

function buildPeerInstall() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-peer-'));
    fs.cpSync(path.join(ROOT, 'lib'), path.join(dir, 'lib'), { recursive: true });
    fs.cpSync(path.join(ROOT, 'package.json'), path.join(dir, 'package.json'));
    fs.mkdirSync(path.join(dir, 'models', 'private'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'models', 'public'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'models', 'state.json'),
        JSON.stringify({ stack: ['cairn'], mode: 'single', currentBrain: 'cairn', updated: new Date().toISOString() }, null, 2));
    return dir;
}

function runHarness(peerRoot) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(ROOT, 'labs', 'mesh', 'cross-install-real-run.js')],
            { cwd: ROOT, env: { ...process.env, VANT_PEER_ROOT: peerRoot }, stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '', errout = '';
        child.stdout.on('data', (d) => { out += d.toString(); });
        child.stderr.on('data', (d) => { errout += d.toString(); });
        child.on('close', (code) => resolve({ code, out, errout }));
        child.on('error', reject);
        child.stdin.end();
    });
}

async function main() {
    console.log('\n🌐 CROSS-INSTALL FEDERATION (pass 386)\n');
    const peer = buildPeerInstall();
    try {
        await pin('two independent installs federate: join ceremony + remote ballot + gapped traveler leg (6/6)', async () => {
            const r = await runHarness(peer);
            const tail = r.out.split('\n').filter((l) => l.includes('✓') || l.includes('✗') || l.includes('phases passed')).join('\n');
            if (r.code !== 0) throw new Error('harness exit ' + r.code + '\n' + tail + '\n' + r.errout.slice(0, 300));
            if (!/6\/6 phases passed/.test(r.out)) throw new Error('expected 6/6 phases, got:\n' + tail);
            for (const phase of ['boot INDEPENDENTLY', 'join ceremony ACROSS', 'joint ledger', 'GAPPED leg', 'advances a station', 'verifies continuity']) {
                if (!r.out.includes(phase)) throw new Error('phase missing: ' + phase);
            }
        });
    } finally {
        fs.rmSync(peer, { recursive: true, force: true });
    }

    console.log('\nPassed:  ' + passed + '\nFailed:  ' + failed);
    process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('suite crashed:', e); process.exit(1); });
