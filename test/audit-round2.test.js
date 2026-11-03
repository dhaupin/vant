#!/usr/bin/env node
'use strict';

/**
 * Round-2 audit pins (brain pipeline shadow + phantom error codes).
 *
 * Run: node test/audit-round2.test.js  (picked up by test/run-all.js)
 *
 *   A. lib/brain.js executePipeline declared `const errors = []`, shadowing
 *      the module-level `const errors = require('./error')`. The pipeline-
 *      blocked refusal then read `errors.VantError` off an ARRAY, so a denied
 *      capability on a critical handler (sandbox) escaped as
 *      `TypeError: Cannot read properties of undefined (reading 'VantError')`
 *      instead of the coded VantError the contract promises. Fix: rename the
 *      local to handlerErrors.
 *
 *   B. 28 code names were referenced as errors.CODES.<NAME> but never existed
 *      in lib/error.js CODES, so 59 typed refusals degraded to code UNKNOWN
 *      (the class wave 13 fixed for encrypt.js). Fix: add the names; remove
 *      the `|| '<literal>'` masking fallbacks that hid it.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const brain = require(path.join(ROOT, 'lib', 'brain'));
const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
const errors = require(path.join(ROOT, 'lib', 'error'));

let failures = 0;
function check(name, ok, detail) {
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `: ${detail}`}`);
}

// ---- A. executePipeline: a denied capability on the critical `sandbox`
//         handler throws a CODED VantError, never a bare TypeError.
(async () => {
    const prev = sandbox.defaultSandbox.getCapabilities
        ? sandbox.defaultSandbox.getCapabilities()
        : null;
    let thrown = null;
    try {
        sandbox.defaultSandbox.setCapabilities({ canRead: false });
        await brain.executePipeline('private', { name: 'shadow-probe' }, async () => 'ok');
    } catch (e) {
        thrown = e;
    } finally {
        if (prev) sandbox.defaultSandbox.setCapabilities(prev);
    }
    check('A1: denied capability on critical handler throws (not swallowed)',
        thrown !== null, 'no error escaped the pipeline');
    check('A2: refusal is a VantError, not a TypeError',
        thrown instanceof errors.VantError,
        thrown ? `${thrown.name}: ${thrown.message}` : 'no error');
    check('A3: refusal carries the coded BRAIN_PIPELINE_BLOCKED',
        !!thrown && thrown.code === errors.CODES.BRAIN_PIPELINE_BLOCKED,
        thrown ? `code=${JSON.stringify(thrown.code)}` : 'no error');

    // ---- B. every errors.CODES.<NAME> reference resolves.
    const defined = new Set(Object.keys(errors.CODES || {}));
    const files = [];
    for (const d of ['lib', 'bin']) {
        for (const f of fs.readdirSync(path.join(ROOT, d))) {
            if (f.endsWith('.js')) files.push(path.join(ROOT, d, f));
        }
    }
    const missing = new Set();
    for (const file of files) {
        const src = fs.readFileSync(file, 'utf8');
        for (const m of src.matchAll(/errors\.CODES\.([A-Z0-9_]+)/g)) {
            if (!defined.has(m[1])) missing.add(m[1]);
        }
    }
    check('B1: no errors.CODES.<NAME> reference is undefined',
        missing.size === 0,
        `undefined codes: ${[...missing].sort().join(', ')}`);

    // The masking fallbacks are the tell: a `|| '<literal>'` beside a CODES
    // read means the name was known to be absent. (A bare `|| e.code === …`
    // is a boolean comparison, not a fallback — quote required.)
    const masked = [];
    for (const file of files) {
        const src = fs.readFileSync(file, 'utf8');
        for (const m of src.matchAll(/errors\.CODES\.[A-Z0-9_]+\s*\|\|\s*['"]/g)) {
            masked.push(`${path.relative(ROOT, file)}: ${m[0].trim()}`);
        }
    }
    check('B2: no errors.CODES.<NAME> || fallback masking a missing code',
        masked.length === 0, masked.join('; '));

    // ---- C. vaf.validateSafePath: containment must be segment-wise, not a
    //         raw string prefix. A sibling dir sharing the prefix escaped,
    //         and the PATH_OUTSIDE_ALLOWED_DIRECTORY refusal was unreachable
    //         (the local try/catch swallowed it into INVALID_PATH).
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    const base = path.join(ROOT, 'models', 'private', 'vant');
    const vafCases = [
        ['C1: sibling prefix outside the root is refused',
            path.join(ROOT, 'models', 'private', 'vant-evil', 'x.md'), 'PATH_OUTSIDE_ALLOWED_DIRECTORY'],
        ['C2: a path in another tree is refused',
            path.join(ROOT, 'models', 'private', 'other', 'x.md'), 'PATH_OUTSIDE_ALLOWED_DIRECTORY'],
        ['C3: a real child path is accepted', path.join(base, 'x.md'), null],
    ];
    for (const [name, p, want] of vafCases) {
        let got = null;
        try { vaf.validateSafePath(p, base); } catch (e) { got = e.code; }
        check(name, got === want, `expected code=${want}, got ${JSON.stringify(got)}`);
    }

    // ---- D. Persisted config can hold raw secrets (mcp.apiKey, github.token);
    //         it must not be world-readable. Exercised in a throwaway root so
    //         the repo's own models/ tree is untouched.
    const os = require('os');
    const { spawnSync } = require('child_process');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-r2-perm-'));
    fs.mkdirSync(path.join(root, 'models', 'private', 'vant'), { recursive: true });
    spawnSync(process.execPath, [path.join(ROOT, 'bin', 'config.js'), 'set', 'mcp.apiKey', 'r2-perm-probe'],
        { cwd: root, encoding: 'utf8', env: Object.assign({}, process.env, { VANT_AUTH_KEY: '', VANT_API_KEY: '', VANT_MCP_API_KEY: '' }) });
    const cfgPath = path.join(root, 'models', 'private', 'vant', 'config.json');
    let cfgMode = null;
    try { cfgMode = fs.statSync(cfgPath).mode & 0o777; } catch (e) { /* missing */ }
    check('D1: persisted config.json is owner-only (0600), not world-readable',
        cfgMode === 0o600, `mode=${cfgMode === null ? 'missing' : cfgMode.toString(8)}`);
    fs.rmSync(root, { recursive: true, force: true });

    // ---- E. A symlinked directory INSIDE the allowed root is a lexical
    //         containment pass but a real escape: link -> outside, then
    //         link/secret.txt. Both vaf.validateSafePath and the storage
    //         containment check must refuse the traversal. The probe lives
    //         under the repo's models tree — /tmp is itself a blocked prefix.
    const symRoot = fs.mkdtempSync(path.join(ROOT, 'models', 'private', 'r2sym-'));
    fs.mkdirSync(path.join(symRoot, 'root'), { recursive: true });
    fs.mkdirSync(path.join(symRoot, 'outside'), { recursive: true });
    fs.writeFileSync(path.join(symRoot, 'outside', 'secret.txt'), 'x');
    fs.symlinkSync(path.join(symRoot, 'outside'), path.join(symRoot, 'root', 'link'));
    const inner = path.join(symRoot, 'root');
    let symVaf = null;
    try { vaf.validateSafePath(path.join(inner, 'link', 'secret.txt'), inner); } catch (e) { symVaf = e.code; }
    check('E1: vaf refuses a path through a symlinked component',
        symVaf === 'PATH_OUTSIDE_ALLOWED_DIRECTORY', `code=${JSON.stringify(symVaf)}`);
    const Storage = require(path.join(ROOT, 'lib', 'storage')).FileStorage;
    const symStore = new Storage({ basePath: symRoot });
    let symStoreErr = null;
    try { symStore.write('root/link/escaped.txt', 'pwned'); } catch (e) { symStoreErr = e.code || e.message; }
    const escapedLanded = fs.existsSync(path.join(symRoot, 'outside', 'escaped.txt'));
    // Any refusal code is acceptable here (a capability gate may answer first
    // depending on the process); the property under test is that the write is
    // refused AND no byte lands outside the root.
    check('E2: storage refuses a write through a symlinked component (nothing lands outside)',
        symStoreErr !== null && !escapedLanded,
        `refused=${JSON.stringify(symStoreErr)} escaped=${escapedLanded}`);
    // Pin the containment check itself, so the specific symlink refusal is
    // exercised even when a capability gate short-circuits write().
    let contErr = null;
    try { symStore._checkContainment(path.join(symRoot, 'root', 'link', 'escaped.txt')); } catch (e) { contErr = e.code; }
    check('E3: store containment refuses a symlinked component with SECURITY_SYMLINK_ATTACK',
        contErr === 'SECURITY_SYMLINK_ATTACK', `code=${JSON.stringify(contErr)}`);
    fs.rmSync(symRoot, { recursive: true, force: true });

    // ---- F. Door verb classification: a tool whose name ends in the read
    //         suffix `_state` but whose handler STORES must not be read-class.
    //         `vant_memory_state` ("Store state (key-value with TTL)") rode
    //         the read canon and an observer guest (no canWrite) could reach
    //         it. Every other memory verb is write-class.
    const guests = require(path.join(ROOT, 'lib', 'guests'));
    check('F1: vant_memory_state is write-class, not read (it stores)',
        guests.classifyTool('vant_memory_state') === 'write',
        `class=${guests.classifyTool('vant_memory_state')}`);
    const observer = { isGuest: true, guest: { id: 'g-obs', role: 'observer' }, caps: ['canRead', 'canLoad', 'canList'] };
    const obsGate = guests.authorize('vant_memory_state', observer);
    check('F2: an observer guest is refused vant_memory_state (no canWrite)',
        obsGate.allowed === false, `allowed=${obsGate.allowed} code=${obsGate.reasonCode}`);
    // brain_state is a genuine read (getNeuronState) and must stay read.
    check('F3: brain_state stays read-class (a real read)',
        guests.classifyTool('brain_state') === 'read',
        `class=${guests.classifyTool('brain_state')}`);

    // ---- G. maskIfSecret (the CLI/door secret masker) had two defects: the
    //         substring match was case-SENSITIVE (so `Slack.Token` was
    //         immutable at the door yet echoed in cleartext), and it called
    //         value.substring() on any truthy value (numbers/booleans threw).
    const cfg = require(path.join(ROOT, 'lib', 'config'));
    check('G1: maskIfSecret masks a case-variant secret key (Slack.Token)',
        String(cfg.maskIfSecret('Slack.Token', 'supersecretvalue')).includes('****'),
        `-> ${JSON.stringify(cfg.maskIfSecret('Slack.Token', 'supersecretvalue'))}`);
    let threw = null;
    let numMask = null;
    try { numMask = cfg.maskIfSecret('x.token', 12345); } catch (e) { threw = e.message; }
    check('G2: maskIfSecret does not throw on a non-string value (number token)',
        threw === null && String(numMask).includes('****'), `threw=${threw} -> ${JSON.stringify(numMask)}`);
    check('G3: maskIfSecret leaves a non-secret key untouched',
        cfg.maskIfSecret('plain.key', 'ok') === 'ok',
        `-> ${JSON.stringify(cfg.maskIfSecret('plain.key', 'ok'))}`);

    console.log(`\n${failures === 0 ? '✓ all pins hold' : `✗ ${failures} pin(s) failed`}`);
    process.exit(failures === 0 ? 0 : 1);
})();
