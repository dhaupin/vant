#!/usr/bin/env node
/**
 * RLS Hookups Tests (pass 90)
 *
 * Covers the pass-90 enforcement-vapor fixes:
 *   1. habitat.canSync() — sync core, parity with async can().
 *   2. rls.assertSync() — inline throw-on-deny (RLS_DENIED), the missing
 *      link that made every fire-and-forget carrier check vapor.
 *   3. config.saveBrainConfig — explicit userCtx enforces (E_RLS), the old
 *      empty-ctx-into-dropped-promise branch was dead code.
 *   4. audit per-context readers — userCtx no longer dropped on the floor
 *      (policy restriction + denied ctx throws, admin passes).
 *   5. cache — mis-bound can(ctx,...) regression (userCtx'd get() used to
 *      throw EFORBIDDEN), set() RLS gate, _cacheLock survives a denial.
 *   6. teams.createOrg — explicit denied ctx returns {code:'E_RLS'},
 *      anonymous internal actuator op still allowed.
 *
 * ISOLATION: scratch brain (VANT_BRAIN) + tmpdir teams store so habitat
 * policies and ledger writes never touch a real brain. run-all executes
 * every suite in its own process, so the env override cannot leak.
 */

const SCRATCH_BRAIN = 'p90-rls-hookups-test';
process.env.VANT_BRAIN = SCRATCH_BRAIN;

const os = require('os');
const path = require('path');

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

