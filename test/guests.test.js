#!/usr/bin/env node
/**
 * Guests — per-identity multi-guest auth for the MCP door (H1 of #185).
 *
 * Pins: the issue/verify/revoke lifecycle (raw token shown once + hashed at
 * rest + denylist revocation that survives a reload), role capability maps
 * on the sandbox vocabulary (observer read-only; human read+write+spawn —
 * the #185 acceptance lets a remote browser spawn work; agent adds exec),
 * trust levels RESTRICT only (medium keeps grants, low strips exec+spawn,
 * none caps to read), the door verb classification (read patterns; unknown
 * = write fail-closed; guest management tools are admin-only for EVERY
 * guest role), the pairing voucher (hashed in the ledger, single-use,
 * timing-safe wrong-code refusal), and the auth.js seam (getAccessLevel/
 * checkPermission/revokeToken route vguest_ keys to lib/guests.js for real
 * verdicts).
 *
 * Determinism: every state-sensitive test RESETS the throwaway brain's
 * ledger (file wipe + module reload) first. Unique guest names per suite —
 * the roster accumulates by design and revoke(name) takes the first match.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log('  ✓ ' + name); }
    catch (e) {
        failed++;
        console.log('  ✗ ' + name + ' — ' + e.message);
        try { console.log('    [debug ledger] ' + fs.readFileSync(path.join(ROOT, 'models', 'private', BRAIN, '.guests.json'), 'utf8').slice(0, 500)); } catch (e2) {}
    }
}

console.log('\n🎟️  GUESTS TESTS (H1 of #185 — per-identity multi-guest auth)\n');

const BRAIN = 'gstest';
const OPT = { brain: BRAIN };

const GUESTS_PATH = path.join(ROOT, 'lib', 'guests.js');
function load() {
    delete require.cache[require.resolve(GUESTS_PATH)];
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'auth.js'))];
    return require(GUESTS_PATH);
}
let guests = load();

const LEDGER_FILE = guests._ledgerPath(BRAIN);
assert.ok(/models[\\/]+private[\\/]gstest[\\/]\.guests\.json$/.test(LEDGER_FILE), 'ledger INSIDE the brain (containment contract): ' + LEDGER_FILE);
assert.ok(/\.guests\.json$/.test(LEDGER_FILE), 'per-brain dotted filename');

function resetLedger() {
    try { fs.rmSync(LEDGER_FILE, { force: true }); } catch (e) {}
    guests = load();
}

// ---------- token lifecycle ----------

test('issue: vguest_ token shape, ONE raw secret, public projection has no hash', () => {
    resetLedger();
    const out = guests.issue('pin-oper', { ...OPT, role: 'human' });
    assert.ok(/^vguest_[A-Za-z0-9_-]+_[A-Za-z0-9_-]{24,64}$/.test(out.token), 'token shape: ' + out.token);
    assert.strictEqual(out.guest.role, 'human');
    assert.ok(!('tokenHash' in out.guest), 'public projection must never carry the hash');
    const listed = guests.list(OPT);
    assert.ok(listed.every(g => !('tokenHash' in g)), 'list() outputs are safe projections');
});

test('verify: exact token works; wrong secret, malformed, and unknown-id all refuse', () => {
    resetLedger();
    const out = guests.issue('pin-verify', OPT);
    assert.ok(guests.verify(out.token, OPT), 'correct token verifies');
    assert.strictEqual(guests.verify('vguest_nope_' + 'z'.repeat(30), OPT), null, 'unknown id refuses');
    assert.strictEqual(guests.verify(out.token.replace(/[A-Za-z0-9_-]{6}$/, 'zzzzzzz'), OPT), null, 'tampered secret refuses');
    assert.strictEqual(guests.verify('vant_' + out.token.slice('vguest_'.length)), null, 'wrong prefix refuses (habitat tokens are NOT guests)');
});

test('verify: hashed at rest — the ledger holds sha256, never the raw token', () => {
    resetLedger();
    const out = guests.issue('pin-arestd', OPT);
    const raw = fs.readFileSync(LEDGER_FILE, 'utf8');
    assert.ok(!raw.includes(out.token), 'raw token must not exist on disk');
    const { sha256 } = require(path.join(ROOT, 'lib', 'hash'));
    assert.ok(raw.includes(sha256(out.token)), 'sha256 hash IS on disk');
});

test('role capability maps ride the sandbox vocabulary (observer read-only; human has spawn; agent adds exec)', () => {
    resetLedger();
    const o = guests.verify(guests.issue('pin-r-obs', { ...OPT, role: 'observer' }).token, OPT);
    const h = guests.verify(guests.issue('pin-r-hum', { ...OPT, role: 'human' }).token, OPT);
    const a = guests.verify(guests.issue('pin-r-agt', { ...OPT, role: 'agent' }).token, OPT);
    assert.deepStrictEqual(o.caps, ['canRead', 'canLoad', 'canList']);
    assert.ok(h.caps.includes('canWrite') && h.caps.includes('canSpawn'), 'the #185 acceptance: a remote browser can spawn work');
    assert.ok(!h.caps.includes('canExec'), 'exec stays a working-peer capability');
    assert.ok(a.caps.includes('canExec'));
});

test('trust levels RESTRICT only: medium keeps grants, low strips exec+spawn, none caps to read', () => {
    resetLedger();
    const iTok = (n, extra) => { const r = guests.issue(n, { ...OPT, ...extra }); const v = guests.verify(r.token, OPT); if (process.env.DEBUG_GUESTS) console.log('    [debug tok]', n, JSON.stringify(r.guest.id), 'verify:', !!v); return v; };
    const med = iTok('pin-t-med-x' + Date.now() % 10000, { role: 'agent' });
    const low = iTok('pin-t-low-x' + Date.now() % 10000, { role: 'agent', trustLevel: 'low' });
    const none = iTok('pin-t-none-x' + Date.now() % 10000, { role: 'agent', trustLevel: 'none' });
    assert.ok(med && low && none, 'all three trust variants verify: med=' + !!med + ' low=' + !!low + ' none=' + !!none);
    assert.ok(med.caps.includes('canSpawn') && med.caps.includes('canExec'));
    assert.ok(!low.caps.includes('canExec') && !low.caps.includes('canSpawn') && low.caps.includes('canWrite'));
    assert.deepStrictEqual(none.caps, ['canRead', 'canLoad', 'canList'], 'none = read-only even for the agent role');
});

// ---------- door gate ----------

test('door gate: observers are read-only; unknown tool class counts as WRITE (fail-closed)', () => {
    resetLedger();
    const o = guests.verify(guests.issue('pin-g-obs', { ...OPT, role: 'observer' }).token, OPT);
    assert.ok(guests.authorize('brain_load', o).allowed);
    assert.ok(guests.authorize('nodes_status', o).allowed);
    assert.strictEqual(guests.authorize('brain_save', o).reasonCode, 'E_GUEST_CAP');
    assert.strictEqual(guests.authorize('some_totally_unknown_tool', o).reasonCode, 'E_GUEST_CAP', 'unknown fails closed for observers');
});

test('door gate: spawn-class verbs check canSpawn, not just canWrite', () => {
    resetLedger();
    const mk = (n, extra) => { const t = guests.issue(n, { ...OPT, ...extra }).token; const v = guests.verify(t, OPT); if (process.env.DEBUG_GUESTS) console.log('    [debug spawn]', n, JSON.stringify(v && v.caps)); return v; };
    const h = mk('pin-g-hum', { role: 'human' });
    assert.ok(guests.authorize('agent_spawn', h).allowed, 'operator dashboards assign work');
    assert.ok(guests.authorize('brain_save', h).allowed);
    const low = mk('pin-g-low', { role: 'human', trustLevel: 'low' });
    const verdict = guests.authorize('agent_spawn', low);
    if (process.env.DEBUG_GUESTS) console.log('    [debug spawn] low verdict', JSON.stringify(verdict));
    assert.strictEqual(verdict.reasonCode, 'E_GUEST_CAP', 'low trust floors spawn');
});

test('door gate: exec-class verbs check canExec; guest management is ADMIN-only for every role', () => {
    resetLedger();
    const h = guests.verify(guests.issue('pin-g-exec', { ...OPT, role: 'human' }).token, OPT);
    assert.strictEqual(guests.authorize('sudo_shell', h).reasonCode, 'E_GUEST_CAP');
    for (const role of ['observer', 'human', 'agent']) {
        const g = guests.verify(guests.issue('pin-g-admin-' + role, { ...OPT, role }).token, OPT);
        assert.strictEqual(guests.authorize('guest_list', g).reasonCode, 'E_GUEST_ADMIN', role + ' can never enumerate or manage guests');
    }
});

// ---------- revocation (the H1 seam) ----------

test('revoke: denylist-backed — instant, by id or name, and SURVIVES a reload', () => {
    resetLedger();
    const out = guests.issue('pin-revoke-me', OPT);
    assert.ok(guests.verify(out.token, OPT), 'pre-revoke verifies');
    const id = guests.list(OPT).find(g => g.name === 'pin-revoke-me').id;
    assert.ok(guests.revoke(id, OPT));
    assert.strictEqual(guests.verify(out.token, OPT), null, 'revoked = dead in-process');
    guests = load(); // simulate a fresh process
    assert.strictEqual(guests.verify(out.token, OPT), null, 'revocation survives reload (denylist, not stateless)');
    assert.strictEqual(guests.revoke(id, OPT), false, 'double-revoke is an honest no-op');
});

test('expiry: an expired guest refuses even though the row still exists', () => {
    resetLedger();
    const out = guests.issue('pin-exp', { ...OPT, expires: 5 }); // 5ms window
    const deadline = Date.now() + 50;
    assert.ok(guests.verify(out.token, OPT), 'inside the window verifies');
    while (Date.now() < deadline) { /* wait out the 5ms window */ }
    assert.strictEqual(guests.verify(out.token, OPT), null, 'expired refuses');
});

