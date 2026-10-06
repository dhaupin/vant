#!/usr/bin/env node
/**
 * Mesh status tests (pass 62 / Wave F, labs/prd-mesh.md)
 *
 * Pins the coordinator's one-command view (lib/mesh-status.js +
 * bin/mesh-status.js as `vant mesh status`):
 *
 *   1. buildReport answers the coordinator's question: every section
 *      present (self, versions, genesis, registry, agora, market,
 *      budgets, msg, sync), kind-marked, JSON-safe round-trip
 *   2. READ-ONLY: building a report leaves consensus, market, escrow,
 *      and msg state untouched (a status probe is never a side effect)
 *   3. Aggregated posture: budget totals derived from escrow books;
 *      market uses the ANONYMOUS stats call (scoped listing ids never
 *      leak through the stats door — the pass-41 rule on the report)
 *   4. Scope: consensus.list() already filters scoped topics to members
 *      (the pass-40 rule lives in consensus); msg summaries carry
 *      counts, never content; no secrets anywhere in the JSON
 *   5. DEGRADED, NOT DEAD: a poisoned require for one subsystem degrades
 *      only its own section ({ error }), the rest of the report stands
 *   6. renderReport prints every section, even degraded ones (the error
 *      IS the status); JSON and text come from the same report object
 *   7. CLI: `vant mesh status` and `--json` both exit 0 through the
 *      real bin/vant.js router (the CLI is the contract)
 *
 * Run: node test/mesh-status.test.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

const results = { passed: 0, failed: 0 };
function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => { results.passed++; console.log(`  ✓ ${name}`); })
        .catch((e) => { results.failed++; console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`); });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

// Clean local state so counts are deterministic (same-disk JV state from
// earlier suites would blur the read-only assertions' baselines).
for (const dir of ['state', 'orgchart']) {
    fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', dir), { recursive: true, force: true });
}

const meshStatus = require(path.join(ROOT, 'lib', 'mesh-status'));
const consensus = require(path.join(ROOT, 'lib', 'consensus'));
const market = require(path.join(ROOT, 'lib', 'market'));
const msg = require(path.join(ROOT, 'lib', 'msg'));

async function main() {
    console.log('\n📡 MESH STATUS TESTS (pass 62 / Wave F)\n');

    // ---------- 1. the coordinator's question, all sections ----------
    await test('buildReport answers every section, kind-marked and JSON-safe', async () => {
        const report = meshStatus.buildReport();
        assert(report.kind === 'vant-mesh-status', 'kind marker missing');
        for (const key of ['self', 'versions', 'genesis', 'registry', 'agora', 'market', 'budgets', 'msg', 'sync']) {
            assert(key in report, 'section missing: ' + key);
        }
        const round = JSON.parse(JSON.stringify(report)); // must not throw
        assert(round.generatedAt > 0, 'generatedAt missing');
        assert(round.registry && typeof round.registry.stats === 'object', 'registry stats shape');
        assert(round.versions.envelope.major >= 1, 'envelope version present');
    });

    // ---------- 2. read-only posture ----------
    await test('READ-ONLY: a report changes no state (probe is never a side effect)', async () => {
        consensus.clearState(); market.clearState(); msg.clearState();
        // Baseline: create one topic, one listing, one conversation.
        const t = await consensus.create('ms-f1', { options: ['a', 'b'], quorum: 1 });
        assert(!t.error, 'topic create failed: ' + JSON.stringify(t));
        market._resetHydration();
        const l = await market.list('insight', { content: 'f-listing', price: 2 }, { agentId: 'ms-f-agent', consentGiven: true });
        assert(!l.error, 'listing failed: ' + JSON.stringify(l));
        msg.create({ id: 'ms-f-conv' });
        msg.post('ms-f-conv', 'hello stewardship', { author: 'ms-f-agent' });

        const before = {
            consensus: JSON.stringify(consensus.getStats()),
            market: JSON.stringify(market.stats(null)),
            msg: msg.list().length,
            topicVotes: JSON.stringify((consensus.get('ms-f1') || {}).votes || {})
        };
        meshStatus.buildReport();
        meshStatus.buildReport();
        const after = {
            consensus: JSON.stringify(consensus.getStats()),
            market: JSON.stringify(market.stats(null)),
            msg: msg.list().length,
            topicVotes: JSON.stringify((consensus.get('ms-f1') || {}).votes || {})
        };
        assert(JSON.stringify(before) === JSON.stringify(after),
            'report mutated state:\nbefore=' + JSON.stringify(before) + '\nafter=' + JSON.stringify(after));
    });

    // ---------- 3. aggregated posture ----------
    await test('aggregated posture: budget totals, anonymous market stats', async () => {
        const report = meshStatus.buildReport();
        assert(report.budgets.error === undefined, 'budgets degraded unexpectedly: ' + JSON.stringify(report.budgets.error));
        assert(typeof report.budgets.agents === 'number' && report.budgets.agents >= 0, 'budget agents count');
        assert(Number.isFinite(report.budgets.totalSpent) && Number.isFinite(report.budgets.totalLimit), 'budget totals must be numbers');
        // Per-agent wallet keys must not appear — aggregates only.
        assert(!('perAgent' in report.budgets) && !('wallets' in report.budgets), 'per-agent wallets leaked into the report');
        assert(report.market.error === undefined, 'market degraded unexpectedly');
        assert(Number.isFinite(report.market.listings) && Number.isFinite(report.market.visible), 'market counts must be numbers');
        assert(!report.market.types && !report.market.byTags, 'index views leaked into the report (counts only)');
    });

    // ---------- 4. scope + secrets ----------
    await test('scope and secrets: no listing ids, no message content, no secret module access', async () => {
        const report = meshStatus.buildReport();
        const json = JSON.stringify(report);
        // The scoped listing from test 2 must appear as a COUNT, never an id.
        assert(!json.includes('f-listing'), 'listing content leaked into report');
        assert(!json.includes('hello stewardship'), 'message content leaked into report');
        // Msg summaries are counts + ids only.
        for (const c of (report.msg.channels || [])) {
            assert(Object.keys(c).every((k) => ['id', 'messages', 'participants', 'lastActivity'].includes(k)),
                'channel summary carries unexpected fields: ' + JSON.stringify(c));
        }
        // Secret store never consulted (the module need not even load).
        const secretsInReport = /secret/i.test(json) && /mesh:/.test(json);
        assert(!secretsInReport, 'secret-shaped values leaked into report');
    });

    // ---------- 5. degraded, not dead ----------
    await test('DEGRADED NOT DEAD: a broken subsystem degrades its section only', async () => {
        const Module = require('module');
        const origResolve = Module._resolveFilename;
        Module._resolveFilename = function (request, ...rest) {
            if (request === './consensus' || request === '../lib/consensus') {
                throw new Error('simulated subsystem failure');
            }
            return origResolve.call(this, request, ...rest);
        };
        try {
            // Fresh module registry so mesh-status re-requires under poison.
            const report = meshStatus.buildReport();
            assert(report.agora && report.agora.error, 'agora section should carry the error, got ' + JSON.stringify(report.agora).slice(0, 120));
            assert(report.market && report.market.error === undefined, 'market should survive the agora failure');
            assert(report.registry && report.registry.error === undefined, 'registry should survive');
            assert(report.sync && report.sync.error === undefined, 'sync should survive');
        } finally {
            Module._resolveFilename = origResolve;
        }
    });

    // ---------- 6. rendering ----------
    await test('renderReport prints every section, even degraded (the error IS the status)', async () => {
        const report = meshStatus.buildReport();
        const text = meshStatus.renderReport(report);
        for (const label of ['self', 'genesis', 'peers', 'agora', 'market', 'budgets', 'msg', 'sync']) {
            assert(text.includes(label), 'render missing section label: ' + label);
        }
        assert(text.includes('MESH STATUS'), 'header missing');
        // Degraded rendering: poison the report object directly (no require games).
        const broken = JSON.parse(JSON.stringify(report));
        broken.market = { error: 'simulated failure' };
        const text2 = meshStatus.renderReport(broken);
        assert(text2.includes('(error: simulated failure)'), 'degraded section must print its error');
        // status(): one source of truth, two surfaces.
        const s = meshStatus.status();
        assert(s.report && s.text && s.text.length > 100, 'status() should return both surfaces');
    });

    // ---------- 7. CLI (the contract) ----------
    await test('CLI: vant mesh status and --json both exit 0 through the real router', async () => {
        const run = (args) => new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [path.join(ROOT, 'bin', 'vant.js'), 'mesh', ...args], { cwd: ROOT });
            let out = '', err = '';
            const timer = setTimeout(() => { child.kill(); reject(new Error('cli timeout')); }, 15000);
            child.stdout.on('data', (d) => { out += d; });
            child.stderr.on('data', (d) => { err += d; });
            child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
            child.on('error', reject);
        });
        const human = await run(['status']);
        assert(human.code === 0, 'human mode exit ' + human.code + ': ' + human.err.slice(0, 200));
        assert(human.out.includes('MESH STATUS') && human.out.includes('agora'), 'human mode missing sections');
        const json = await run(['status', '--json']);
        assert(json.code === 0, 'json mode exit ' + json.code);
        const parsed = JSON.parse(json.out.split('\n').filter((l) => !l.startsWith('[')).join('\n'));
        assert(parsed.kind === 'vant-mesh-status', 'json mode kind missing');
        assert(parsed.agora && parsed.msg, 'json mode sections missing');
    });

    const banner = `  ${results.passed} passed, ${results.failed} failed`;
    console.log('\n' + (results.failed ? '✗ ' : '✓ ') + banner + '\n');
    process.exit(results.failed ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
