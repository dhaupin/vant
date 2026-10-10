#!/usr/bin/env node
/**
 * E2E GRAND TOUR (pass 119) — the whole system, exercised live.
 *
 * The unit sweep (160+ suites) proves the parts; this file proves the
 * SYSTEM. Born from the pass-119 owner request "actually use vant, cli,
 * mcp, everything": the tour found a real disconnect (MCP sudo_grant
 * stored the capability name as the sudo scope while sandbox verdicts
 * consult the MAPPED scope via CAP_TO_SCOPE — the door's escalation path
 * could never connect). These gates keep that class of integration bug
 * out for good.
 *
 * Gates:
 *   A. FRESH INSTALL — a clean `git clone` of this tree (no node_modules,
 *      no private brains) boots: health, migrate --status. NODE_PATH
 *      bridges deps (a real user runs `npm install`; this suite runs it
 *      nowhere to keep CI fast — lib/ requires only 3 tiny packages).
 *   B. LIVE MCP DOOR (current tree, scratch port) — /tools 296, /health,
 *      /mcp/exec vant_health, DENY-BY-DEFAULT agent_spawn, sudo_grant
 *      escalation (CAP_TO_SCOPE mapped, agentId = the door's sandbox
 *      identity 'default'), agent_spawn/list/kill lifecycle, malformed
 *      JSON handled, DNS-rebind Host refused.
 *   C. EDGE — hostile VANT_BRAIN falls back to a safe name, storage
 *      traversal refused, canWrite=false → honest E_SANDBOX refusal
 *      (no id, no row).
 *
 * (scratch brain qc-tour; MCP door on port 3981; clone in os.tmpdir)
 */

