#!/usr/bin/env node
/**
 * Agora Tenancy Tests (pass 87) — #6 mesh/agora tenancy
 *
 * Covers:
 *   1. Anonymous publishes = global commons (pre-87 behavior preserved).
 *   2. Identified agent publishes = workspace stamped from its habitat
 *      identity (same subject chain as islands/memory/tokens).
 *   3. Read visibility: anonymous sees global only (fail closed on tenant
 *      posts); tenant members see global + own; cross-tenant needs a
 *      registry role there.
 *   4. get() hides tenant posts from non-members (found:false, no leak).
 *   5. Foreign-workspace publish pin fails closed (workspace_denied).
 *   6. MCP surface: forum_publish/forum_list with verified-ctx priority.
 *   7. Mesh provenance: shareableReport carries tenancy; node-registry
 *      carries peer workspace.
 *   8. bin/forum.js is REAL now (list/post/view against lib/forum.js).
 *
 * ISOLATION: scratch brain (VANT_BRAIN).
 */

const SCRATCH_BRAIN = 'ag-test-' + Date.now().toString(36);
process.env.VANT_BRAIN = SCRATCH_BRAIN;

const path = require('path');
const { spawnSync } = require('child_process');
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
function lib(name) { return path.join(ROOT, 'lib', name); }