async function main() {
    console.log('\n\ud83d\udd12 RLS HOOKUPS TESTS (pass 90)\n');
    console.log('  (scratch brain: ' + SCRATCH_BRAIN + ')');

    const habitat = require(path.join(__dirname, '..', 'lib', 'habitat'));
    const h = habitat.getShared();
    await habitat.getSharedReady();
    const rls = require(path.join(__dirname, '..', 'lib', 'rls'));
    const sandbox = require(path.join(__dirname, '..', 'lib', 'sandbox'));

    // ---------- 1. habitat canSync ----------
    console.log('\n  habitat.canSync (sync decision core):');

    await test('canSync matches async can() for allowed admin write', async () => {
        const a = await h.can({ roles: ['admin'] }, '_brain:identity', 'write');
        const b = h.canSync({ roles: ['admin'] }, '_brain:identity', 'write');
        return a === true && b === true;
    });

    await test('canSync matches async can() for denied anonymous write', async () => {
        const a = await h.can({}, '_brain:identity', 'write');
        const b = h.canSync({}, '_brain:identity', 'write');
        return a === false && b === false;
    });

    await test('canSync denies cross-container context (containerAdmits parity)', () => {
        return h.canSync({ workspace: 'other' }, 'some-resource', 'read') === false;
    });

    // ---------- 2. rls.assertSync ----------
    console.log('\n  rls.assertSync (inline enforcement):');

    await test('assertSync allows admin write', () => {
        return rls.assertSync({ roles: ['admin'] }, 'team:org', 'write') === true;
    });

    await test('assertSync THROWS RLS_DENIED for denied write (before the op runs)', () => {
        let code = null;
        try {
            rls.assertSync({ roles: [] }, 'team:org', 'write');
        } catch (e) {
            code = e.code;
        }
        return code === 'RLS_DENIED';
    });

    await test('assertSync allows public read under default policy', () => {
        return rls.assertSync({}, 'anything', 'read') === true;
    });

    // ---------- 3. config.saveBrainConfig ----------
    console.log('\n  config.saveBrainConfig (explicit-ctx enforcement):');

    await test('admin context write succeeds', () => {
        const r = require(path.join(__dirname, '..', 'lib', 'config'))
            .saveBrainConfig('vant', { p90probe: 1 }, { userCtx: { roles: ['admin'] } });
        return r === true;
    });

    await test('denied context write returns E_RLS (was dead-code branch)', () => {
        const r = require(path.join(__dirname, '..', 'lib', 'config'))
            .saveBrainConfig('vant', { p90probe: 2 }, { userCtx: { roles: [] } });
        return r && r.code === 'E_RLS';
    });

    await test('anonymous internal write still allowed (explicit-ctx convention)', () => {
        const r = require(path.join(__dirname, '..', 'lib', 'config'))
            .saveBrainConfig('vant', { p90probe: 3 });
        return r === true;
    });

    // ---------- 4. audit per-context readers ----------
    console.log('\n  audit per-context RLS (userCtx no longer dropped):');

    await test('query with restricted policy + denied ctx throws RLS_DENIED', () => {
        const audit = require(path.join(__dirname, '..', 'lib', 'audit'));
        h.setPolicy('_audit:query', { readableBy: ['role:admin'] });
        let code = null;
        try {
            audit.query({}, { roles: [] });
        } catch (e) {
            code = e.code;
        }
        return code === 'RLS_DENIED';
    });

    await test('query with restricted policy + admin ctx passes', () => {
        const audit = require(path.join(__dirname, '..', 'lib', 'audit'));
        return Array.isArray(audit.query({}, { roles: ['admin'] }));
    });

    await test('anonymous (no ctx) audit read keeps capability-check-only path', () => {
        const audit = require(path.join(__dirname, '..', 'lib', 'audit'));
        return Array.isArray(audit.query({}));
    });

    // ---------- 5. cache ----------
    console.log('\n  cache (mis-bind regression + set gate + lock liveness):');

    await test('get with userCtx no longer mis-binds into EFORBIDDEN', () => {
        const Cache = require(path.join(__dirname, '..', 'lib', 'cache')).Cache;
        const c = new Cache();
        c._cache.set('k', 'v');  // seed directly: pre-gate placement
        return c.get('k', { userCtx: { roles: ['admin'] } }) === 'v';
    });

    await test('set with denied ctx throws RLS_DENIED (write gate now exists)', async () => {
        const Cache = require(path.join(__dirname, '..', 'lib', 'cache')).Cache;
        const c = new Cache();
        let code = null;
        try {
            await c.set('k1', 'v', { userCtx: { roles: [] } });
        } catch (e) {
            code = e.code;
        }
        return code === 'RLS_DENIED';
    });

    await test('lock survives a denial (poisoned _cacheLock regression)', async () => {
        const Cache = require(path.join(__dirname, '..', 'lib', 'cache')).Cache;
        const c = new Cache();
        try { await c.set('bad', 'v', { userCtx: { roles: [] } }); } catch (e) { /* denied */ }
        await c.set('good', 'v2');
        return c.get('good') === 'v2';
    });

    await test('admin set succeeds end to end', async () => {
        const Cache = require(path.join(__dirname, '..', 'lib', 'cache')).Cache;
        const c = new Cache();
        const r = await c.set('admin-k', 'v', { userCtx: { roles: ['admin'] } });
        return !!r && c.get('admin-k', { userCtx: { roles: ['admin'] } }) === 'v';
    });

    // ---------- 6. teams explicit-ctx enforcement ----------
    console.log('\n  teams.createOrg (E_RLS on denied ctx):');

    await test('denied ctx createOrg returns E_RLS', () => {
        const config = require(path.join(__dirname, '..', 'lib', 'config'));
        config.set('teams.store', path.join(os.tmpdir(), 'p90-teams-' + Date.now() + '.json'));
        sandbox.setCapabilities({ canWrite: true });
        const teams = require(path.join(__dirname, '..', 'lib', 'teams'));
        const r = teams.createOrg('P90 Deny Org', { userCtx: { roles: [] } });
        return r && r.code === 'E_RLS';
    });

    await test('admin ctx createOrg succeeds', () => {
        const teams = require(path.join(__dirname, '..', 'lib', 'teams'));
        const r = teams.createOrg('P90 Admin Org', { userCtx: { roles: ['admin'] } });
        return !!r && !!r.id;
    });

    await test('anonymous internal createOrg still allowed (genesis flow)', () => {
        const teams = require(path.join(__dirname, '..', 'lib', 'teams'));
        const r = teams.createOrg('P90 Internal Org');
        return !!r && !!r.id;
    });

    console.log(`\n  ${results.passed} passed, ${results.failed} failed`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
