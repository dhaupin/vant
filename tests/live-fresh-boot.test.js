#!/usr/bin/env node
/**
 * Live Fresh-Boot Tests (pass 93)
 *
 * The standing version of the pass-93 live fire: boot a FRESH brain from
 * zero and drive it through the real CLI + MCP surfaces. This is the class
 * of testing the component suites cannot do — it caught three fresh-boot
 * bugs in its first run:
 *   1. seed seam: `VANT_BRAIN=x vant start` resolved the brain name from
 *      models/state.json stack[0] only, found the DEFAULT brain populated,
 *      and never seeded the env brain (no identity/goals/lessons forever).
 *   2. spawn binding: agents spawned under an env brain were FIELD-bound
 *      to 'vant' (Brain.currentBrain ignores VANT_BRAIN) while their
 *      roster landed in the env brain.
 *   3. summary stub: bin/summary.js returned a canned placeholder pinned
 *      by test-all; --json was parsed from argv.slice(3) and never fired.
 *
 * ISOLATION: scratch brain (VANT_BRAIN), fixed p93-* names, spawned child
 * MCP server on an OS-assigned free loopback port.
 */

const SCRATCH_BRAIN = 'p93-live-fresh';
process.env.VANT_BRAIN = SCRATCH_BRAIN;

const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BRAIN_DIR = path.join(ROOT, 'models', 'private', SCRATCH_BRAIN);
const results = { passed: 0, failed: 0 };

async function test(name, fn) {
    try {
        const ok = await fn();
        if (ok === false) throw new Error('assertion failed');
        results.passed++;
        console.log(`  \u2713 ${name}`);
    } catch (e) {
        results.failed++;
        console.log(`  \u2717 ${name}: ${e.message}`);
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

function vant(args, extraEnv = {}) {
    return spawnSync(process.execPath, [path.join(ROOT, 'bin', 'vant.js'), ...args], {
        cwd: ROOT, encoding: 'utf8', timeout: 30000,
        env: Object.assign({}, process.env, extraEnv)
    });
}

const freePort = () => new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
        const p = srv.address().port;
        srv.close(() => resolve(p));
    });
    srv.on('error', reject);
});