async function main() {
    console.log('\n\ud83c\udfdb\ufe0f AGORA TENANCY TESTS (pass 87)\n');
    console.log('  (scratch brain: ' + SCRATCH_BRAIN + ')');

    const sandbox = require(lib('sandbox'));
    sandbox.setScopes(['read', 'write', 'spawn']);
    sandbox.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });

    const forum = require(lib('forum'));
    const f = forum.forum;
    const agents = require(lib('agents'));

    // (pass 87 fix) The spawn seam races habitat restore(): spawn()
    // provisions org-<team> synchronously BEFORE getShared()'s async
    // restore() resolves, and restore() REPLACES workspaces/roles
    // wholesale — provisioning evaporates (HABITAT_UNKNOWN_WORKSPACE in
    // the first run). habitat-rls.test.js avoids this by awaiting
    // getSharedReady() BEFORE any spawn; same discipline here.
    const habitat = require(lib('habitat'));
    await habitat.getSharedReady();

    // ---------- 1-2: publish stamping ----------
    console.log('\n  publish stamping:');

    await test('anonymous publish = GLOBAL commons post (no workspace)', async () => {
        const r = await f.publish('global-post', 'commons body');
        assert(r.published === true, 'publish failed: ' + JSON.stringify(r));
        assert(r.publication.workspace === undefined, 'must be workspaceless: ' + JSON.stringify(r.publication.workspace));
        global.__globalPub = r.publication;
    });

    const acme = agents.spawn({ name: 'acme-poster', role: 'editor', team: 'ago' });
    assert(!acme.error, 'spawn failed: ' + (acme.error || ''));
    agents.setCurrentAgentId(acme.id);

    let tenantPub = null;
    await test('identified agent publish = workspace stamped from identity', async () => {
        const r = await f.publish('acme-post', 'tenant body');
        assert(r.published === true, 'publish failed');
        assert(r.publication.workspace === 'org-ago', 'expected org-ago, got ' + JSON.stringify(r.publication.workspace));
        assert(r.publication.authorAgentId === acme.id, 'authorAgentId stamped');
        tenantPub = r.publication;
    });

    await test('identified agent pinning a FOREIGN workspace fails closed', async () => {
        const r = await f.publish('intrusion', 'x', { workspace: 'org-other' });
        assert(r.published === false, 'should be denied');
        assert(r.reason === 'workspace_denied', 'reason: ' + r.reason);
        const bad = await f.publish('bad', 'x', { workspace: '../evil' });
        assert(bad.published === false && bad.reason === 'invalid_workspace', 'invalid name rejected');
    });

    await test('workspace: "" pins a GLOBAL post even under identity', async () => {
        const r = await f.publish('pinned-global', 'commons again', { workspace: '' });
        assert(r.published === true && r.publication.workspace === null, 'pin failed: ' + JSON.stringify(r.publication.workspace));
    });

    agents.setCurrentAgentId('default');

    // ---------- 3: list visibility ----------
    console.log('\n  list visibility (fail closed):');

    await test('anonymous sees GLOBAL only (tenant posts invisible)', async () => {
        const r = await f.list({});
        const titles = r.publications.map(p => p.title);
        assert(titles.includes('global-post'), 'global post must be visible');
        assert(!titles.includes('acme-post'), 'tenant post must be HIDDEN from anonymous');
        assert(r.tenancy.anonymous === true, 'tenancy meta: ' + JSON.stringify(r.tenancy));
    });

    await test('tenant member sees global + own', async () => {
        const r = await f.list({ userCtx: { userId: acme.id, agentId: acme.id, workspace: 'org-ago', roles: ['editor'] } });
        const titles = r.publications.map(p => p.title);
        assert(titles.includes('global-post') && titles.includes('acme-post'), 'titles: ' + JSON.stringify(titles));
    });

    await test('foreign tenant (no role there) sees global only', async () => {
        const r = await f.list({ userCtx: { userId: 'outsider', agentId: 'outsider', workspace: 'org-zeta', roles: ['editor'] } });
        const titles = r.publications.map(p => p.title);
        assert(titles.includes('global-post') && !titles.includes('acme-post'), 'outsider must not see acme posts');
    });

    await test('cross-tenant ADMIN (registry role) sees the tenant board', async () => {
        // outsider gets a durable registry role in org-ago -> sees acme posts
        const habitat = require(lib('habitat'));
        const h = await habitat.getSharedReady();
        h.addRole('org-ago', 'admin', 'outsider');
        const r = await f.list({ userCtx: { userId: 'outsider', agentId: 'outsider', workspace: 'org-zeta', roles: ['editor'] } });
        const titles = r.publications.map(p => p.title);
        assert(titles.includes('acme-post'), 'registry-admin cross-tenant read failed: ' + JSON.stringify(titles));
        // strip the role -> hidden again (registry-verified, live)
        h.removeRole('org-ago', 'admin', 'outsider');
        const r2 = await f.list({ userCtx: { userId: 'outsider', agentId: 'outsider', workspace: 'org-zeta', roles: ['editor'] } });
        assert(!r2.publications.map(p => p.title).includes('acme-post'), 'role removal must revoke visibility');
    });

    // ---------- 4: get() ----------
    console.log('\n  get():');

    await test('get hides tenant posts from anonymous (found:false, no leak)', async () => {
        const r = await f.get(tenantPub.id, {});
        assert(r.found === false && r.reason === 'tenancy', 'expected tenancy denial, got ' + JSON.stringify(r));
        const g = await f.get(global.__globalPub.id, {});
        assert(g.found === true, 'global get must work');
        const m = await f.get(tenantPub.id, { userCtx: { userId: acme.id, agentId: acme.id, workspace: 'org-ago', roles: ['editor'] } });
        assert(m.found === true, 'member get must work');
    });

    // ---------- 6: MCP surface ----------
    console.log('\n  MCP surface:');

    const mcp = require(lib('mcp'));

    await test('forum_publish/forum_list honor the verified-ctx chain', async () => {
        const anon = await mcp.execute('forum_publish', { title: 'mcp-global', content: 'via mcp' });
        assert(anon.published === true && anon.publication.workspace === undefined, 'anon publish: ' + JSON.stringify(anon));
        // declared (legacy) ctx still works on the non-token path
        const declared = await mcp.execute('forum_publish', { title: 'mcp-tenant', content: 'x', userCtx: { userId: acme.id, agentId: acme.id, workspace: 'org-ago', roles: ['editor'] } });
        assert(declared.published === true && declared.publication.workspace === 'org-ago', 'declared publish: ' + JSON.stringify(declared));
        const anonList = await mcp.execute('forum_list', {});
        assert(!anonList.publications.map(p => p.title).includes('mcp-tenant'), 'anon list must hide tenant');
        assert(anonList.publications.map(p => p.title).includes('mcp-global'), 'anon list must show global');
        const myList = await mcp.execute('forum_list', { userCtx: { userId: acme.id, agentId: acme.id, workspace: 'org-ago', roles: ['editor'] } });
        assert(myList.publications.map(p => p.title).includes('mcp-tenant'), 'member list must show tenant');
    });

    // ---------- 7: mesh provenance ----------
    console.log('\n  mesh provenance:');

    await test('shareableReport carries tenancy + registry workspace', async () => {
        const meshStatus = require(lib('mesh-status'));
        const rep = meshStatus.shareableReport('probe-viewer');
        assert(rep.tenancy && 'workspace' in rep.tenancy, 'tenancy block missing');
        const reg = require(lib('node-registry'));
        reg.clearState();
        const entry = reg.register({ name: 'cairn-probe', workspace: 'org-cairn' });
        assert(entry.workspace === 'org-cairn', 'workspace on register: ' + JSON.stringify(entry.workspace));
        const rep2 = meshStatus.shareableReport('probe-viewer');
        const cairn = (rep2.registry.peers || []).find(p => p.name === 'cairn-probe');
        assert(cairn && cairn.workspace === 'org-cairn', 'peer workspace in report: ' + JSON.stringify(cairn));
    });

    // ---------- 8: CLI ----------
    console.log('\n  bin/forum.js (real now):');

    await test('forum CLI list/post round-trip through lib/forum.js (in-process child)', () => {
        // Publications are memory-only (no hydrate path yet), so post and
        // list MUST run in ONE process — the established workspace-memory
        // pattern: spawn + drive the CLI via argv swap inside a single
        // child. The child also creates a tenant post first, so the
        // "anonymous list hides tenant posts" check is meaningful.
        const BIN = JSON.stringify(path.join(ROOT, 'bin', 'forum.js'));
        const SB = JSON.stringify(path.join(ROOT, 'lib', 'sandbox'));
        const AG = JSON.stringify(path.join(ROOT, 'lib', 'agents'));
        const FM = JSON.stringify(path.join(ROOT, 'lib', 'forum'));
        const HB = JSON.stringify(path.join(ROOT, 'lib', 'habitat'));
        const script =
            '(async () => {' +
            'const sb = require(' + SB + ');' +
            'sb.setScopes(["read", "write", "spawn"]);' +
            'sb.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });' +
            'await require(' + HB + ').getSharedReady();' +
            'const a = require(' + AG + ');' +
            'const s = a.spawn({ name: "cli-tenant", role: "editor", team: "agocli" });' +
            'if (s.error) { console.error("spawn failed: " + JSON.stringify(s.error)); process.exit(2); }' +
            'a.setCurrentAgentId(s.id);' +
            'const f = require(' + FM + ').forum;' +
            'const tp = await f.publish("cli-tenant-post", "tenant body");' +
            'if (!tp.published) { console.error("tenant publish failed"); process.exit(2); }' +
            'a.setCurrentAgentId("default");' +
            'const sleep = (ms) => new Promise((r) => setTimeout(r, ms));' +
            'process.argv = [process.argv[0], "forum", "post", "cli-post", "from the cli"];' +
            'require(' + BIN + ');' +
            'await sleep(500);' +
            'delete require.cache[require.resolve(' + BIN + ')];' +
            'process.argv = [process.argv[0], "forum", "list"];' +
            'require(' + BIN + ');' +
            'await sleep(500);' +
            '})().catch((e) => { console.error("CHILD ERROR:", e.message); process.exit(1); });';
        const r = spawnSync('node', ['-e', script], { cwd: ROOT, encoding: 'utf8' });
        assert(r.status === 0, 'child exit ' + r.status + ': ' + (r.stderr || r.stdout));
        assert(/PUB-\d+/.test(r.stdout), 'real barcode in post output: ' + r.stdout.slice(0, 400));
        // Scope visibility checks to the LIST section — the publish step's
        // own log line legitimately echoes the tenant post's title.
        const listOut = r.stdout.slice(r.stdout.lastIndexOf('Forum Publications'));
        assert(/cli-post/.test(listOut), 'CLI-posted item visible in CLI list: ' + listOut);
        assert(!/cli-tenant-post/.test(listOut), 'anonymous CLI list must hide tenant posts: ' + listOut);
        return true;
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