const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3981;
const results = { passed: 0, failed: 0 };
function report(name, ok, err) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${err || 'assertion failed'}`); }
}
const tmpClone = path.join(os.tmpdir(), 'vant-grand-tour-' + process.pid);
function cleanup() {
    try { fs.rmSync(tmpClone, { recursive: true, force: true }); } catch (e) { }
    try { fs.rmSync(path.join(ROOT, 'models', 'private', 'qc-tour'), { recursive: true, force: true }); } catch (e) { }
}
process.on('exit', cleanup);

function req(port, method, p, body, extraHeaders) {
    return new Promise((res) => {
        const data = body === undefined ? null : JSON.stringify(body);
        const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { ...(extraHeaders || {}), ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) } }, (resp) => {
            let b = ''; resp.on('data', d => b += d); resp.on('end', () => res({ code: resp.statusCode, body: b }));
        });
        r.on('error', (e) => res({ code: 0, body: 'ERR:' + e.message }));
        if (data) r.write(data);
        r.end();
    });
}

console.log('\n🚌 E2E GRAND TOUR (pass 119)\n');

(async () => {
    // ============================================
    // GATE A — FRESH INSTALL (clean clone boots)
    // ============================================
    try {
        execFileSync('git', ['clone', '-q', '--depth', '1', ROOT, tmpClone]);
        report('gate A: fresh clone has NO private brains and NO node_modules',
            !fs.existsSync(path.join(tmpClone, 'models', 'private', 'vant'))
                && !fs.existsSync(path.join(tmpClone, 'node_modules')),
            'clone state wrong');

        // TRUE fresh install: no VANT_BRAIN override — the default brain
        // resolves to the shipped template (models/public/vant).
        const env = { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') };
        const health = execFileSync('node', ['bin/health.js'], { cwd: tmpClone, env, timeout: 60000 }).toString();
        report('gate A: fresh `vant health` passes (template brain found)',
            health.includes('✓ Brain exists at models/public/vant'),
            health.slice(-160));

        execFileSync('node', ['bin/migrate.js'], { cwd: tmpClone, env, timeout: 60000 });
        const status = execFileSync('node', ['bin/migrate.js', '--status'], { cwd: tmpClone, env, timeout: 60000 }).toString();
        report('gate A: fresh `vant migrate` reaches layout v3',
            status.includes('marker version: v3') && status.includes('up to date'),
            status.slice(0, 160));

        const sweep = execFileSync('node', ['bin/health.js', '--sweep'], { cwd: tmpClone, env, timeout: 60000 }).toString();
        report('gate A: fresh `vant health --sweep` reports clean debris',
            sweep.includes('No stranded write temps'),
            sweep.slice(-160));
    } catch (e) {
        report('gate A (fresh install)', false, e.message);
    }

    // ============================================
    // GATE B — LIVE MCP DOOR (current tree)
    // ============================================
    let door = null;
    try {
        door = spawn('node', ['bin/mcp.js', '-S', '-p', String(PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
        let toolsBody = null;
        for (let i = 0; i < 60; i++) {
            const t = await req(PORT, 'GET', '/tools');
            if (t.code === 200) { toolsBody = t.body; break; }
            await new Promise(r => setTimeout(r, 250));
        }
        const tools = toolsBody ? JSON.parse(toolsBody) : [];
        // (pass 179) count grew 296 → 299: Wave A added event_tail,
        // event_sink_enable, event_sink_stats (prd-canonicalization §2)
        report('gate B: door ready; /tools = 299 tools (array shape; +3 event tools pass 179)',
            Array.isArray(tools) && tools.length === 299, 'len=' + tools.length);

        const health = JSON.parse((await req(PORT, 'POST', '/mcp/exec', { tool: 'vant_health', args: {} })).body);
        report('gate B: /mcp/exec vant_health → ok',
            !!(health.result && health.result.status === 'ok'), JSON.stringify(health).slice(0, 100));

        // Deny-by-default: an ungranted door refuses to spawn processes,
        // and the refusal is SURFACED (not a lying success).
        const deny = JSON.parse((await req(PORT, 'POST', '/mcp/exec', { tool: 'agent_spawn', args: { name: 'Tour', role: 'Probe' } })).body);
        report('gate B: agent_spawn is DENY-BY-DEFAULT with a surfaced refusal',
            !!(deny.result && /not allowed/i.test(JSON.stringify(deny.result))), JSON.stringify(deny).slice(0, 120));

        // The documented escalation: sudo_grant on the DOOR's sandbox
        // identity ('default'). This is the pass-119 sudo_grant fix gate:
        // the handler maps the CAPABILITY through CAP_TO_SCOPE so the grant
        // lands under the scope name the sandbox verdict consults.
        const grant = JSON.parse((await req(PORT, 'POST', '/mcp/exec', { tool: 'sudo_grant', args: { agentId: 'default', capability: 'canSpawn' } })).body);
        report('gate B: sudo_grant(canSpawn) escalates without error', !grant.error, JSON.stringify(grant).slice(0, 100));

        const spawnRes = JSON.parse((await req(PORT, 'POST', '/mcp/exec', { tool: 'agent_spawn', args: { name: 'TourWorker', role: 'Probe' } })).body);
        report('gate B: agent_spawn after grant returns an agent id (escalation CONNECTED)',
            !!(spawnRes.result && spawnRes.result.id), JSON.stringify(spawnRes).slice(0, 140));
        const agentId = spawnRes.result && spawnRes.result.id;

        const listRes = JSON.parse((await req(PORT, 'POST', '/mcp/exec', { tool: 'agent_list', args: {} })).body);
        const listArr = listRes.result && (Array.isArray(listRes.result) ? listRes.result : listRes.result.agents);
        report('gate B: agent_list shows the spawned agent',
            !!(listArr && listArr.some(a => a.id === agentId)), JSON.stringify(listRes).slice(0, 120));

        const killRes = JSON.parse((await req(PORT, 'POST', '/mcp/exec', { tool: 'agent_kill', args: { id: agentId } })).body);
        report('gate B: agent_kill over the door succeeds',
            !!(killRes.result && (killRes.result === true || killRes.result.terminated === true || killRes.result.persisted === true)),
            JSON.stringify(killRes).slice(0, 120));

        // send a raw malformed body (a 500 here would mean the door lets
        // a bad body take down the handler):
        const raw = await new Promise((res) => {
            const r2 = http.request({ host: '127.0.0.1', port: PORT, path: '/mcp/exec', method: 'POST', headers: { 'content-type': 'application/json' } }, (resp) => {
                let b = ''; resp.on('data', d => b += d); resp.on('end', () => res({ code: resp.statusCode, body: b }));
            });
            r2.on('error', (e) => res({ code: 0, body: e.message }));
            r2.end('{not json');
        });
        report('gate B: malformed JSON body handled without a 500 crash',
            raw.code !== 500, `code=${raw.code}`);

        const evil = await req(PORT, 'POST', '/mcp/exec', {}, { host: 'evil.example.com' });
        report('gate B: DNS-rebind Host refused', evil.code !== 200, `code=${evil.code}`);
    } catch (e) {
        report('gate B (MCP door)', false, e.message);
    } finally {
        if (door) { try { door.kill('SIGKILL'); } catch (e) { } }
    }

    // ============================================
    // GATE C — EDGE: hostile brain, traversal, honest refusal
    // ============================================
    try {
        for (const hostile of ['../../etc', '..', 'a/b']) {
            const out = execFileSync('node', ['-e', `const b = require('./lib/brain'); console.log('BRAIN:' + (b.getCurrentBrain ? b.getCurrentBrain() : ''));`],
                { cwd: ROOT, env: { ...process.env, VANT_BRAIN: hostile }, timeout: 30000 }).toString();
            const m = out.match(/BRAIN:(.*)/);
            const resolved = m ? m[1].trim() : '';
            report(`gate C: hostile VANT_BRAIN ${JSON.stringify(hostile)} → safe fallback (${resolved})`,
                /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(resolved), out.slice(-100));
        }

        const trav = execFileSync('node', ['-e', `const { FileStorage } = require('./lib/storage');
