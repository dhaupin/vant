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
    // has()/list() skipped containment entirely — has() answered `true` for a
    // path outside the store through the symlink (an existence oracle), and
    // list() enumerated the outside dir. Both now fail closed.
    let hasLeak = null;
    try { hasLeak = symStore.has('root/link/secret.txt'); } catch (e) { hasLeak = 'threw:' + e.code; }
    check('E4: storage.has() refuses a symlinked-component path (no existence oracle)',
        hasLeak === false, `-> ${JSON.stringify(hasLeak)}`);
    let listLeak = null;
    try { listLeak = symStore.list('root/link/*'); } catch (e) { listLeak = 'threw:' + e.code; }
    check('E5: storage.list() refuses a symlinked-component dir (no enumeration escape)',
        Array.isArray(listLeak) && listLeak.length === 0, `-> ${JSON.stringify(listLeak)}`);
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
    check('G4: redactSecrets masks nested secret leaves without mutating the input',
        (() => {
            const src = { github: { token: 'ghp_x' }, mcp: { apiKey: 'k' }, ok: { plain: 'v' } };
            const out = cfg.redactSecrets(src);
            return out.github.token.includes('****') && out.mcp.apiKey.includes('****')
                && out.ok.plain === 'v' && src.github.token === 'ghp_x';
        })(), `-> ${JSON.stringify(cfg.redactSecrets({ github: { token: 'ghp_x' } }))}`);
    check('G5: redactSecrets masks secret leaves buried deep and inside arrays',
        (() => {
            const out = cfg.redactSecrets({ providers: { github: { token: 'ghp_deep' } }, keys: [{ apiKey: 'k_arr' }] });
            return out.providers.github.token.includes('****') && out.keys[0].apiKey.includes('****');
        })(), `-> ${JSON.stringify(cfg.redactSecrets({ providers: { github: { token: 'ghp_deep' } }, keys: [{ apiKey: 'k_arr' }] }))}`);

    // ---- H. The read-class, capless `vant_storage_read` door served the
    //         persisted config file (models/private/*/config.json) VERBATIM,
    //         leaking github.token / mcp.apiKey in cleartext — bypassing both
    //         the config door's mask and the CLI mask added in G. An observer
    //         guest reaches this door, so the raw read is a disclosure.
    //         Run in a child process: the file-store singleton anchors its
    //         basePath to process.cwd() at first use.
    const HROOT = fs.mkdtempSync(path.join(ROOT, 'models', 'private', 'r2h-'));
    try {
        fs.mkdirSync(path.join(HROOT, 'models', 'private', 'vant'), { recursive: true });
        fs.writeFileSync(path.join(HROOT, 'models', 'private', 'vant', 'config.json'),
            JSON.stringify({ github: { token: 'ghp_SECRET_DO_NOT_LEAK_0001' }, mcp: { apiKey: 'vant_key_do_not_leak_0002' } }));
        fs.mkdirSync(path.join(HROOT, 'models', 'private', 'other'), { recursive: true });
        const plainBody = JSON.stringify({ hello: 'world', n: 1 });
        fs.writeFileSync(path.join(HROOT, 'models', 'private', 'other', 'notes.json'), plainBody);
        const outFile = path.join(HROOT, 'r2-out.json');
        const probe = `
            const fs = require('fs');
            const mcp = require(${JSON.stringify(path.join(ROOT, 'lib', 'mcp'))});
            (async () => {
                const cfgRes = await Promise.resolve(mcp.call('vant_storage_read', { path: 'models/private/vant/config.json' }));
                const plainRes = await Promise.resolve(mcp.call('vant_storage_read', { path: 'models/private/other/notes.json' }));
                fs.writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({ cfg: cfgRes, plain: plainRes }));
            })().catch((e) => { fs.writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({ error: e.code || e.message })); });
        `;
        spawnSync(process.execPath, ['-e', probe], { cwd: HROOT, encoding: 'utf8' });
        // The child emits module logs on stdout, so read the result from a file
        // rather than parsing the stream.
        let out = {};
        try { out = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (e) { out = { error: 'no-child-output' }; }
        const cfgText = typeof out.cfg === 'string' ? out.cfg : JSON.stringify(out.cfg);
        check('H1: vant_storage_read does not leak a config-file secret in cleartext',
            !cfgText.includes('ghp_SECRET_DO_NOT_LEAK_0001') && !cfgText.includes('vant_key_do_not_leak_0002'),
            `leaked=${cfgText.includes('ghp_SECRET_DO_NOT_LEAK_0001') || cfgText.includes('vant_key_do_not_leak_0002')}`);
        check('H2: vant_storage_read still surfaces the (masked) secret key names',
            cfgText.includes('token') && cfgText.includes('apiKey') && cfgText.includes('****'),
            `-> ${cfgText.slice(0, 120)}`);
        check('H3: vant_storage_read returns a non-secret JSON file unchanged',
            out.plain === plainBody, `-> ${JSON.stringify(out.plain)}`);
    } finally {
        fs.rmSync(HROOT, { recursive: true, force: true });
    }

    // ---- I. The storage MUTATION doors (write/rm/cp) are reachable by any
    //         canWrite guest and had NO config-file protection. A brain's
    //         config.json is the auth-authority root (mcp.requireKey gates the
    //         MCP transport; mcp.apiKey is the credential it checks, both via
    //         _brainConfigValue). A guest could overwrite it to set
    //         requireKey=false / plant a known apiKey — turning the auth gate
    //         OFF — or rm it, or cp it out of the private store. The config
    //         door already refuses secret writes (E_CONFIG_SECRET_IMMUTABLE);
    //         the storage door must not be a side entrance.
    const IROOT = fs.mkdtempSync(path.join(ROOT, 'models', 'private', 'r2i-'));
    try {
        const cfgRel = 'models/private/vant/config.json';
        fs.mkdirSync(path.join(IROOT, 'models', 'private', 'vant'), { recursive: true });
        fs.writeFileSync(path.join(IROOT, cfgRel), JSON.stringify({ mcp: { apiKey: 'ORIGINAL', requireKey: true } }));
        const outFile = path.join(IROOT, 'r2i-out.json');
        const probe = `
            const fs = require('fs');
            const mcp = require(${JSON.stringify(path.join(ROOT, 'lib', 'mcp'))});
            const cfg = ${JSON.stringify(cfgRel)};
            const tryDoor = async (n, p) => { try { return { ok: true, r: await Promise.resolve(mcp.call(n, p)) }; } catch (e) { return { ok: false, reason: e.reason || e.code }; } };
            (async () => {
                const res = {
                    write: await tryDoor('vant_storage_write', { path: cfg, content: JSON.stringify({ mcp: { requireKey: false, apiKey: 'ATTACKER' } }) }),
                    rm: await tryDoor('vant_storage_rm', { path: cfg }),
                    cpOut: await tryDoor('vant_storage_cp', { src: cfg, dest: 'models/public/leak.json' }),
                    cpOver: await tryDoor('vant_storage_cp', { src: 'models/public/x.json', dest: cfg }),
                    plainWrite: await tryDoor('vant_storage_write', { path: 'models/public/ok.json', content: '{"a":1}' }),
                    intact: fs.readFileSync(cfg, 'utf8')
                };
                fs.writeFileSync(${JSON.stringify(outFile)}, JSON.stringify(res));
            })().catch((e) => fs.writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({ error: e.message })));
        `;
        spawnSync(process.execPath, ['-e', probe], { cwd: IROOT, encoding: 'utf8' });
        let out = {};
        try { out = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (e) { out = { error: 'no-child-output' }; }
        const refused = (r) => r && r.ok === false && r.reason === 'CONFIG_INVALID';
        check('I1: vant_storage_write refuses to overwrite a brain config.json', refused(out.write), `-> ${JSON.stringify(out.write)}`);
        check('I2: vant_storage_rm refuses to delete a brain config.json', refused(out.rm), `-> ${JSON.stringify(out.rm)}`);
        check('I3: vant_storage_cp refuses to copy a brain config.json OUT (exfil)', refused(out.cpOut), `-> ${JSON.stringify(out.cpOut)}`);
        check('I4: vant_storage_cp refuses to copy OVER a brain config.json', refused(out.cpOver), `-> ${JSON.stringify(out.cpOver)}`);
        check('I5: the config file is left intact and non-config writes still work',
            out.intact === JSON.stringify({ mcp: { apiKey: 'ORIGINAL', requireKey: true } }) && out.plainWrite && out.plainWrite.ok === true,
            `intact=${out.intact} plain=${JSON.stringify(out.plainWrite)}`);
    } finally {
        fs.rmSync(IROOT, { recursive: true, force: true });
    }

    // ---- J. vant_config_get on a SECTION key (`github`) returned the whole
    //         nested object; maskIfSecret inspects only the top-level key, so
    //         the raw token rode out inside the object. Deep-redact object
    //         values at the door.
    const jDoor = require(path.join(ROOT, 'lib', 'mcp'));
    const jCfg = require(path.join(ROOT, 'lib', 'config'));
    const jSecret = 'ghp_SECTION_LEAK_42';
    const savedTok = process.env.GITHUB_TOKEN;
    try {
        process.env.GITHUB_TOKEN = jSecret;
        // config.load() memoises _config; clear so the env change is seen.
        jCfg.clearCache();
        const jr = await Promise.resolve(jDoor.call('vant_config_get', { key: 'github' }));
        const jText = JSON.stringify(jr);
        check('J1: vant_config_get of a section key does not leak a nested secret',
            !jText.includes(jSecret), `-> ${jText.slice(0, 120)}`);
        check('J2: vant_config_get of a section key still returns the section shape (masked)',
            jr.value && jr.value.token && String(jr.value.token).includes('****') && 'repo' in jr.value,
            `-> ${JSON.stringify(jr.value)}`);
        const jScalar = await Promise.resolve(jDoor.call('vant_config_get', { key: 'github.token' }));
        check('J3: vant_config_get of a scalar secret key is still masked',
            !JSON.stringify(jScalar).includes(jSecret), `-> ${JSON.stringify(jScalar)}`);
    } finally {
        if (savedTok === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = savedTok;
    }

    // ---- K. The CLI `config get <section>` printed `[object Object]` (the
    //         same unreadable shape #169 fixed for `list`) AND skipped the
    //         secret mask entirely. It now deep-redacts and prints JSON.
    const kEnv = Object.assign({}, process.env, { GITHUB_TOKEN: 'ghp_CLI_SECTION_LEAK' });
    const kSection = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'config.js'), 'get', 'github'], { encoding: 'utf8', env: kEnv, cwd: ROOT });
    const kOut = (kSection.stdout || '') + (kSection.stderr || '');
    check('K1: CLI `config get <section>` does not print [object Object]',
        !kOut.includes('[object Object]'), `-> ${kOut.split('\n').find(l => l.startsWith('github='))}`);
    check('K2: CLI `config get <section>` masks the nested secret',
        !kOut.includes('ghp_CLI_SECTION_LEAK') && /github=\{[^}]*\*\*\*\*/.test(kOut),
        `-> ${kOut.split('\n').find(l => l.startsWith('github='))}`);

    // ---- L. SSRF wall bypasses in lib/network.js + the network door.
    //         (L1-L4) An IPv4-mapped/compatible/NAT64 IPv6 literal reaches
    //         the same v4 endpoint as its dotted form, but only the dotted
    //         form matched the INTERNAL_IP_PATTERNS: `127.0.0.1` refused,
    //         `[::ffff:127.0.0.1]` allowed -> loopback. (L5) resolve4 alone
    //         let a v6-only internal AAAA answer through. (L6) the MCP door
    //         forwarded caller `options` verbatim, so `skipDomainCheck:true`
    //         walked the whole wall.
    const lNet = require(path.join(ROOT, 'lib', 'network'));
    const lHost = (u) => new URL(u).hostname;
    check('L1: isInternalIP refuses an IPv4-mapped IPv6 loopback literal',
        lNet.isInternalIP(lHost('http://[::ffff:127.0.0.1]/')) === true,
        `-> ${lNet.isInternalIP(lHost('http://[::ffff:127.0.0.1]/'))}`);
    check('L2: isInternalIP refuses the hex-group mapped form [::ffff:7f00:1]',
        lNet.isInternalIP(lHost('http://[::ffff:7f00:1]/')) === true,
        `-> ${lNet.isInternalIP(lHost('http://[::ffff:7f00:1]/'))}`);
    check('L3: isInternalIP refuses a mapped cloud-metadata address',
        lNet.isInternalIP(lHost('http://[::ffff:169.254.169.254]/')) === true,
        `-> ${lNet.isInternalIP(lHost('http://[::ffff:169.254.169.254]/'))}`);
    check('L4: isInternalIP refuses a NAT64-wrapped loopback literal',
        lNet.isInternalIP(lHost('http://[64:ff9b::7f00:1]/')) === true,
        `-> ${lNet.isInternalIP(lHost('http://[64:ff9b::7f00:1]/'))}`);
    check('L5: isInternalIP still allows a genuine public host',
        lNet.isInternalIP(lHost('http://8.8.8.8/')) === false && lNet.isInternalIP('api.github.com') === false,
        `-> 8.8.8.8=${lNet.isInternalIP('8.8.8.8')}`);

    // L6: the door must pin the SSRF escape hatches even when the caller asks.
    const lDoor = require(path.join(ROOT, 'lib', 'mcp'));
    const lSb = require(path.join(ROOT, 'lib', 'sandbox'));
    const lSrv = require('http').createServer((q, r) => r.end('INTERNAL'));
    await new Promise((res) => lSrv.listen(0, '127.0.0.1', res));
    const lPort = lSrv.address().port;
    const lPrevCaps = lSb.defaultSandbox.getCapabilities ? lSb.defaultSandbox.getCapabilities() : null;
    try {
        if (typeof lSb.defaultSandbox.setCapabilities === 'function') {
            lSb.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canNetwork: true, canExec: true });
        }
        const lFetch = async (u, o) => {
            try { const r = await Promise.resolve(lDoor.call('vant_network_fetch', { url: u, options: o })); return { reached: true, body: String(r) }; }
            catch (e) { return { reached: false, msg: e.message }; }
        };
        const lPlain = await lFetch(`http://127.0.0.1:${lPort}/`);
        const lSkip = await lFetch(`http://127.0.0.1:${lPort}/`, { skipDomainCheck: true });
        const lMapped = await lFetch(`http://[::ffff:127.0.0.1]:${lPort}/`, { skipDomainCheck: true });
        const lLan = await lFetch(`http://127.0.0.1:${lPort}/`, { internalPolicy: 'privateLan' });
        check('L6: the network door refuses loopback (plain and with caller bypass options)',
            !lPlain.reached && !lSkip.reached && !lMapped.reached && !lLan.reached,
            `plain=${JSON.stringify(lPlain)} skip=${JSON.stringify(lSkip)} mapped=${JSON.stringify(lMapped)} lan=${JSON.stringify(lLan)}`);
    } finally {
        lSrv.close();
        if (lPrevCaps && typeof lSb.defaultSandbox.setCapabilities === 'function') lSb.defaultSandbox.setCapabilities(lPrevCaps);
    }

    // ---- N. The sync test-provider DI seam must be EXCLUSIVE.
    //         getConfiguredProviders() used to APPEND registered fakes to the
    //         real providers. In a working tree GITHUB_TOKEN is set and the
    //         origin remote resolves, so GitHubProvider.isConfigured() is
    //         true — a test that injected a fake therefore ALSO drove the
    //         real connector, whose commit() runs `git add -A && git commit`
    //         on the live repo. That is how a stray "p2-25 cap test" commit
    //         landed on this branch mid-audit. A registered fake must now be
    //         the ONLY provider the sync fan-out sees.
    const nSync = require(path.join(ROOT, 'lib', 'sync'));
    const nFake = { getType: () => 'n-audit-fake', isConfigured: () => true };
    nSync._setTestProvider('n-audit-fake', nFake);
    try {
        const nList = nSync.getConfiguredProviders();
        const nTypes = nList.map(p => (typeof p.getType === 'function' ? p.getType() : '?'));
        check('N1: a registered test provider is the ONLY configured provider (no real connector rides along)',
            nTypes.length === 1 && nTypes[0] === 'n-audit-fake',
            `-> ${JSON.stringify(nTypes)}`);
    } finally {
        nSync._clearTestProviders();
    }
    check('N2: with no test provider the production path is unchanged (list is an array)',
        Array.isArray(nSync.getConfiguredProviders()),
        `-> ${typeof nSync.getConfiguredProviders()}`);

    console.log(`\n${failures === 0 ? '✓ all pins hold' : `✗ ${failures} pin(s) failed`}`);
    process.exit(failures === 0 ? 0 : 1);
})();
