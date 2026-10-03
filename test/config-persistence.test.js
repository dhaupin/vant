#!/usr/bin/env node
/**
 * Config persistence tests (pass 95)
 *
 * The old story: `vant config set` called config.set() -> setFlag(), an
 * in-memory Map that died with the CLI process while printing "✓ Set k v".
 * Every CLI run is its own process, so the value evaporated instantly and
 * the MCP tools were pure stubs ({value:null} / {status:'set'}). setConfig()
 * now keeps the flag round-trip AND persists into the CURRENT brain's
 * config.json — the file loadBrainConfig/get({brain}) read.
 *
 * A second seam mattered too: the DEDICATED accessors (mcpRequireKey /
 * mcpApiKey) that the MCP auth gate calls never consulted that file, so the
 * documented `vant config set mcp.requireKey true` / `mcp.apiKey …` commands
 * still did nothing to a later MCP server. They now read the current brain's
 * persisted config (env still wins, for deployment overrides).
 *
 * Gated here (all assertions cross REAL process boundaries):
 *   A. CLI set → fresh-process CLI get returns the value; file is nested
 *   B. MCP vant_config_set/get round-trip; empty args refuse at the door;
 *      the MCP write lands in the brain config file
 *   C. fresh-process mcpRequireKey()/mcpApiKey() read the persisted values;
 *      negative control on an empty brain returns false/null
 *
 * Run: node test/config-persistence.test.js
 * (scratch brains p95-config-persist + p95-config-empty wiped before/after)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAIN = 'p95-config-persist';
const EMPTY_BRAIN = 'p95-config-empty';
const CFG = path.join(ROOT, 'models', 'private', BRAIN, 'config.json');

const results = { passed: 0, failed: 0 };

function report(name, ok, err) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${err || 'assertion failed'}`); }
}

function readCfg() {
    try { return JSON.parse(fs.readFileSync(CFG, 'utf8')); }
    catch (e) { return null; }
}

function wipe() {
    for (const b of [BRAIN, EMPTY_BRAIN]) {
        fs.rmSync(path.join(ROOT, 'models', 'private', b), { recursive: true, force: true });
    }
}

function run(bin, script, brain) {
    return new Promise((resolve, reject) => {
        const r = spawn(process.execPath, [bin, ...script], {
            cwd: ROOT,
            env: { ...process.env, VANT_BRAIN: brain || BRAIN },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let out = '', err = '';
        r.stdout.on('data', d => { out += d; });
        r.stderr.on('data', d => { err += d; });
        const killer = setTimeout(() => { r.kill('SIGKILL'); }, 30000);
        r.on('close', code => {
            clearTimeout(killer);
            if (code === 0) resolve(out);
            else reject(new Error('exit ' + code + ': ' + (err || out || 'no output')));
        });
    });
}

const runCli = (args, brain) => run(path.join(ROOT, 'bin', 'config.js'), args, brain);
const runNode = (script, brain) => run('-e', [script], brain);

(async () => {
    console.log('\n⚙️  CONFIG PERSISTENCE TESTS\n');
    wipe();

    // ============================================
    // GATE A — CLI set → fresh-process CLI get
    // ============================================
    try {
        const setOut = await runCli(['set', 'demo.flag', 'hello']);
        report('CLI `config set` persists (prints the persisted hint)',
            /persisted to/.test(setOut), setOut.trim());

        const getOut = await runCli(['get', 'demo.flag']);
        report('CLI `config get` in a FRESH process returns the value',
            /demo\.flag=hello/.test(getOut), getOut.trim());

        const cfg = readCfg() || {};
        report('value persisted nested in the brain config.json',
            cfg.demo && cfg.demo.flag === 'hello', JSON.stringify(cfg));
    } catch (e) {
        report('gate A (CLI set→get)', false, e.message);
    }

    // ============================================
    // GATE B — MCP round-trip + fail-closed
    // ============================================
    try {
        const mcpScript = `
const mcp = require('./lib/mcp');
(async () => {
    const s = await mcp.execute('vant_config_set', { key: 'mcp.probe.a', value: 'yes' });
    const g = await mcp.execute('vant_config_get', { key: 'mcp.probe.a' });
    const bad = await mcp.execute('vant_config_set', {});
    console.log('SET=' + JSON.stringify(s));
    console.log('GET=' + JSON.stringify(g));
    console.log('BAD=' + JSON.stringify(bad));
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`;
        const out = await runNode(mcpScript);
        report('MCP vant_config_set persists (persisted:true, real brain)',
            /"persisted":true/.test(out) && /"brain":"p95-config-persist"/.test(out), out.trim());
        report('MCP vant_config_get reads the value back',
            /"value":"yes"/.test(out), out.trim());
        report('MCP empty args are refused at the door (no phantom success)',
            /MCP_INPUT_INVALID/.test(out), out.trim());

        const cfg = readCfg() || {};
        report('MCP write landed in the brain config file',
            cfg.mcp && cfg.mcp.probe && cfg.mcp.probe.a === 'yes', JSON.stringify(cfg));
    } catch (e) {
        report('gate B (MCP config round-trip)', false, e.message);
    }

    // ============================================
    // GATE C — dedicated accessor bridge (auth gate)
    // ============================================
    try {
        await runCli(['set', 'mcp.requireKey', 'true']);
        await runCli(['set', 'mcp.apiKey', 'secret123']);

        const accScript = `const c = require('./lib/config');
console.log('RK=' + c.mcpRequireKey());
console.log('AK=' + c.mcpApiKey());`;
        const acc = await runNode(accScript);
        report('fresh-process mcpRequireKey() reads persisted brain config',
            /RK=true/.test(acc), acc.trim());
        report('fresh-process mcpApiKey() reads persisted brain config',
            /AK=secret123/.test(acc), acc.trim());

        const neg = await runNode(accScript, EMPTY_BRAIN);
        report('negative control: empty brain → requireKey false / apiKey null',
            /RK=false/.test(neg) && /AK=null/.test(neg), neg.trim());
    } catch (e) {
        report('gate C (accessor bridge)', false, e.message);
    }

    // ============================================
    // GATE D — prototype-pollution key segments refused (pass 100)
    // ============================================
    try {
        const pollScript = `
const mcp = require('./lib/mcp');
(async () => {
    const p = await mcp.execute('vant_config_set', { key: '__proto__.lfPolluted', value: 'yes' });
    const c = await mcp.execute('vant_config_set', { key: 'constructor.prototype.lfPolluted', value: 'yes' });
    const k = await mcp.execute('vant_config_set', { key: 'prototype.lfPolluted', value: 'yes' });
    console.log('PROTO=' + JSON.stringify(p));
    console.log('CTOR=' + JSON.stringify(c));
    console.log('PROTOKEY=' + JSON.stringify(k));
    console.log('POLLUTED=' + (({}).lfPolluted === undefined ? 'clean' : 'DIRTY'));
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`;
        const out = await runNode(pollScript);
        report('MCP config_set refuses __proto__ / constructor / prototype segments',
            (out.match(/E_KEY_SEGMENT/g) || []).length === 3, out.trim());
        report('Object.prototype NOT polluted (no cross-object contamination)',
            /POLLUTED=clean/.test(out), out.trim());
        let raw = '';
        try { raw = fs.readFileSync(CFG, 'utf8'); } catch (e) {}
        report('no polluting key reached the config file',
            !/lfPolluted/.test(raw), raw.trim());
    } catch (e) {
        report('gate D (prototype-pollution guard)', false, e.message);
    }

    // ============================================
    // Summary
    // ============================================
    console.log(`\n${results.passed} passed, ${results.failed} failed`);
    wipe();
    process.exit(results.failed > 0 ? 1 : 0);
})().catch(e => {
    console.error('fatal:', e.message);
    wipe();
    process.exit(1);
});
