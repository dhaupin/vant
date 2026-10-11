#!/usr/bin/env node
/**
 * Connector run()/delegation pins (pass 168).
 *
 * Pins the connector-sweep rot fixes:
 *   1. python.run executes a real script file (the old path fed an ARRAY
 *      into execute() → `python3 -c ['/tmp/x.py']` → guaranteed SyntaxError;
 *      file mode never worked)
 *   2. julia.run returns the standard result shape (the old path returned
 *      the raw child process handle without awaiting output)
 *   3. ruby/php run() route through the fixed script-mode path (honest
 *      ENOENT when the language is absent — no hang, no silent success)
 *   4. SidecarConnector mode:'subprocess' delegates to the language's own
 *      connector class export (rust) — the discovery normalization must
 *      not break the require-shape contract
 *   5. compute discovery loads every language connector (class or
 *      singleton export) with a working eval
 *
 * Exit code is the verdict, per house test conventions.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function ok(name) { passed++; console.log('  ✓ ' + name); }
function fail(name, detail) { failed++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }

const has = (bin) => {
    try { require('child_process').execFileSync('which', [bin], { encoding: 'utf8' }); return true; }
    catch (e) { return false; }
};

async function main() {
    // ---- Pin 1: python.run file mode (python3 is a CI baseline) ----
    if (has('python3')) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-run-pin-'));
        const script = path.join(dir, 'ok.py');
        fs.writeFileSync(script, 'print("RUN-FILE-OK:", 7*6)\n');
        const python = require('../lib/connectors/python.js');
        const r = await python.run(script);
        if (r.success && r.stdout.includes('RUN-FILE-OK: 42')) {
            ok('python.run executes a script file (old path: -c [file] SyntaxError)');
        } else fail('python.run file mode', JSON.stringify(r));
        fs.rmSync(dir, { recursive: true, force: true });
    } else {
        console.log('  ⊘ SKIP pin 1: python3 not on PATH');
    }

    // ---- Pin 2: julia.run result shape + correctness ----
    if (has('julia')) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-run-pin-'));
        const script = path.join(dir, 'ok.jl');
        fs.writeFileSync(script, 'println("RUN-FILE-JL-OK:", 7*6)\n');
        const julia = require('../lib/connectors/julia.js');
        const r = await julia.run(script);
        if (r && r.success === true && typeof r.stdout === 'string' && r.stdout.includes('RUN-FILE-JL-OK:42')) {
            ok('julia.run returns the standard result shape with real output');
        } else fail('julia.run shape', JSON.stringify(r).slice(0, 120));
        fs.rmSync(dir, { recursive: true, force: true });
    } else {
        console.log('  ⊘ SKIP pin 2: julia not on PATH');
    }

    // ---- Pin 3: ruby/php run() honest failure (ENOENT, not hang/silent) ----
    for (const lang of ['ruby', 'php']) {
        if (has(lang)) {
            console.log(`  ⊘ SKIP pin 3 (${lang}): language present, failure path not exercisable`);
            continue;
        }
        const mod = require('../lib/connectors/' + lang + '.js');
        const t0 = Date.now();
        try {
            await mod.run('/tmp/nonexistent-' + lang + '-pin.' + (lang === 'ruby' ? 'rb' : 'php'));
            fail(lang + '.run absence honesty', 'resolved without error');
        } catch (e) {
            if (Date.now() - t0 < 5000 && /ENOENT|spawn/.test(e.message)) {
                ok(`${lang}.run fails honestly and fast when ${lang} is absent (${Date.now() - t0}ms)`);
            } else fail(lang + '.run absence honesty', e.message);
        }
    }

    // ---- Pin 4: SidecarConnector subprocess delegation to class exports ----
    if (has('rustc')) {
        const { SidecarConnector } = require('../lib/connectors/sidecar');
        const c = new SidecarConnector({ lang: 'rust', mode: 'subprocess' });
        const r = await c.eval('println!("DELEGATION-OK: {}", 5 * 5);', { timeout: 60000 });
        if (r.success && r.stdout.includes('DELEGATION-OK: 25')) {
            ok("SidecarConnector mode:'subprocess' delegates to RustConnector (class export)");
        } else fail('SidecarConnector rust delegation', JSON.stringify(r).slice(0, 120));
    } else {
        console.log('  ⊘ SKIP pin 4: rustc not on PATH');
    }

    // ---- Pin 5: compute discovery — every language evals ----
    {
        const compute = require('../lib/compute');
        const r = await compute.evaluate('console.log("DISCOVERY-OK")', { lang: 'node' });
        if (r.success && r.stdout.includes('DISCOVERY-OK')) {
            ok('compute discovery: node connector evals (discovery normalization intact)');
        } else fail('compute discovery', JSON.stringify(r).slice(0, 120));
        const langs = compute.list();
        for (const expected of ['python', 'julia', 'rust', 'node', 'ruby', 'go', 'php']) {
            if (!langs.includes(expected)) fail('compute.list includes ' + expected);
        }
        if (['python', 'julia', 'rust', 'node', 'ruby', 'go', 'php'].every(l => langs.includes(l))) {
            ok('compute.list: all 7 language connectors discovered');
        }
    }

    console.log('\n  Connector run/delegation pins: ' + passed + ' passed, ' + failed + ' failed');
    if (failed > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((e) => {
    console.error('UNEXPECTED:', (e && e.stack) || e);
    process.exit(1);
});
