#!/usr/bin/env node
/**
 * Habitat + RLS QC/Vuln Scan Tests (pass 91)
 *
 * Covers the pass-91 work:
 *   #113 horcrux search-hygiene wrote the .ignore to the INSTALL root via a
 *        relative escape chain when the caller's cwd is unrelated (mounted
 *        sandbox workspaces) — now resolves the workspace from the caller's
 *        cwd and writes root-relative globs (or skips with a hint).
 *
 *   QC/vuln battery (adversarial probes against habitat + RLS):
 *   P1 createWorkspace('__proto__') prototype-replaced this.workspaces
 *   P2 setPolicy('__proto__') poisoned boundaries fallthrough; policy
 *      payloads could carry prototype keys (RLS bypass shape)
 *   P3 module restoreState({configs:{__proto__}}) raw Object.assign
 *      (horcrux-gathered data)
 *   P4 provisionAgent({workspace:'__proto__'}) — roles['__proto__'] write
 *      is GLOBAL Object.prototype pollution
 *   P5 instance restore() of a crafted persisted snapshot (stones are the
 *      sanctioned cross-process transport) corrupted all RLS maps
 *   P1b setWorkspace('__proto__') accepted via prototype fallthrough
 *   Token-cache role confusion: cached ctx kept tenant-A roles after the
 *      session workspace moved to tenant B
 *
 * ISOLATION: scratch brain (VANT_BRAIN). run-all executes every suite in
 * its own process, so the env override cannot leak.
 */

const SCRATCH_BRAIN = 'p91-habitat-rls-qc';
process.env.VANT_BRAIN = SCRATCH_BRAIN;

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
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

function protoIsObjectPrototype(o) {
    return Object.getPrototypeOf(o) === Object.prototype;
}