// ---------- pairing voucher ----------

test('pairing: hashed in the ledger, single-use, wrong code refuses timing-safely', () => {
    resetLedger();
    assert.ok(guests.offerPairing('vhpair-pin001', OPT), 'code hash persists');
    const raw = fs.readFileSync(LEDGER_FILE, 'utf8');
    assert.ok(!raw.includes('pin001'), 'the ledger holds a HASH, not the code');
    assert.strictEqual(guests.pair('vhpair-wrongcode', OPT).reason, 'pairing code mismatch');
    const redeemed = guests.pair('vhpair-pin001', OPT);
    if (process.env.DEBUG_GUESTS) console.log('    [debug redeemed]', JSON.stringify(redeemed).slice(0, 300));
    assert.ok(redeemed.token && /^vguest_/.test(redeemed.token), 'redemption issues the operator guest');
    assert.strictEqual(redeemed.guest.role, 'human');
    assert.strictEqual(guests.pendingPairing(OPT), null, 'pending row consumed');
    assert.strictEqual(guests.pair('vhpair-pin001', OPT).ok, false, 'second use refuses (voucher, not credential)');
});

// ---------- async door integration (the real MCP exec path) ----------

async function asyncIntegrations() {
    const net = await new Promise((resolve) => {
        const srv = require('net').createServer();
        srv.listen(0, '127.0.0.1', () => { resolve(srv.address().port); srv.close(); });
    });
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));

    // The DOOR resolves guests against the ACTIVE brain (it has no brain
    // override — in production there is exactly one). So this test uses the
    // active brain's ledger (guests.issue default), not a scratch brain.
    const active = (() => { try { return require(path.join(ROOT, 'lib', 'brain')).getCurrentBrain(); } catch (e) { return 'vant'; } })();
    const DOPT = { brain: active };
    try { guests._resetForTest(); } catch (e) {}
    const prevLedger = (() => { try { return fs.readFileSync(guests._ledgerPath(active), 'utf8'); } catch (e) { return null; } })();
    // Unique names: the active-brain ledger is shared state and this minute
    // (prevLedger) may legally still hold rows from prior runs.
    const UQ = Date.now().toString(36);
    const issuedObs = guests.issue('pin-door-obs-' + UQ, { ...DOPT, role: 'observer' });
    const issuedHum = guests.issue('pin-door-hum-' + UQ, { ...DOPT, role: 'human' });
    const obs = issuedObs.token;
    const hum = issuedHum.token;

    await (async () => {
        await mcp.start({ port: net, bind: '127.0.0.1' });
        const post = (token, tool) => new Promise(async (resolve, reject) => {
            const res = await fetch('http://127.0.0.1:' + net + '/mcp/exec', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ tool })
            });
            const body = await res.json().catch(() => ({}));
            resolve({ status: res.status, body });
        });

        const { status: okWrite, body: wb } = await post(hum, 'brain_save');
        assert.strictEqual(okWrite, 200, 'human guest passes the door for a write verb');
        assert.ok(!wb.error, 'brain_save via human guest executes: ' + JSON.stringify(wb).slice(0, 80));

        const deny = await post(obs, 'brain_save');
        assert.strictEqual(deny.status, 403, 'observer is denied a write at the door');
        assert.strictEqual(deny.body && deny.body.error && deny.body.error.reasonCode, 'E_GUEST_CAP');

        const admin = await post(hum, 'guest_list');
        assert.strictEqual(admin.status, 403, 'a guest can never manage guests, from the REAL door');

        const bad = await post('vguest_' + 'g' + 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzz', 'brain_load');
        assert.strictEqual(bad.status, 401, 'a malformed guest token is a 401, never an anonymous downgrade');

        // revoke kills an already-connected client at once (BY CAPTURED ID —
        // never a name lookup on shared state)
        guests.revoke(issuedHum.guest.id, DOPT);
        const dead = await post(hum, 'brain_load');
        assert.strictEqual(dead.status, 401, 'revoked token = locked out at once');
    })();

    try { await mcp.stop();
    } catch (e) { /* best effort */ }
    guests._resetForTest();
    // restore whatever ledger the active brain held before this test
    if (prevLedger !== null) {
        fs.mkdirSync(require('path').dirname(guests._ledgerPath(active)), { recursive: true });
        fs.writeFileSync(guests._ledgerPath(active), prevLedger);
    }
    guests = load();
}

