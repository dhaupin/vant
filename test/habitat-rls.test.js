#!/usr/bin/env node
/**
 * Habitat RLS + Agent Identity Tests (pass 82)
 *
 * Covers the pass-82 work:
 *   1. RLS core - can()/check()/evaluate()/containerAdmits() incl. the
 *      previously-vapor filter/mask policy fields.
 *   2. Agent identity - provisionAgent() idempotency, agentContext() shape,
 *      end-to-end spawn -> workspace + roles.
 *   3. Enforcement - sandbox.generateCaps fail-closed on unknown workspaces,
 *      lib/rls.js auto-claim + denial contract (RLS_DENIED).
 *
 * ISOLATION: runs against a scratch brain (VANT_BRAIN) so workspace/role
 * mutations never touch a real brain's orgchart or habitat state. run-all
 * executes every suite in its own process, so the env override cannot leak.
 */

const SCRATCH_BRAIN = 'rls-test-' + Date.now().toString(36);
process.env.VANT_BRAIN = SCRATCH_BRAIN;

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

async function main() {
    console.log('\n\ud83c\udf3f HABITAT RLS + AGENT IDENTITY TESTS (pass 82)\n');
    console.log('  (scratch brain: ' + SCRATCH_BRAIN + ')');

    const habitat = require(path.join(ROOT, 'lib', 'habitat'));
    const h = habitat.getShared();
    await habitat.getSharedReady();

    // ---------- RLS core ----------
    console.log('\n  RLS core:');

    await test('can() null context does not throw (anonymous)', async () => {
        const allowed = await h.can(null, '_brain:identity', 'read');
        assert(allowed === true, 'anonymous read of default-policy resource should be allowed, got ' + allowed);
    });

    await test('can() default policy denies anonymous write', async () => {
        const allowed = await h.can({}, '_brain:identity', 'write');
        assert(allowed === false, 'anonymous write should be denied');
    });

    await test('check() resolves true when allowed', async () => {
        assert(await h.check({}, '_brain:identity', 'read') === true, 'check read should resolve true');
    });

    await test('check() throws RLS_DENIED when denied', async () => {
        let threw = null;
        try { await h.check({}, '_brain:identity', 'write'); } catch (e) { threw = e; }
        assert(threw, 'expected denial to throw');
        assert(threw.code === 'RLS_DENIED', 'expected code RLS_DENIED, got ' + threw.code);
    });

    await test('can() denies cross-container access', async () => {
        h.setPolicy('test:tenantA', { container: 'ws-a' });
        const outsider = await h.can({ workspace: 'ws-b' }, 'test:tenantA', 'read');
        assert(outsider === false, 'cross-container read should be denied');
        const insider = await h.can({ workspace: 'ws-a', roles: ['viewer'] }, 'test:tenantA', 'read');
        // default readableBy ['public'] admits everyone inside the container
        assert(insider === true, 'same-container read should be allowed');
    });

    await test('containerAdmits() mirrors container isolation (sync)', () => {
        assert(h.containerAdmits({ workspace: 'ws-b' }, 'test:tenantA') === false, 'other container should not admit');
        assert(h.containerAdmits({ workspace: 'ws-a' }, 'test:tenantA') === true, 'same container should admit');
        assert(h.containerAdmits({}, 'test:tenantA') === true, 'no-workspace ctx admitted (policy rules decide)');
    });

    await test('evaluate() applies filter (strips fields)', async () => {
        h.setPolicy('test:filtered', { filter: ['ssn'] });
        const r = await h.evaluate({}, 'test:filtered', 'read', { name: 'a', ssn: '123' });
        assert(r.allowed === true, 'should be allowed');
        assert(r.data && r.data.name === 'a', 'name should survive');
        assert(!('ssn' in (r.data || {})), 'ssn should be filtered out');
    });

    await test('evaluate() applies mask (redacts fields)', async () => {
        h.setPolicy('test:masked', { mask: ['token'] });
        const r = await h.evaluate({}, 'test:masked', 'read', { user: 'u', token: 'sekrit' });
        assert(r.data && r.data.token === '[masked]', 'token should be masked, got ' + JSON.stringify(r.data));
        assert(r.data.user === 'u', 'user should survive');
    });

    await test('evaluate() supports function filter/mask', async () => {
        h.setPolicy('test:fns', {
            filter: (d) => ({ ...d, extra: 'added' }),
            mask: (d) => ({ ...d, extra: '[fn-masked]' })
        });
        const r = await h.evaluate({}, 'test:fns', 'read', { x: 1 });
        assert(r.data.extra === '[fn-masked]', 'filter then mask should compose, got ' + JSON.stringify(r.data));
    });

    await test('evaluate() returns allowed:false with no data on denial', async () => {
        h.setPolicy('test:adminOnly', { readableBy: ['role:admin'] });
        const r = await h.evaluate({}, 'test:adminOnly', 'read', { secret: 1 });
        assert(r.allowed === false && r.data === undefined, 'denied evaluate must not leak data');
        const ok = await h.evaluate({ roles: ['admin'] }, 'test:adminOnly', 'read', { secret: 1 });
        assert(ok.allowed === true && ok.data.secret === 1, 'admin should read through');
    });

    // ---------- Agent identity ----------
    console.log('\n  Agent identity:');

    await test('provisionAgent creates workspace + grants roles', () => {
        const r = h.provisionAgent('agent_test1', { team: 'acme', role: 'editor' });
        assert(r.workspace === 'org-acme', 'team should map to org-<team>, got ' + r.workspace);
        assert(h.workspaces['org-acme'], 'workspace should exist');
        assert(h.hasRole('org-acme', 'agent_test1', 'editor'), 'editor role should be granted');
    });

    await test('provisionAgent is idempotent (no duplicate rows)', () => {
        h.provisionAgent('agent_test1', { team: 'acme', role: 'editor' });
        h.provisionAgent('agent_test1', { team: 'acme', role: 'editor' });
        const editors = h.roles['org-acme'].editor.filter(u => u === 'agent_test1');
        assert(editors.length === 1, 'expected exactly 1 row, got ' + editors.length);
    });

    await test('provisionAgent works against explicit workspace', () => {
        const r = h.provisionAgent('agent_test2', { workspace: 'ws-explicit' });
        assert(r.workspace === 'ws-explicit' && h.workspaces['ws-explicit'], 'explicit workspace should be used/created');
    });

    await test('addRole still fails closed on unknown workspace', () => {
        let threw = null;
        try { h.addRole('no-such-ws', 'admin', 'u1'); } catch (e) { threw = e; }
        assert(threw && String(threw.message).includes('HABITAT_UNKNOWN_WORKSPACE'), 'expected HABITAT_UNKNOWN_WORKSPACE, got ' + (threw && threw.message));
    });

    await test('agentContext() returns null for unknown agent', () => {
        assert(h.agentContext('agent_missing_xyz') === null, 'unknown agent should be null');
    });

    await test('e2e: agents.spawn provisions habitat identity', async () => {
        // Spawn is gated by sandbox.canSpawn (DENY by default) — grant it the
        // way a boot with capabilities would, then restore after the spawn.
        const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
        const prevCaps = sandbox.defaultSandbox.capabilities.canSpawn;
        sandbox.setCapabilities({ canSpawn: true });
        try {
            await _spawnIdentityProbe();
        } finally {
            sandbox.setCapabilities({ canSpawn: prevCaps });
        }
    });

    async function _spawnIdentityProbe() {
        const agents = require(path.join(ROOT, 'lib', 'agents'));
        const spawned = agents.spawn({ name: 'rls-probe', role: 'viewer' });
        assert(!spawned.error, 'spawn failed: ' + (spawned.error || 'unknown'));
        const ctx = agents.agentContext(spawned.id);
        assert(ctx, 'agentContext should resolve after spawn');
        assert(ctx.userId === spawned.id, 'userId should be the agent id');
        assert(ctx.workspace === h.getCurrentWorkspace(), 'roleless agent should land in default workspace, got ' + ctx.workspace);
        assert(ctx.roles.includes('viewer'), 'spawn role should be granted, got ' + JSON.stringify(ctx.roles));
        assert(h.getUserRoles(ctx.workspace, spawned.id).includes('viewer'), 'habitat registry should hold the role');
    }

    // ---------- Enforcement ----------
    console.log('\n  Enforcement:');

    await test('generateCaps mints admin caps for known workspace admin', () => {
        const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
        const caps = sandbox.generateCaps({ userId: 'boss', workspace: 'org-acme', roles: ['admin'] });
        assert(caps.canAdmin === true && caps.canWrite === true, 'admin should get full caps, got ' + JSON.stringify(caps));
    });

    await test('generateCaps fail-closed on UNKNOWN workspace claim', () => {
        const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
        const caps = sandbox.generateCaps({ userId: 'ghost', workspace: 'fabricated-ws', roles: ['admin'] });
        assert(caps.canRead === false && caps.canWrite === false && caps.canAdmin === false,
            'fabricated workspace must get zero caps, got ' + JSON.stringify(caps));
    });

    await test('generateCaps tolerates sparse context (no fail-closed hit)', () => {
        const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
        // Empty ctx resolves to the CURRENT (known) workspace — it must not
        // be treated as an unknown-workspace claim. No roles = no elevated
        // caps (pre-existing contract: baseCaps possibly augmented).
        const caps = sandbox.generateCaps({});
        assert(typeof caps === 'object', 'should return a caps object');
        assert(caps.canRead !== false, 'sparse ctx must not be fail-closed denied');
    });

    await test('rls.getHabitat() auto-claims the shared habitat', () => {
        const rls = require(path.join(ROOT, 'lib', 'rls'));
        assert(rls.getHabitat() === h, 'rls should auto-claim the same shared instance');
    });

    await test('rls.checkRead throws RLS_DENIED per habitat decision', async () => {
        const rls = require(path.join(ROOT, 'lib', 'rls'));
        let threw = null;
        try { await rls.checkRead({}, 'test:adminOnly'); } catch (e) { threw = e; }
        assert(threw, 'expected denial');
        assert(threw.code === 'RLS_DENIED', 'expected RLS_DENIED, got ' + threw.code);
        assert(await rls.checkRead({ roles: ['admin'] }, 'test:adminOnly') === true, 'admin should pass through rls');
    });

    await test('rls.isOperationAllowed maps write-words to write mode', async () => {
        const rls = require(path.join(ROOT, 'lib', 'rls'));
        const writeDenied = await rls.isOperationAllowed('delete', '_brain:identity', {});
        assert(writeDenied === false, 'anonymous delete should be denied');
        const readOk = await rls.isOperationAllowed('read', '_brain:identity', {});
        assert(readOk === true, 'anonymous read should be allowed');
    });

    // ---------- Persistence ----------
    console.log('\n  Persistence:');

    await test('mutations persist and restore round-trips (fresh instance)', async () => {
        // Grant write caps so the fire-and-forget persist actually lands
        // (sandbox in this process defaults to canWrite:false).
        const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
        sandbox.setCapabilities({ canWrite: true, canRead: true });
        const marker = 'ws-roundtrip-' + Date.now().toString(36);
        h.createWorkspace(marker, {});
        h.addRole(marker, 'admin', 'roundtrip-user');
        // Wait out the serialized persist chain (mutations are fire-and-forget)
        if (h._readyPromise) await h._readyPromise;

        // Fresh instance, same brain persistence: restore() must see the marker
        const Habitat = habitat.Habitat || habitat;
        const memory = require(path.join(ROOT, 'lib', 'memory'));
        const h2 = new Habitat({ persistence: memory });
        const state = await h2.restore();
        assert(state, 'restore should find persisted state');
        assert(h2.workspaces[marker], 'marker workspace should survive round-trip');
        assert(h2.hasRole(marker, 'roundtrip-user', 'admin'), 'role should survive round-trip');
    });

    // ---------- Summary ----------
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => {
    console.error('SUITE ERROR:', e.stack || e.message);
    process.exit(1);
});
