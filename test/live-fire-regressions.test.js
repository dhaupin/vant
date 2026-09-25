#!/usr/bin/env node
/**
 * Live-Fire Regression Tests (pass 41)
 *
 * Every check here is a REAL bug found by exercising vant live (not unit
 * seams): boot, agora loop, crew demo, brain writes, MCP over HTTP. Each
 * failed or was exploitable in the wild before the pass-41 fixes; these
 * pins keep them dead. See labs/TASKS.md pass-41 block for the probe log.
 *
 *   1. consensus: quorum is a HEADCOUNT — under default trust weighting a
 *      unanimous 2-voter ledger must reach 'passed' (was stuck 'quorum'
 *      forever: quorum 2 compared against weight 2x0.5)
 *   2. consensus: tally checksum === hash in the passed branch (the old
 *      second _hashTally call hashed a different key whitelist)
 *   3. node-registry: quarantined agent refused at register() (pass-40
 *      claim finally true here) AND a pre-registered peer quarantined
 *      after the fact is denied at the vote gate
 *   4. brain.writeTo: works (was born-broken: storage.set does not exist
 *      on BrainStorage), string bodies round-trip through read()
 *   5. format.serialize: string input serializes as itself (was '' ->
 *      saveFile wrote EMPTY files and reported success — silent data loss)
 *   6. MCP exec server: binds loopback by default; Host (rebinding),
 *      Content-Type (no-preflight drive-by), and Origin (cross-site) gates
 *      refuse hostile requests; legit localhost JSON clients pass
 *
 * Run: node test/live-fire-regressions.test.js
 */

const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0 };

function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => {
            results.passed++;
            console.log(`  ✓ ${name}`);
        })
        .catch((e) => {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
        });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true
});
// Clean shared state BEFORE requiring modules (load-on-init races rm).
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'state'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'orgchart'), { recursive: true, force: true });

const consensus = require(path.join(ROOT, 'lib', 'consensus'));
const trust = require(path.join(ROOT, 'lib', 'trust'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));
const brain = require(path.join(ROOT, 'lib', 'brain'));
const format = require(path.join(ROOT, 'lib', 'format'));

function httpPost(port, { headers = {}, body = '', host = '127.0.0.1' }) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host, port, path: '/mcp/exec', method: 'POST', headers }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.setTimeout(5000, () => req.destroy(new Error('http timeout')));
        req.end(body);
    });
}

