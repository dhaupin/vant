#!/usr/bin/env node
/**
 * Island Boundary Enforcement Tests (pass 84)
 *
 * Covers #3: islands boundary enforcement (with RLS alongside).
 *   1. No policy = open island (pre-84 behavior, every existing island).
 *   2. Policy'd island: allowed reads, denied reads (RLS_DENIED), row-level
 *      filter/mask on island DATA.
 *   3. Writes fail closed: anonymous write on a policy'd island is
 *      E_ISLAND_WRITE_DENIED even when readableBy is public.
 *   4. Context resolution: explicit userCtx -> current agent habitat
 *      identity -> anonymous (spawn e2e).
 *   5. MCP surface: islands_canAccess + vant_island_status boundary info.
 *   6. Backward compat: policy-less save/hydrate identical to before.
 *
 * ISOLATION: scratch brain (VANT_BRAIN).
 */

const SCRATCH_BRAIN = 'ib-test-' + Date.now().toString(36);
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

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

async function main() {
    console.log('\n\ud83c\udf10 ISLAND BOUNDARY TESTS (pass 84)\n');
    console.log('  (scratch brain: ' + SCRATCH_BRAIN + ')');

    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    sandbox.setScopes(['read', 'write']);
    sandbox.defaultSandbox.setCapabilities({ canRead: true, canWrite: true });

    const islands = require(path.join(ROOT, 'lib', 'islands'));
    const habitat = require(path.join(ROOT, 'lib', 'habitat'));
    const h = habitat.getShared();
    await habitat.getSharedReady();

    // ---------- No policy = open island ----------
    console.log('\n  No policy (pre-84 behavior):');

    await test('policy-less island loads and saves exactly as before', async () => {
        // 'github' ships in the DEFAULT_ISLANDS manifest (storage source).
        // Custom islands must be manifest-registered first (createIsland).
        const created = islands.createIsland('openprobe', { type: 'lazy', source: 'storage' });
        assert(!created.error, 'createIsland failed: ' + JSON.stringify(created));
        islands.save('openprobe', { ok: true, probe: SCRATCH_BRAIN });
        const data = await islands.load('openprobe');
        assert(data && data.ok === true, 'load round-trip: ' + JSON.stringify(data));
    });

    // ---------- Policy'd island: reads ----------
    console.log('\n  Policy enforcement (read):');

    islands.createIsland('notes', { type: 'lazy', source: 'storage' });
    islands.createIsland('classified', { type: 'lazy', source: 'storage' });
    islands.createIsland('tenanted', { type: 'lazy', source: 'storage' });
    h.setPolicy('_island:notes', { readableBy: ['public'], writableBy: ['role:admin'], filter: ['internalId'], mask: ['apiKey'] });

    await test('gated island readable by anonymous when readableBy public', async () => {
        islands.save('notes', { title: 't', internalId: 'x1', apiKey: 'sk-secret' }, { userCtx: { userId: 'writer', roles: ['admin'] } });
        const data = await islands.load('notes', {});  // anonymous read
        assert(data.title === 't', 'title survives');
        assert(!('internalId' in data), 'filter stripped internalId: ' + JSON.stringify(data));
        assert(data.apiKey === '[masked]', 'mask redacted apiKey: ' + JSON.stringify(data));
    });

    await test('gated island readable by a role-holder', async () => {
        h.addRole('default', 'editor', 'ed-1');
        const data = await islands.load('notes', { userCtx: { userId: 'ed-1', roles: ['editor'], workspace: 'default' } });
        assert(data && data.title === 't', 'editor reads through');
    });

    await test('denied context gets RLS_DENIED (role-gated island)', async () => {
        h.setPolicy('_island:classified', { readableBy: ['role:admin'], writableBy: ['role:admin'] });
        let threw = null;
        try {
            await islands.load('classified', { userCtx: { userId: 'peasant', roles: ['viewer'], workspace: 'default' } });
        } catch (e) { threw = e; }
        assert(threw, 'expected denial');
        assert(threw.code === 'RLS_DENIED', 'expected RLS_DENIED, got ' + threw.code);
    });

    await test('container isolation denies cross-workspace reader', async () => {
        h.createWorkspace('org-island', { owner: 'own' });
        h.setPolicy('_island:tenanted', { container: 'org-island' });
        let threw = null;
        try {
            await islands.load('tenanted', { userCtx: { userId: 'out', roles: ['admin'], workspace: 'somewhere-else' } });
        } catch (e) { threw = e; }
        assert(threw && threw.code === 'RLS_DENIED', 'cross-container denied, got ' + (threw && threw.code));
        const insider = await islands.load('tenanted', { userCtx: { userId: 'in', roles: ['admin'], workspace: 'org-island' } });
        assert(insider === null || insider !== undefined, 'insider request passes the gate (island may be empty)');
    });

    // ---------- Writes fail closed ----------
    console.log('\n  Writes (fail closed):');

    await test('anonymous write on gated island denied (E_ISLAND_WRITE_DENIED)', () => {
        let threw = null;
        try { islands.save('notes', { x: 1 }); } catch (e) { threw = e; }
        assert(threw, 'expected denial');
        assert(threw.code === 'E_ISLAND_WRITE_DENIED', 'expected E_ISLAND_WRITE_DENIED, got ' + threw.code);
    });

    await test('non-admin write denied (RLS_DENIED)', () => {
        let threw = null;
        try { islands.save('notes', { x: 1 }, { userCtx: { userId: 'ed-1', roles: ['editor'], workspace: 'default' } }); } catch (e) { threw = e; }
        assert(threw && threw.code === 'RLS_DENIED', 'editor cannot write admin-only island, got ' + (threw && threw.code));
    });

    await test('admin write succeeds', () => {
        const before = islands.load('notes', {}).then ? null : null;  // (load is async; shape only)
        islands.save('notes', { title: 'updated', by: 'boss' }, { userCtx: { userId: 'boss', roles: ['admin'] } });
        return islands.load('notes', {}).then(d => {
            assert(d.by === 'boss', 'admin write landed: ' + JSON.stringify(d));
        });
    });

    // ---------- Context resolution ----------
    console.log('\n  Context resolution:');

    await test('current-agent habitat identity flows into the gate (spawn e2e)', async () => {
        const agents = require(path.join(ROOT, 'lib', 'agents'));
        sandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });
        const spawned = agents.spawn({ name: 'island-probe', role: 'admin' });
        assert(!spawned.error, 'spawn failed: ' + (spawned.error || ''));
        agents.setCurrentAgentId(spawned.id);
        try {
            // 'admin' role is granted to the agent in its workspace at spawn;
            // the workspace is the default one, same container as _island:notes.
            const ctx = agents.agentContext(spawned.id);
            assert(ctx && ctx.roles.includes('admin'), 'agent should hold admin: ' + JSON.stringify(ctx && ctx.roles));
            islands.save('notes', { title: 'from-agent' });   // NO explicit userCtx
            const d = await islands.load('notes');
            assert(d.title === 'from-agent', 'agent wrote + read via its own identity');
        } finally {
            agents.setCurrentAgentId('default');
        }
    });

    await test('anonymous context (default) still denied on write', () => {
        let threw = null;
        try { islands.save('notes', { x: 1 }); } catch (e) { threw = e; }
        assert(threw && threw.code === 'E_ISLAND_WRITE_DENIED', 'default agent has no habitat identity -> denied');
    });

    // ---------- MCP surface ----------
    console.log('\n  MCP surface:');

    await test('islands_canAccess resolves + decides (read/write)', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const anon = await mcp.execute('islands_canAccess', { name: 'notes', mode: 'read' });
        assert(anon.allowed === true && anon.gated === true, 'anon read allowed on public island: ' + JSON.stringify(anon));
        const anonW = await mcp.execute('islands_canAccess', { name: 'notes', mode: 'write' });
        assert(anonW.allowed === false, 'anon write denied');
        const adminW = await mcp.execute('islands_canAccess', { name: 'notes', mode: 'write', userCtx: { userId: 'boss', roles: ['admin'] } });
        assert(adminW.allowed === true, 'admin write allowed');
    });

    await test('islands_canAccess reports ungated islands honestly', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const r = await mcp.execute('islands_canAccess', { name: 'openprobe', mode: 'write' });
        assert(r.gated === false && r.allowed === true, 'ungated island: ' + JSON.stringify(r));
    });

    await test('vant_island_status exposes boundary info', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const gated = await mcp.execute('vant_island_status', { name: 'notes' });
        assert(gated.boundary && gated.boundary.gated === true, 'boundary on gated island: ' + JSON.stringify(gated.boundary));
        assert(Array.isArray(gated.boundary.writableBy) && gated.boundary.writableBy.includes('role:admin'), 'writableBy visible');
        const plain = await mcp.execute('vant_island_status', { name: 'openprobe' });
        assert(plain.boundary && plain.boundary.gated === false, 'no boundary on open island');
    });

    await test('islands.listBoundaries enumerates island policies', () => {
        const list = islands.listBoundaries();
        const notes = list.find(b => b.island === 'notes');
        assert(notes && notes.container === 'default', 'notes listed: ' + JSON.stringify(list.map(b => b.island)));
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