const s = new FileStorage({ basePath: 'models/private/qc-tour' });
let out = 'ok:';
try { const v = s.read('../../package.json'); out += (v === null ? 'null' : 'LEAK'); } catch (e) { out += 'threw'; }
try { s.write('../../evil-tour.txt', 'x'); out += ':write-LEAK'; } catch (e) { out += ':write-threw'; }
console.log(out);`], { cwd: ROOT, env: { ...process.env, VANT_BRAIN: 'qc-tour' }, timeout: 30000 }).toString();
        report('gate C: storage traversal (read + write outside root) refused',
            !/LEAK/.test(trav), trav.slice(-80));
        try { fs.rmSync(path.join(ROOT, 'evil-tour.txt'), { force: true }); } catch (e) { }

        const deny = execFileSync('node', ['-e', `const sandbox = require('./lib/sandbox');
sandbox.defaultSandbox.setCapabilities({ canRead: true, canWrite: false });
const teams = require('./lib/teams');
const org = teams.createOrg('TourDeny-' + Date.now());
console.log('RES:' + JSON.stringify({ code: org.code, error: !!org.error, id: !!org.id }));`],
            { cwd: ROOT, env: { ...process.env, VANT_BRAIN: 'qc-tour' }, timeout: 30000 }).toString();
        const m = deny.match(/RES:(\{.*\})/);
        const res = m ? JSON.parse(m[1]) : {};
        report('gate C: canWrite=false → honest refusal (E_SANDBOX, no id, no row)',
            res.error === true && res.id === false && res.code === 'E_SANDBOX', JSON.stringify(res));
    } catch (e) {
        report('gate C (edge)', false, e.message);
    }

    console.log(`\n--- RESULTS ---\n`);
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})().catch(e => {
    console.error('HARNESS:', e.message);
    cleanup();
    process.exit(1);
});