async function main() {
    console.log('\n\ud83d\udd25 LIVE FRESH-BOOT TESTS (pass 93)\n');
    console.log('  (scratch brain: ' + SCRATCH_BRAIN + ')');

    // Clean slate: the whole point is booting from ZERO.
    fs.rmSync(BRAIN_DIR, { recursive: true, force: true });

    // ---------- 1. fresh boot seeds the ENV brain (seed seam) ----------
    await test('vant start on a fresh VANT_BRAIN seeds identity/goals/lessons in THAT brain', () => {
        const r = vant(['start']);
        if (r.status !== 0) throw new Error('start exited ' + r.status + ': ' + (r.stderr || '').slice(-200));
        assert(fs.existsSync(path.join(BRAIN_DIR, 'identity.md')), 'identity.md not seeded in the env brain (seed seam regression)');
        assert(fs.existsSync(path.join(BRAIN_DIR, 'goals.md')), 'goals.md not seeded');
        assert(fs.existsSync(path.join(BRAIN_DIR, 'lessons.md')), 'lessons.md not seeded');
        return true;
    });

    await test('health reports the env brain as initialized (no scaffold-skip)', () => {
        const r = vant(['health']);
        const out = (r.stdout || '') + (r.stderr || '');
        assert(out.includes(SCRATCH_BRAIN), 'health did not target the env brain');
        assert(!/scaffold skipped/.test(out), 'health still reports scaffold skipped: ' + out.slice(-200));
        return true;
    });

    // ---------- 2. env-brain agent + org binding ----------
    await test('org demo: agent record is FIELD-bound to the env brain (spawn seam)', () => {
        const r = vant(['org', 'demo']);
        if (r.status !== 0) throw new Error('org demo exited ' + r.status + ': ' + ((r.stdout || '') + (r.stderr || '')).slice(-200));
        const agentsFile = path.join(BRAIN_DIR, 'orgchart', 'agents.json');
        assert(fs.existsSync(agentsFile), 'agents.json not persisted in the env brain orgchart');
        const raw = JSON.parse(fs.readFileSync(agentsFile, 'utf8'));
        // Shape: agents.json is a serialized Map — [ [id, agent], ... ]
        const entries = Array.isArray(raw) ? raw : Object.entries(raw);
        const first = entries[0] && (Array.isArray(entries[0]) ? entries[0][1] : entries[0]);
        assert(first && first.brain === SCRATCH_BRAIN,
            'agent brain field = ' + JSON.stringify(first && first.brain) + ', wanted ' + SCRATCH_BRAIN);
        return true;
    });

    // ---------- 3. summary is real ----------
    await test('vant summary --json reports the env brain with honest fields', () => {
        const r = vant(['summary', '--json']);
        if (r.status !== 0) throw new Error('summary exited ' + r.status);
        const s = JSON.parse(r.stdout);
        assert(s.brain === SCRATCH_BRAIN, 'summary brain = ' + s.brain);
        assert(typeof s.decisions === 'number', 'decisions not numeric');
        assert(Array.isArray(s.learnings) && Array.isArray(s.goals), 'learnings/goals not arrays');
        return true;
    });

    // ---------- 4. MCP over real HTTP on the fresh brain ----------
    const PORT = await freePort();
    const mcpChild = spawnSync; // eslint-disable-line no-unused-vars
    let server = null;
    await test('fresh MCP server boots, /tools serves 296 tools, brain_read round-trips', async () => {
        const { spawn } = require('child_process');
        server = spawn(process.execPath, [path.join(ROOT, 'bin', 'mcp.js'), '-p', String(PORT)], {
            cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
            env: Object.assign({}, process.env, { VANT_BRAIN: SCRATCH_BRAIN })
        });
        // readiness: poll /health
        let ready = false;
        for (let i = 0; i < 60 && !ready; i++) {
            await new Promise(r2 => setTimeout(r2, 200));
            try {
                await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/health', res).on('error', rej));
                ready = true;
            } catch (e) { /* not up yet */ }
        }
        assert(ready, 'MCP server did not become ready on ' + PORT);
        const tools = await new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + '/tools', r => {
            let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d }));
        }).on('error', rej));
        assert(tools.status === 200, '/tools status ' + tools.status);
        const parsed = JSON.parse(tools.body);
        const names = (Array.isArray(parsed) ? parsed : parsed.tools || []).map(t => t.name || t);
        assert(names.length >= 290, 'tools count dropped: ' + names.length);
        // Round-trip through MCP's own flat-file pair: brain_write then
        // brain_read. (brain.write(category,key) is the memory STORE layer;
        // brain_read reads flat brain FILES — the MCP pair is consistent.)
        const post = (body) => new Promise((res, rej) => {
            const req = http.request('http://127.0.0.1:' + PORT + '/mcp/exec',
                { method: 'POST', headers: { 'Content-Type': 'application/json' } },
                r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
            req.on('error', rej); req.end(JSON.stringify(body));
        });
        const wrote = await post({ tool: 'brain_write', args: { name: 'p93-mcp-key', content: 'p93-mcp-value-live-fire' } });
        assert(wrote.status === 200 && !String(wrote.body).includes('"error"'),
            'brain_write failed: ' + wrote.body.slice(0, 140));
        const read = await post({ tool: 'brain_read', args: { name: 'p93-mcp-key' } });
        assert(read.status === 200, 'brain_read status ' + read.status);
        assert(String(read.body).includes('p93-mcp-value-live-fire'),
            'brain_read did not return the written value: ' + read.body.slice(0, 140));
        // The written file must land in the ENV brain (VANT_BRAIN), not vant.
        assert(fs.existsSync(path.join(BRAIN_DIR, 'p93-mcp-key.md')),
            'brain_write landed outside the env brain');
        return true;
    });

    if (server) { try { server.kill(); } catch (e) { /* already gone */ } }

    console.log(`\n  ${results.passed} passed, ${results.failed} failed`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