async function main() {
    console.log('\n🔥 LIVE-FIRE REGRESSION TESTS (pass 41)\n');

    // ---------- 1+2: consensus quorum headcount + checksum ----------
    registry.clearState();
    await trust.clearState();
    if (consensus.clearState) await consensus.clearState();
    registry.register({ id: 'qf-a', name: 'qf-a', host: '127.0.0.1', port: 1 });
    registry.register({ id: 'qf-b', name: 'qf-b', host: '127.0.0.1', port: 2 });

    const T1 = 'livefire-quorum-' + Date.now().toString(36);
    await test('quorum is a headcount: unanimous 2-voter passes under default trust weight', async () => {
        const led = await consensus.create(T1, { options: ['yes', 'no'] }); // minQuorum defaults 2, trust weight ON
        assert(!led.error, 'create failed: ' + JSON.stringify(led).slice(0, 120));
        const v1 = await consensus.vote(T1, 'yes', 'qf-a');
        assert(v1.status === 'quorum', 'one of two voters must still be waiting, got ' + v1.status);
        assert(v1.quorumNeeded === 1, 'quorumNeeded must be a COUNT, got ' + v1.quorumNeeded);
        const v2 = await consensus.vote(T1, 'yes', 'qf-b');
        assert(v2.status === 'passed', 'unanimous 2-voter must PASS (was stuck quorum), got ' + v2.status + ' ' + JSON.stringify(v2).slice(0, 120));
        assert(v2.winner === 'yes', 'winner: ' + v2.winner);
        // unweighted percentages stay a truthful headcount share
        assert(Math.abs(v2.percentages.yes - 0.5) < 1e-9, 'percentages must be unweighted share, got ' + v2.percentages.yes);
        assert(Math.abs(v2.weightedPercentages.yes - 1) < 1e-9, 'weighted must be 1.0 unanimous, got ' + v2.weightedPercentages.yes);
    });

    await test('passed tally: checksum === hash (same whitelist)', async () => {
        const t = consensus.tally(T1);
        assert(t.hash && t.checksum, 'missing hash/checksum');
        assert(t.hash === t.checksum, 'checksum diverged from hash');
        assert(consensus.get(T1).hash === t.hash, 'ledger hash must match tally hash');
    });

    // ---------- 3: quarantine gates ----------
    await test('node-registry refuses a quarantined agent at register()', async () => {
        await trust.clearState();
        await trust.quarantine('lf-badactor', 'live-fire pin');
        const r = registry.register({ id: 'lf-badactor', host: '127.0.0.1', port: 3 });
        assert(r && r.error === 'Agent quarantined' && r.code === 'E_QUARANTINED',
            'quarantined register must be refused, got ' + JSON.stringify(r));
        assert(!registry.get('lf-badactor'), 'refused agent must not appear in the registry');
    });

    await test('consensus vote gate denies a peer quarantined AFTER registering', async () => {
        await trust.clearState();
        registry.register({ id: 'lf-latemal', host: '127.0.0.1', port: 4 });
        const T2 = 'livefire-late-' + Date.now().toString(36);
        const led = await consensus.create(T2, { options: ['a', 'b'], requireRegistry: true });
        assert(!led.error, 'create failed');
        await trust.quarantine('lf-latemal', 'turned bad post-registration');
        const v = await consensus.vote(T2, 'a', 'lf-latemal');
        assert(v.error === 'Agent quarantined' && v.code === 'E_QUARANTINED',
            'quarantined vote must be denied, got ' + JSON.stringify(v).slice(0, 120));
        const clean = await consensus.vote(T2, 'a', 'qf-a');
        assert(!clean.error, 'clean registered voter must still pass the gate: ' + JSON.stringify(clean).slice(0, 120));
    });

    // ---------- 4+5: brain.writeTo + format.serialize ----------
    const PROBE_KEY = 'livefire-writeto-' + Date.now().toString(36);
    await test('brain.writeTo round-trips a STRING into the target brain (read-back)', async () => {
        const r = await brain.writeTo({ name: 'vant', type: 'private' }, PROBE_KEY, 'live-fire string body ' + PROBE_KEY);
        assert(r && r.success !== false && !r.error, 'writeTo failed: ' + JSON.stringify(r).slice(0, 120));
        const back = await brain.read(PROBE_KEY);
        assert(back && back.content === 'live-fire string body ' + PROBE_KEY,
            'string round-trip failed, read back: ' + JSON.stringify(back && back.content).slice(0, 80));
    });

    await test('brain.writeTo round-trips an OBJECT (json) into the target brain', async () => {
        const payload = { live: true, n: 41 };
        const r = await brain.writeTo({ name: 'vant', type: 'private' }, PROBE_KEY + '-obj', payload);
        assert(r && !r.error, 'writeTo failed: ' + JSON.stringify(r).slice(0, 120));
        const back = await brain.read(PROBE_KEY + '-obj');
        assert(back && back.data && back.data.live === true && back.data.n === 41,
            'object round-trip failed: ' + JSON.stringify(back && back.data).slice(0, 100));
    });

    await test('brain.writeTo validates hostile input with coded errors', async () => {
        let threw = null;
        try { await brain.writeTo(null, 'x', 'y'); } catch (e) { threw = e; }
        assert(threw && threw.code, 'null brain must throw coded VantError');
        threw = null;
        try { await brain.writeTo({ name: 'vant', type: 'banana' }, 'x', 'y'); } catch (e) { threw = e; }
        assert(threw && threw.code, 'bad brain.type must throw coded VantError');
    });

    await test('format.serialize: string input serializes as itself (no silent empty files)', () => {
        assert(format.serialize('plain body', 'md') === 'plain body', 'string md serialize mangled');
        assert(format.serialize('plain body', 'json') === 'plain body', 'string json serialize mangled');
        assert(format.serialize(42, 'md') === '42', 'number serialize mangled');
        assert(format.serialize(null, 'md') === 'null', 'null must not become empty string');
        assert(JSON.parse(format.serialize({ a: 1 }, 'json')).a === 1, 'object json serialize broken');
    });

    // ---------- minor live-fire finds: market stats leak + stack stats ----------
    const market = require(path.join(ROOT, 'lib', 'market'));
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    await test('market.stats: scoped listing IDs do not leak to non-members', async () => {
        if (market.clearState) await market.clearState();
        const org = teams.createOrg('lf-stats-org-' + Date.now().toString(36));
        assert(!org.error, 'org create failed: ' + JSON.stringify(org));
        const dept = teams.createDept('lf-stats-dept', { org: org.id });
        assert(!dept.error, 'dept create failed: ' + JSON.stringify(dept));
        const team = teams.createTeam('lf-stats-team', { org: org.id, dept: dept.id });
        assert(!team.error, 'team create failed: ' + JSON.stringify(team));
        const role = teams.createRole('lf-member', { org: org.id, team: team.id });
        assert(!role.error, 'role create failed: ' + JSON.stringify(role));
        const assigned = teams.assign('lf-seller', { org: org.id, dept: dept.id, team: team.id, role: 'lf-member' });
        assert(!assigned.error, 'assign failed: ' + JSON.stringify(assigned));
        const listing = await market.list('knowledge',
            { title: 'secret sauce', summary: 's', seller: 'lf-seller', scope: { owner: 'team:' + team.name, visibility: 'scope' } },
            { agentId: 'lf-seller', consentGiven: true });
        assert(!listing.error, 'scoped list failed: ' + JSON.stringify(listing).slice(0, 120));
        const anon = await market.stats();
        const leaked = JSON.stringify(anon).includes(listing.id);
        assert(!leaked, 'anonymous stats leaked a scoped listing id');
        const member = await market.stats('lf-seller');
        assert(JSON.stringify(member).includes(listing.id), 'member stats should show their listing: ' + JSON.stringify(member).slice(0, 160));
        teams.unassign('lf-seller');
    });

    await test('market.getStackMarketStats: no bare-identifier error per brain (was stats-is-not-defined)', () => {
        const s = market.getStackMarketStats();
        assert(s && s.byBrain, 'missing byBrain');
        for (const [brainName, st] of Object.entries(s.byBrain)) {
            assert(!(st && st.error && /stats is not defined/.test(st.error)),
                brainName + ' stack stats still broken: ' + st.error);
        }
    });

    // cleanup probe files (private brain is gitignored; keep the tree tidy)
    try { fs.unlinkSync(path.join(ROOT, 'models', 'private', 'vant', PROBE_KEY + '.md')); } catch (e) {}
    try { fs.unlinkSync(path.join(ROOT, 'models', 'private', 'vant', PROBE_KEY + '-obj.json')); } catch (e) {}

    // ---------- 6: MCP server posture (bind + gates), real child process ----------
    const MCP_PORT = 48000 + (process.pid % 4000);
    const child = spawn(process.execPath, [path.join(ROOT, 'bin', 'mcp.js'), '-S', '-p', String(MCP_PORT)], {
        cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']
    });
    let serverUp = false;
    child.stdout.on('data', (d) => { if (String(d).includes('Server on')) serverUp = true; });
    for (let i = 0; i < 40 && !serverUp; i++) await wait(100);

    await test('MCP binds loopback, not all interfaces', async () => {
        assert(serverUp, 'MCP server did not report startup');
        // Host gate is the observable half of the loopback posture: a hostile
        // Host on a loopback-bound server is refused (a LAN-exposed server
        // would have relaxed this gate).
        const r = await httpPost(MCP_PORT, {
            headers: { 'Content-Type': 'application/json', Host: 'evil.example.com' },
            body: JSON.stringify({ tool: 'brain_list', args: {} })
        });
        assert(r.status === 403, 'hostile Host must 403 on a loopback-bound server, got ' + r.status);
    });

    await test('MCP: DNS-rebinding Host header refused', async () => {
        const r = await httpPost(MCP_PORT, {
            headers: { 'Content-Type': 'application/json', Host: 'rebind.attacker.io' },
            body: JSON.stringify({ tool: 'brain_read', args: { name: 'identity' } })
        });
        assert(r.status === 403 && /rebind/i.test(r.body), 'got ' + r.status + ' ' + r.body.slice(0, 80));
    });

    await test('MCP: text/plain (no-preflight drive-by) refused', async () => {
        const r = await httpPost(MCP_PORT, {
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ tool: 'brain_read', args: { name: 'identity' } })
        });
        assert(r.status === 415, 'got ' + r.status + ' ' + r.body.slice(0, 80));
    });

    await test('MCP: cross-origin POST refused', async () => {
        const r = await httpPost(MCP_PORT, {
            headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example.com' },
            body: JSON.stringify({ tool: 'brain_list', args: {} })
        });
        assert(r.status === 403 && /cross-origin/i.test(r.body), 'got ' + r.status + ' ' + r.body.slice(0, 80));
    });

    await test('MCP: legit localhost JSON client still works', async () => {
        const r = await httpPost(MCP_PORT, {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: 'brain_list', args: {} })
        });
        assert(r.status === 200, 'legit client got ' + r.status);
        const parsed = JSON.parse(r.body);
        assert(parsed.result && Array.isArray(parsed.result.brains), 'unexpected shape: ' + r.body.slice(0, 80));
        const loopbackOrigin = await httpPost(MCP_PORT, {
            headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
            body: JSON.stringify({ tool: 'brain_list', args: {} })
        });
        assert(loopbackOrigin.status === 200, 'loopback Origin must pass, got ' + loopbackOrigin.status);
    });

    child.kill('SIGTERM');

    // cleanup shared state touched by this suite
    try { fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'state'), { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'orgchart'), { recursive: true, force: true }); } catch (e) {}

    console.log(`\n=== Live-fire regressions: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('FATAL:', e.message);
    process.exit(1);
});