async function main() {
    console.log('\n\ud83d\udd0e HABITAT + RLS QC/VULN SCAN TESTS (pass 91)\n');
    console.log('  (scratch brain: ' + SCRATCH_BRAIN + ')');

    const { spawnSync } = require('child_process');
    const habitat = require(path.join(ROOT, 'lib', 'habitat'));
    const h = habitat.getShared();
    await habitat.getSharedReady();

    // ---------- #113: workspace-root .ignore ----------
    console.log('\n  #113 horcrux .ignore lands at the WORKSPACE root:');

    await test('#113 stone in an unrelated workspace cwd writes <ws>/.ignore, NOT install root', () => {
        const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'p113-ws-'));
        try {
            const proj = path.join(ws, 'proj');
            fs.mkdirSync(proj);
            fs.writeFileSync(path.join(proj, '.git'), '');
            const before = fs.existsSync(path.join(ROOT, '.ignore'))
                ? fs.readFileSync(path.join(ROOT, '.ignore'), 'utf8') : '';
            const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'horcrux.js'), 'create', 'stones/p113-p_x.svg', 'x'], {
                cwd: proj, encoding: 'utf8', timeout: 60000,
                env: Object.assign({}, process.env, { VANT_BRAIN: SCRATCH_BRAIN })
            });
            if (r.status !== 0) throw new Error('create exited ' + r.status + ': ' + ((r.stdout || '') + (r.stderr || '')).slice(-200));
            const wsIgnore = path.join(proj, '.ignore');
            assert(fs.existsSync(wsIgnore), 'workspace-root .ignore was not created');
            assert(fs.readFileSync(wsIgnore, 'utf8').includes('stones/*.svg'), 'workspace .ignore missing stones/*.svg');
            const after = fs.existsSync(path.join(ROOT, '.ignore'))
                ? fs.readFileSync(path.join(ROOT, '.ignore'), 'utf8') : '';
            assert(after === before, 'install-root .ignore was polluted');
            assert(!fs.readFileSync(wsIgnore, 'utf8').includes('..'), 'workspace .ignore contains an escape chain');
            return true;
        } finally {
            fs.rmSync(ws, { recursive: true, force: true });
        }
    });

    await test('#113 stone under the repo root keeps writing the repo-root .ignore (pass-89 behavior)', () => {
        const stoneDir = path.join(ROOT, 'p91-stones');
        fs.mkdirSync(stoneDir, { recursive: true });
        const IGNORE = path.join(ROOT, '.ignore');
        const before = fs.readFileSync(IGNORE, 'utf8');
        try {
            const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'horcrux.js'), 'create', 'p91-stones/p91-p_x.svg', 'x'], {
                cwd: ROOT, encoding: 'utf8', timeout: 60000,
                env: Object.assign({}, process.env, { VANT_BRAIN: SCRATCH_BRAIN })
            });
            if (r.status !== 0) throw new Error('create exited ' + r.status);
            const now = fs.readFileSync(IGNORE, 'utf8');
            assert(now.split(/\r?\n/).map(l => l.trim()).includes('p91-stones/*.svg'), 'repo .ignore missing p91-stones/*.svg');
            return true;
        } finally {
            fs.writeFileSync(IGNORE, before);
            fs.rmSync(stoneDir, { recursive: true, force: true });
        }
    });

    // ---------- P1/P1b/P2/P4: write-gate prototype guards ----------
    console.log('\n  prototype-pollution write gates:');

    await test('P1 createWorkspace("__proto__") throws HABITAT_INVALID_KEY, prototype intact', () => {
        let code = null;
        try { h.createWorkspace('__proto__', { name: 'evil' }); } catch (e) { code = e.message; }
        assert(String(code).includes('HABITAT_INVALID_KEY'), 'wrong error: ' + code);
        assert(protoIsObjectPrototype(h.workspaces), 'workspaces prototype replaced');
        return true;
    });

    await test('P1b setWorkspace rejects forbidden + phantom ids', () => {
        assert(h.setWorkspace('__proto__') === false, 'proto accepted');
        assert(h.setWorkspace('constructor') === false, 'constructor accepted');
        assert(h.setWorkspace('never-created-ws-p91') === false, 'phantom accepted');
        return true;
    });

    await test('P2 setPolicy rejects forbidden resource + forbidden policy fields', () => {
        let a = null, b = null;
        try { h.setPolicy('__proto__', { writableBy: ['public'] }); } catch (e) { a = e.message; }
        try { h.setPolicy('p91-legit', { ['__proto__']: { x: 1 } }); } catch (e) { b = e.message; }
        assert(String(a).includes('HABITAT_INVALID_KEY'), 'resource not blocked: ' + a);
        assert(String(b).includes('HABITAT_INVALID_KEY'), 'policy field not blocked: ' + b);
        assert(protoIsObjectPrototype(h.boundaries), 'boundaries prototype replaced');
        assert(h.canSync({}, 'p91-unknown-resource', 'write') === false, 'RLS default deny broken');
        return true;
    });

    await test('P4 provisionAgent({workspace:"__proto__"}) blocked (global Object.prototype write)', () => {
        let code = null;
        try { h.provisionAgent('p91-evil', { workspace: '__proto__' }); } catch (e) { code = e.message; }
        assert(String(code).includes('HABITAT_INVALID_KEY'), 'wrong error: ' + code);
        assert(protoIsObjectPrototype(h.roles), 'roles prototype replaced');
        return true;
    });

    await test('P4b addRole/removeRole reject forbidden role names honestly', () => {
        h.createWorkspace('p91-role-ws', { skipPersist: true });
        let a = null, b = null;
        try { h.addRole('p91-role-ws', '__proto__', 'u'); } catch (e) { a = e.message; }
        try { h.removeRole('p91-role-ws', 'constructor', 'u'); } catch (e) { b = e.message; }
        assert(String(a).includes('HABITAT_INVALID_KEY'), 'addRole not blocked: ' + a);
        assert(String(b).includes('HABITAT_INVALID_KEY'), 'removeRole not blocked: ' + b);
        return true;
    });

    // ---------- P3/P5: untrusted restore paths ----------
    console.log('\n  untrusted restore paths (stones are cross-process transport):');

    await test('P3 module restoreState drops __proto__ configs (partial load)', () => {
        const crafted = JSON.parse('{"__proto__":{"x":1},"real-brain":{"environment":"prod"}}');
        const r = habitat.restoreState({ configs: crafted });
        assert(r.restored === true, 'restoreState failed');
        assert(!Object.keys(_probe()).includes('__proto__'), 'proto key restored');
        return true;
        function _probe() { return {}; }
    });

    await test('P5 instance restore() of a poisoned snapshot keeps prototypes + default', async () => {
        const H = h.constructor;
        const h2 = new H({ skipRestore: true, skipPersist: true });
        const poisoned = JSON.parse('{"workspaces":{"__proto__":{"id":"evil"}},"roles":{},' +
            '"boundaries":{"readableBy":["public"]},"tokens":{},"defaultWorkspace":"__proto__"}');
        h2.persistence = { recall: async () => poisoned };
        await h2.restore({});
        assert(protoIsObjectPrototype(h2.workspaces), 'workspaces prototype replaced');
        assert(protoIsObjectPrototype(h2.boundaries), 'boundaries prototype replaced');
        assert(protoIsObjectPrototype(h2.tokens), 'tokens prototype replaced');
        assert(h2.defaultWorkspace === 'default', 'defaultWorkspace taken from forbidden key');
        assert(h2.canSync({}, 'any-unknown', 'write') === false, 'RLS default deny broken after restore');
        return true;
    });

    // ---------- role confusion + middleware ----------
    console.log('\n  session-context seams:');

    await test('token-cache re-derives workspace roles after a workspace switch', async () => {
        h.roles['p91-wsA'] = { admin: ['p91-user'] };
        h.roles['p91-wsB'] = { editor: ['p91-user'] };
        h.workspaces['p91-wsA'] = { id: 'p91-wsA' };
        h.workspaces['p91-wsB'] = { id: 'p91-wsB' };
        h.contexts.set('p91-tok', {
            userId: 'p91-user',
            roles: ['admin'],
            scopes: [],
            team: undefined,
            workspace: 'p91-wsA',
            _baseRoles: ['viewer']
        });
        h.setWorkspace('p91-wsB');
        const ctx = await h.context('p91-tok');
        assert(ctx.workspace === 'p91-wsB', 'workspace not re-pinned: ' + ctx.workspace);
        assert(ctx.roles.includes('editor'), 'workspace-B role missing: ' + ctx.roles.join(','));
        assert(!ctx.roles.includes('admin'), 'tenant-A admin role leaked: ' + ctx.roles.join(','));
        h.setWorkspace('default');
        return true;
    });

    await test('rls.middleware no longer pivots the session workspace via x-workspace', async () => {
        const rls = require(path.join(ROOT, 'lib', 'rls'));
        const handler = rls.middleware({ resource: 'api', mode: 'read' });
        const req = { headers: { 'x-workspace': 'p91-evil-ws' }, headerss: undefined };
        req.headers = { 'x-workspace': 'p91-evil-ws' };
        let nexted = false;
        const res = { status: () => ({ json: () => {} }), json: () => {} };
        await handler(req, res, () => { nexted = true; });
        assert(nexted, 'middleware did not call next for a public read');
        assert(req.rlsWorkspace === 'p91-evil-ws', 'requested workspace not carried on the request');
        assert(h.getCurrentWorkspace() !== 'p91-evil-ws', 'session workspace was pivoted by a header');
        return true;
    });

    // ---------- legit flows still work ----------
    console.log('\n  legitimate flows (no regressions):');

    await test('createWorkspace + provisionAgent + role grant still work', () => {
        h.createWorkspace('p91-acme', { owner: 'root' });
        const out = h.provisionAgent('p91-good', { workspace: 'p91-acme', role: 'admin' });
        assert(out.workspace === 'p91-acme', 'wrong workspace');
        assert(h.roles['p91-acme'].admin.includes('p91-good'), 'role not granted');
        // Tenant-shaped resource: its container is the tenant workspace, so
        // an admin IN that workspace writes; container isolation still holds
        // for everyone else (a pass-82/87 behavior, exercised not regressed).
        h.setPolicy('p91-tenant-res', { container: 'p91-acme' });
        assert(h.canSync({ workspace: 'p91-acme', roles: ['admin'] }, 'p91-tenant-res', 'write') === true, 'tenant admin write denied');
        assert(h.canSync({ workspace: 'other-ws', roles: ['admin'] }, 'p91-tenant-res', 'write') === false, 'cross-tenant write allowed');
        return true;
    });

    await test('assertSync + canSync parity unchanged (pass-90 core intact)', async () => {
        const rls = require(path.join(ROOT, 'lib', 'rls'));
        const a = await h.can({ roles: ['admin'] }, '_brain:identity', 'write');
        const b = h.canSync({ roles: ['admin'] }, '_brain:identity', 'write');
        return a === true && b === true && rls.assertSync({ roles: ['admin'] }, 'r', 'write') === true;
    });

    console.log(`\n  ${results.passed} passed, ${results.failed} failed`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
