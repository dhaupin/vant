'use strict';

/**
 * Regression pins for issues #243 + #244 (two sightings of the same
 * models/state.json read/write edge, measured in a sandbox child — the
 * repo's own models/ tree is never touched):
 *
 *   #243 — `vant brain push` printed "Pushed to stack" but only mutated
 *          the in-memory stack: models/state.json never wrote, so
 *          brain-registry status and the next boot saw the OLD stack.
 *          Fix: push persists through loadStack() (the same mechanics
 *          switchBrain uses) and keeps currentBrain untouched (push is
 *          not switch).
 *   #244 — a missing state.json (the legitimate fresh-install default)
 *          was misreported as a "schema fault — truncated/corrupt"
 *          banner with the underlying ENOENT message truncated mid-path
 *          (unclosed quote, no filename). Fix: ENOENT gets a friendly
 *          informational line; real content faults still fault loudly
 *          but name the cause in FULL (no mid-path truncation).
 *
 * Run: node test/brain-state-243-244.test.js  (picked up by test/run-all.js)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
let failures = 0;
function check(name, ok, detail) {
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? (typeof detail === 'string' && detail ? ` — ${detail}` : '') : `: ${detail}`}`);
}

function makeRoot(stateJson) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-cta-243-'));
    fs.mkdirSync(path.join(root, 'models', 'private', 'vant'), { recursive: true });
    fs.mkdirSync(path.join(root, 'models', 'private', 'echo'), { recursive: true });
    fs.mkdirSync(path.join(root, 'models', 'public', 'vant'), { recursive: true });
    if (stateJson !== null) fs.writeFileSync(path.join(root, 'models', 'state.json'), json(stateJson));
    return root;
}
function json(state) {
    return JSON.stringify(Object.assign({ stack: ['vant'], currentBrain: 'vant' }, state));
}

/** Run a script in the sandbox root (brain.js cwd-anchors models/). */
function runRoot(root, body) {
    return spawnSync(process.execPath, ['-e', body], {
        cwd: root,
        encoding: 'utf8',
        timeout: 30000,
        env: Object.assign({}, process.env, { VANT_BRAIN: '' }),
    });
}