// ---------- auth.js seam ----------

async function run() {
    try {
        await asyncIntegrations();
        console.log('  ✓ door integration: guest ctx + 403/401 + live revocation');
        passed++;
    } catch (e) { failed++; console.log('  ✗ door integration — ' + e.message); }

    test('auth.js seam: access level, real checkPermission verdicts, revoke routing', () => {
        const active = (() => { try { return require(path.join(ROOT, 'lib', 'brain')).getCurrentBrain(); } catch (e) { return 'vant'; } })();
        const SOPT = { brain: active }; // same contract: checkPermission has no brain override
        const prevLedger = (() => { try { return fs.readFileSync(guests._ledgerPath(active), 'utf8'); } catch (e) { return null; } })();
        resetLedger();
        const { Auth } = require(path.join(ROOT, 'lib', 'auth'));
        const a = new Auth();
        const out = guests.issue('pin-seam', { ...SOPT, role: 'observer' });
        assert.strictEqual(a.getAccessLevel(out.token), 'guest-observer', 'guest keys grade through their own identity');
        assert.deepStrictEqual(a.checkPermission(out.token, 'canWrite'), { allowed: false, permissionEnforced: true, layer: 'guests' });
        assert.strictEqual(a.checkPermission(out.token, 'brain_save').reasonCode, 'E_GUEST_CAP');
        assert.strictEqual(a.checkPermission(out.token, 'brain_load').allowed, true);
        assert.strictEqual(a.checkPermission(out.token, 'guest_list').reasonCode, 'E_GUEST_ADMIN');
        const id = guests.list(SOPT).find(g => g.name === 'pin-seam').id;
        const revoked = a.revokeToken(out.token);
        assert.strictEqual(revoked.denylist, true, 'vguest_ revocation routes to the denylist');
        assert.strictEqual(guests.verify(out.token, OPT), null, 'the auth-layer revoke KILLS the token');
        assert.strictEqual(a.getAccessLevel(out.token), 'none', 'post-revoke = none');
        assert.ok(a.revokeToken('a-shared-key').stateless, 'shared keys keep their honest statelessness');
        if (prevLedger !== null) {
            fs.mkdirSync(require('path').dirname(guests._ledgerPath(active)), { recursive: true });
            fs.writeFileSync(guests._ledgerPath(active), prevLedger);
        }
        guests._resetForTest();
    });

    // ---------- pass 213 H5: per-tenant LIST filtering ----------
    // Closes the pass-211 declared runway: org-wide roster surfaces filter an
    // unscoped guest view nothing. The tenant rule is MEMBER truth through
    // scope.resolveMembers + the teams rows; fail-closed at every miss.
    async function h5TenantPins() {
        const prevBrain = process.env.VANT_BRAIN;
        process.env.VANT_BRAIN = BRAIN; // scope door state to the throwaway brain
        try {
            const _sb = require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox;
            _sb.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });
            const teams = require(path.join(ROOT, 'lib', 'teams'));
            const agents = require(path.join(ROOT, 'lib', 'agents'));
            const mcp = require(path.join(ROOT, 'lib', 'mcp'));
            const scope = require(path.join(ROOT, 'lib', 'scope'));
            const uniq = Date.now().toString(36);

            test('H5 matcher: tenantVisible — public row / own row / stranger row / scoped row vs default tenant', () => {
                const teamRef = 'team:pin_' + uniq;
                assert.strictEqual(guests.tenantVisible(null, teamRef), true, 'unscoped record = public');
                assert.strictEqual(guests.tenantVisible(teamRef, teamRef), true, 'own tenant row');
                assert.strictEqual(guests.tenantVisible('team:stranger_' + uniq, teamRef), false, 'another team row withheld');
                assert.strictEqual(guests.tenantVisible(teamRef, null), false, 'scoped row vs the default tenant withheld');
            });

            test('H5 matcher: ancestry — org sees its dept + chained team; dept sees its team; unrelated denies', async () => {
                const org = teams.createOrg('H5org_' + uniq);
                assert.ok(!org.error && org.id, 'org created: ' + JSON.stringify(org).slice(0, 80));
                const dept = teams.createDept(org.id, 'H5dept_' + uniq);
                assert.ok(!dept.error && dept.id, 'dept created: ' + JSON.stringify(dept).slice(0, 80));
                const team = teams.createTeam('H5team_' + uniq, { dept: dept.id });
                assert.ok(!team.error && team.id, 'team created: ' + JSON.stringify(team).slice(0, 80));
                assert.strictEqual(guests.tenantVisible('dept:' + dept.id, 'org:' + org.id), true, 'org ancestor sees dept row');
                assert.strictEqual(guests.tenantVisible('team:' + team.id, 'org:' + org.id), true, 'org ancestor sees its chained team row');
                assert.strictEqual(guests.tenantVisible('team:' + team.id, 'dept:' + dept.id), true, 'dept ancestor sees its team row');
                // member truth: an agent inside the container sees its rows
                const memberTeam = teams.createTeam('H5mteam_' + uniq, { dept: dept.id });
                const guestRef = 'agent:probe_' + uniq;
                // Member truth: the matcher agrees with resolveMembers itself.
                const memberOfTeam = (scope.resolveMembers('team:' + memberTeam.id) || new Set()).has('probe_' + uniq);
                assert.strictEqual(guests.tenantVisible('team:' + memberTeam.id, guestRef), memberOfTeam, 'agent member truth honored (consistency with resolveMembers)');
            });

            test('H5 matcher: tenantAgentVisible — exact agent scope; container membership; fail-closed misses', async () => {
                assert.strictEqual(guests.tenantAgentVisible('agent_1', 'agent:agent_1'), true, 'agent-scoped guest sees itself');
                assert.strictEqual(guests.tenantAgentVisible('agent_1', 'agent:agent_2'), false, 'another agent withheld');
                assert.strictEqual(guests.tenantAgentVisible('agent_1', null), false, 'unscoped guest = no roster');
                assert.strictEqual(guests.tenantAgentVisible('agent_1', 'org:entity_' + uniq + '_nonesuch'), false, 'unknown container = fail-closed deny');
            });

            // Door-level: the REAL filtered views across /mcp/exec.
            const port = 13477 + (process.pid % 40);
            const call = async (hdrs) => {
                const res = await fetch('http://127.0.0.1:' + port + '/mcp/exec', {
                    method: 'POST',
                    headers: Object.assign({ 'Content-Type': 'application/json' }, hdrs || {}),
                    body: JSON.stringify({ tool: 'agent_list', args: {} })
                });
                const body = await res.json();
                return body.result;
            };

            await (async () => {
                // Build: org->dept->team, two agents (one assigned), scoped + bare guests.
                const org = teams.createOrg('H5doororg_' + uniq);
                const dept = teams.createDept(org.id, 'H5doordept_' + uniq);
                const team = teams.createTeam('H5doorteam_' + uniq, { dept: dept.id });
                const a1 = agents.spawn({ name: 'H5TenantBot_' + uniq });
                const a2 = agents.spawn({ name: 'H5StrangerBot_' + uniq });
                if (a1.error || a2.error) { failed++; console.log('  ✗ H5 door: agent spawn refused — ' + (a1.error || a2.error)); return; }
                const asg = teams.assign(a1.id, { team: team.id });
                if (asg && asg.error) { failed++; console.log('  ✗ H5 door: assign refused — ' + asg.error); return; }
                const guestTok = guests.issue('pin-h5-guest', { role: 'human', scopeOwner: 'team:' + team.id }).token;
                const bareTok = guests.issue('pin-h5-bare', { role: 'human' }).token;

                await mcp.start({ port, silent: true });
                try {
                    const host = await call();
                    const guestView = await call({ Authorization: 'Bearer ' + guestTok });
                    const bareView = await call({ Authorization: 'Bearer ' + bareTok });
                    const namesOf = (r) => (r && Array.isArray(r.agents)) ? r.agents.map(a => a.name) : [];
                    const hN = namesOf(host), gN = namesOf(guestView), bN = namesOf(bareView);
                    let ok = true, why = [];
                    if (!hN.includes(a1.name) || !hN.includes(a2.name)) { ok = false; why.push('host view lost rows: ' + hN.length); }
                    if (gN.length !== 1 || gN[0] !== a1.name) { ok = false; why.push('guest view wrong: ' + JSON.stringify(gN)); }
                    if (bN.length !== 0) { ok = false; why.push('bare guest not empty: ' + JSON.stringify(bN)); }
                    if (guestView.count !== undefined && guestView.count !== 1) { ok = false; why.push('count mismatch: ' + guestView.count); }
                    passed += ok ? 1 : 0; failed += ok ? 0 : 1;
                    console.log(ok ? '  ✓ H5 door: host sees all, team guest sees ONLY its member, bare guest sees none' : '  ✗ H5 door: ' + why.join('; '));
                } finally {
                    await mcp.stop();
                }
            })();
        } catch (e) {
            failed++;
            console.log('  ✗ H5 block error — ' + (e.stack || e.message));
        } finally {
            if (prevBrain === undefined) delete process.env.VANT_BRAIN; else process.env.VANT_BRAIN = prevBrain;
        }
    }

    await h5TenantPins();

    console.log('\n=== guests: ' + passed + ' passed, ' + failed + ' failed ===\n');
    process.exit(failed > 0 ? 1 : 0);
}

run();
