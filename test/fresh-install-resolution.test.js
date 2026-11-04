#!/usr/bin/env node
/**
 * Fresh-install brain resolution pins (issue #297).
 *
 * THE BUG: on a genuinely fresh tree (no models/private, no state.json),
 * getBrainPath() fell through to the shipped public template
 * (models/public/vant). The runtime, however, seeds and WRITES to the
 * private side (bin/start.js seedStarterBrain), so writes landed in
 * models/private/vant while reads and brain-scoped ledgers (tempo,
 * guests, leases) looked in models/public/vant - a split pointer whose
 * round-trips returned null. Symptom: `npm run sweep` on a clean clone
 * failed guests/tempo/livefire-lease/state-persistence; CI stayed green
 * only because `node test/ci.js` seeds models/private/vant + state.json
 * before `node test/run-all.js` ever runs.
 *
 * THE CONTRACT (the maintainer's intended design):
 *   - a fresh install resolves the PRIVATE runtime (models/private/vant)
 *     and seeds a private brain there;
 *   - the shipped public template (models/public/vant) layers UNDERNEATH
 *     as starter material (read fallback + health's layered report);
 *   - a genuine legacy public-only brain (state.json present, public tree
 *     only) still resolves public - the tree branch is unchanged.
 *
 * Each case runs against a throwaway tree in os.tmpdir with the REAL libs
 * (absolute require paths) and VANT_BRAIN stripped, so a parent sweep's
 * scratch brain cannot steer the result.
 *
 * Run: node test/fresh-install-resolution.test.js
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function ok(name) { pass++; console.log('  ✓ ' + name); }
function bad(name, detail) { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + String(detail).slice(0, 200) : '')); }

function freshTree({ state } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-fresh-'));
    const pub = path.join(dir, 'models', 'public', 'vant');
    fs.mkdirSync(pub, { recursive: true });
    fs.writeFileSync(path.join(pub, 'identity.md'), '# identity.md\n\nNAME: Vant\nROLE: template\n\nMODEL: template-model\n');
    if (state) fs.writeFileSync(path.join(dir, 'models', 'state.json'), JSON.stringify(state));
    return dir;
}

function run(dir, script) {
    const env = { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') };
    delete env.VANT_BRAIN; // the documented fresh-install intent, enforced
    return spawnSync('node', ['-e', script], { cwd: dir, env, encoding: 'utf8', timeout: 30000 });
}

function runBin(dir, args) {
    const env = { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') };
    delete env.VANT_BRAIN;
    return spawnSync('node', [path.join(ROOT, 'bin', args[0]), ...args.slice(1)], { cwd: dir, env, encoding: 'utf8', timeout: 60000 });
}

const BRAIN = JSON.stringify(path.join(ROOT, 'lib', 'brain'));

console.log('\n🆕 FRESH-INSTALL BRAIN RESOLUTION PINS (issue #297)\n');

// ---------- 1. fresh tree resolves the PRIVATE runtime, not the template ----------
{
    const dir = freshTree();
    const r = run(dir, `const b=require(${BRAIN}); console.log('RESOLVE:'+b.getBrainPath());`);
    const m = /RESOLVE:(.+)/.exec(r.stdout || '');
    const resolved = m ? m[1].trim() : '(no output)';
    if (/^models[\\/]private[\\/]vant$/.test(resolved)) ok('fresh install resolves the private runtime (models/private/vant)');
    else bad('fresh install resolves private runtime', resolved + ' | ' + (r.stderr || '').slice(0, 160));
}

// ---------- 2. the public template still resolves (the starter layer) ----------
{
    const dir = freshTree();
    const r = run(dir, `const b=require(${BRAIN}); console.log('PUBLIC:'+b.getPublicPath());`);
    const m = /PUBLIC:(.+)/.exec(r.stdout || '');
    const resolved = m ? m[1].trim() : '(no output)';
    if (/^models[\\/]public[\\/]vant$/.test(resolved)) ok('public template still resolves as the starter layer (models/public/vant)');
    else bad('public template resolves', resolved);
}

// ---------- 3. write→read round-trips (the split-pointer bug: was null) ----------
{
    const dir = freshTree();
    const r = run(dir, `(async()=>{const b=require(${BRAIN});await b.writeTo({name:'vant',type:'private'},'probe','hello-world');const x=await b.read('probe');console.log('RT:'+(x&&x.content));})().catch(e=>console.log('RT_ERR:'+e.message));`);
    if (/RT:hello-world/.test(r.stdout || '')) ok('private write→read round-trips on a fresh tree (no split pointer)');
    else bad('fresh-tree write→read round-trips', (r.stdout || '').slice(0, 200) + ' | ' + (r.stderr || '').slice(0, 160));
    if (fs.existsSync(path.join(dir, 'models', 'private', 'vant', 'probe.md'))) ok('the write landed in models/private/vant (runtime side)');
    else bad('write landed in the private runtime');
}

// ---------- 4. read falls through to the public template (public underneath) ----------
{
    const dir = freshTree();
    const r = run(dir, `(async()=>{const b=require(${BRAIN});const x=await b.read('identity');console.log('IDENT:'+(x&&String(x.content).split('\\n')[0]));})().catch(e=>console.log('IDENT_ERR:'+e.message));`);
    if (/IDENT:# identity\.md/.test(r.stdout || '')) ok('a fresh brain reads the public template underneath (starter material)');
    else bad('read falls through to public template', (r.stdout || '').slice(0, 200));
}

// ---------- 5. health reports the layered brain (private runtime + public layer) ----------
{
    const dir = freshTree();
    const r = runBin(dir, ['health.js']);
    const out = (r.stdout || '') + (r.stderr || '');
    if (/Brain exists at models[\\/]private[\\/]vant/.test(out)) ok('health reports the private runtime brain as existing');
    else bad('health reports private runtime brain', out.slice(0, 200));
    if (/Starter content layered from public template models[\\/]public[\\/]vant/.test(out)) ok('health names the layered public starter source');
    else bad('health names the layered public source', out.slice(0, 200));
    if (out.trim() && !/not initialized/.test(out)) ok('health does NOT report "not initialized" for the layered fresh brain');
    else bad('health falsely reports "not initialized"', out.slice(0, 200));
}

// ---------- 6. legacy public-only brain (state.json present) still resolves public ----------
{
    const dir = freshTree({ state: { stack: ['vant'], currentBrain: 'vant', mode: 'public' } });
    const r = run(dir, `const b=require(${BRAIN}); console.log('RESOLVE:'+b.getBrainPath());`);
    const m = /RESOLVE:(.+)/.exec(r.stdout || '');
    const resolved = m ? m[1].trim() : '(no output)';
    if (/^models[\\/]public[\\/]vant$/.test(resolved)) ok('legacy public-only brain (state.json present) still resolves public');
    else bad('legacy public-only brain resolves public', resolved + ' | ' + (r.stderr || '').slice(0, 160));
}

console.log('\n=== fresh-install resolution: ' + pass + ' passed, ' + fail + ' failed ===\n');
process.exit(fail > 0 ? 1 : 0);