// ---- #243: push persists (push is not switch, but push does write) ----
{
    const root = makeRoot(null);
    const r = runRoot(root, `
        const { pathToFileURL } = require('url');
        const brain = require(require('path').join(${JSON.stringify(REPO)}, 'lib', 'brain.js'));
        const out = brain.pushBrain('echo');
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync(require('path').join(${JSON.stringify(root)}, 'models', 'state.json'), 'utf8'));
        console.log(JSON.stringify({ mem: out, disk: state.stack, current: state.currentBrain }));
    `);
    let d = null;
    try { d = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { /* surfaced below */ }
    check('#243: push persists the stack to models/state.json', r.status === 0 && d && JSON.stringify(d.disk) === JSON.stringify(['echo', 'vant']), d ? `disk=${JSON.stringify(d.disk)} exit=${r.status}` : `${r.stdout} ${r.stderr}`.slice(0, 200));
    check('#243: push does NOT switch the current brain (push is not switch)', d && d.current === 'vant', d && d.current);
    check('#243: in-memory stack agrees with the persisted stack', d && JSON.stringify(d.mem) === JSON.stringify(d.disk), d && JSON.stringify(d.mem));
    fs.rmSync(root, { recursive: true, force: true });
}

// ---- #243: already-stacked push stays a persistence no-op ----
{
    // A comparison baseline must exist before the child reads it: the
    // fresh-install default only CREATES state.json on first save, so
    // this pin's sandbox stamps the baseline itself (same state the
    // repro starts from).
    const root = makeRoot({ stack: ['vant'], currentBrain: 'vant' });
    const r = runRoot(root, `
        const brain = require(require('path').join(${JSON.stringify(REPO)}, 'lib', 'brain.js'));
        const before = fs.readFileSync(require('path').join(${JSON.stringify(root)}, 'models', 'state.json'), 'utf8');
        const out = brain.pushBrain('vant'); // already stacked
        const after = fs.readFileSync(require('path').join(${JSON.stringify(root)}, 'models', 'state.json'), 'utf8');
        console.log(JSON.stringify({ stack: out, unchanged: before === after }));
    `);
    let d = null;
    try { d = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { /* surfaced below */ }
    check('#243: already-stacked push is a no-op (stack order, file untouched)', r.status === 0 && d && d.unchanged === true && JSON.stringify(d.stack) === JSON.stringify(['vant']), d ? `unchanged=${d.unchanged}` : `${r.stderr}`.slice(0, 200));
    fs.rmSync(root, { recursive: true, force: true });
}

// ---- #243: push of an unknown brain still refuses (no phantom persists) ----
{
    const root = makeRoot(null);
    const r = runRoot(root, `
        const brain = require(require('path').join(${JSON.stringify(REPO)}, 'lib', 'brain.js'));
        try { brain.pushBrain('ghost'); console.log(JSON.stringify({ threw: false })); }
        catch (e) { console.log(JSON.stringify({ threw: true, code: e.code || e.name })); }
    `);
    let d = null;
    try { d = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { /* surfaced below */ }
    check('#243: unknown brain push refuses (BRAIN_NOT_FOUND), nothing persists', d && d.threw === true, d ? JSON.stringify(d) : r.stderr.slice(0, 200));
    fs.rmSync(root, { recursive: true, force: true });
}

// ---- #244: missing state.json is a friendly default, NOT a schema fault ----
{
    const root = makeRoot(null);
    const r = runRoot(root, `
        const brain = require(require('path').join(${JSON.stringify(REPO)}, 'lib', 'brain.js'));
        const current = brain.getCurrentBrain ? brain.getCurrentBrain() : brain.currentBrain();
        console.log(JSON.stringify({ stack: brain.getStack(), current: current }));
    `);
    check('#244: fresh install boots with NO schema-fault banner', r.stderr.indexOf('schema fault') === -1, r.stderr.slice(0, 200));
    check('#244: the boot emits the honest fresh-install line instead', stdoutHasFresh(r.stdout) === true, r.stdout.slice(0, 200));
    let d = null;
    try { d = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { /* surfaced below */ }
    check('#244: fresh defaults still apply (stack [vant], current vant)', d && JSON.stringify(d.stack) === JSON.stringify(['vant']) && d.current === 'vant', d ? JSON.stringify(d) : r.stdout.slice(0, 200));
    fs.rmSync(root, { recursive: true, force: true });
}

// ---- #244: a REAL corrupt file still faults loudly — with the cause in full ----
{
    const root = makeRoot(null);
    fs.writeFileSync(path.join(root, 'models', 'state.json'), '{"stack":["vant"],"current":"BROKEN');
    const r = runRoot(root, `
        const brain = require(require('path').join(${JSON.stringify(REPO)}, 'lib', 'brain.js'));
        console.log(JSON.stringify({ ok: true }));
    `);
    const err = r.stderr || '';
    check('#244: corrupt content still faults loudly (schema fault kept)', err.indexOf('schema fault') !== -1, err.slice(0, 200));
    check('#244: the fault names the true cause (invalid JSON, not a read error)', err.indexOf('invalid JSON') !== -1, err.slice(0, 200));
    // The full-message law: an JSON.stringify offender NEVER truncates
    // mid-string (it always closes its quoting quote).
    check('#244: the named cause is not truncated mid-path (closing quote intact)', /:\s*"[^"]*"\s*\(refused/.test(err), err.slice(0, 220));
    fs.rmSync(root, { recursive: true, force: true });
}

// helper: the fresh-install info line lands on stdout (console.log)
function stdoutHasFresh(stdout) {
    return stdout.indexOf('state.json missing (fresh install)') !== -1;
}

console.log(`\nbrain-state-243-244: ${failures === 0 ? 'ALL PINS PASS' : `${failures} pin(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
