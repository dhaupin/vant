'use strict';

/**
 * Foreign-cwd hygiene (pass 290, issue #225)
 *
 * The dispatcher intentionally runs routed CLI commands in the CALLER'S cwd,
 * because brains live in the user's project (lib/anchor.js). What must NOT
 * happen is module-load side effects writing a models/<brain>/orgchart/ tree
 * into that cwd: before pass 290 the default Sandbox's construction seeded
 * its escrow budget WITH a disk persist, so ANY command (even read-only ones
 * like `vant horcrux inspect`) created models/private/<brain>/orgchart/
 * escrow.json in the directory it was launched from (issue #225: a foreign
 * repo got surprise untracked pollution).
 *
 * Pins:
 *   1. `horcrux inspect` from a foreign cwd creates NO models/ tree (the #225 repro)
 *   2. `brain-registry status` from a foreign cwd creates NO models/ tree
 *   3. a REAL escrow op still persists (the memory-only seed did not switch
 *      persistence off — budgets/holds land on disk when they should)
 *
 * Self-reporting suite: exit 1 on fail, cleans its scratch dir.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => { passed++; console.log('  ✓ ' + name); })
        .catch((e) => { failed++; failures.push(name); console.log('  ✗ ' + name + ' — ' + (e.message || e)); });
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

function foreignDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-foreign-cwd-'));
    return dir;
}

function runInDir(dir, cmd, args) {
    return execFileSync(process.execPath, [path.join(ROOT, cmd)].concat(args || []), {
        cwd: dir,
        encoding: 'utf8',
        env: Object.assign({}, process.env, { VANT_REPO_ROOT: ROOT }),
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000
    });
}

function modelsTree(dir) {
    const p = path.join(dir, 'models');
    if (!fs.existsSync(p)) return [];
    const out = [];
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const q = path.join(d, e.name);
            if (e.isDirectory()) walk(q); else out.push(path.relative(dir, q));
        }
    };
    walk(p);
    return out;
}

// A real (non-horcrux) file: inspect must refuse it AND must not create state
const MOCK_TARGET = path.join(ROOT, '.agent_tmp', 'cwd-hygiene-nonhorcrux.json');

async function main() {
    console.log('\n🧹 FOREIGN-CWD HYGIENE (issue #225)\n');
    fs.mkdirSync(path.dirname(MOCK_TARGET), { recursive: true });
    fs.writeFileSync(MOCK_TARGET, '# not a horcrux');

    await test('#225: horcrux inspect from a foreign cwd creates NO models/ tree', () => {
        const dir = foreignDir();
        try {
            let exit = 0;
            try { runInDir(dir, 'bin/vant.js', ['horcrux', 'inspect', MOCK_TARGET]); }
            catch (e) { exit = (e.status === undefined) ? -1 : e.status; } // a typed refusal is fine; state is the pin
            const tree = modelsTree(dir);
            assert(tree.length === 0, 'foreign cwd polluted by inspect: ' + JSON.stringify(tree));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    await test('#225: brain-registry status from a foreign cwd creates NO models/ tree', () => {
        const dir = foreignDir();
        try {
            runInDir(dir, 'bin/brain-registry.js', ['status']);
            const tree = modelsTree(dir);
            assert(tree.length === 0, 'foreign cwd polluted by brain-registry status: ' + JSON.stringify(tree));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    await test('#225: a REAL escrow op still persists (memory-only seed did not disable persistence)', () => {
        const dir = foreignDir();
        try {
            execFileSync(process.execPath, ['-e', [
                'const escrow = require(' + JSON.stringify(path.join(ROOT, 'lib', 'escrow.js')) + ');',
                'const e = new escrow.Escrow();',
                // A REAL setBudget (no options.persist:false — unlike the
                // sandbox seed) MUST hit disk: the store file is the pin.
                'e.setBudget("cwd-hygiene-agent", 500);',
                'const fs = require("fs");',
                'const tree = (function walk(d){const o=[];if(!fs.existsSync(d))return o;for(const x of fs.readdirSync(d,{withFileTypes:true})){const p=require("path").join(d,x.name);x.isDirectory()?o.push(...walk(p)):o.push(p);}return o;})("models");',
                'console.log("CLEAN=" + tree.some((f) => f.endsWith("escrow.json")));'
            ].join('\n')], { cwd: dir, encoding: 'utf8', timeout: 60000, env: Object.assign({}, process.env, { VANT_REPO_ROOT: ROOT }) });
            const tree = modelsTree(dir);
            assert(tree.some((f) => f.endsWith('escrow.json')), 'real escrow op did NOT persist — persistence broke: ' + JSON.stringify(tree));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    fs.rmSync(MOCK_TARGET, { force: true });
    console.log('\n===' + ' Foreign-cwd hygiene: ' + passed + ' passed, ' + failed + ' failed ===');
    if (failed > 0) console.log('Failures: ' + failures.join(', '));
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('FATAL:', e.message);
    process.exit(1);
});
