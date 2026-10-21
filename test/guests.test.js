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

// (pass 271) the pass-253 rule applies here too — the suite issues through
// the roster cap and need NOT depend on a sibling suite's env bump in the
// same parent (run-all spawns suites with fresh envs). Un-cap BEFORE the
// lib require, in THIS suite's own process.
process.env.VANT_GUESTS_MAX = '500';

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

// (pass 287 QC) Async-aware pin helper for the door-integration section: the
// sync `test()` above counts a pass BEFORE the promise it holds settles, so
// an async assert rejection surfaced as an unhandled rejection while the
// tally said pass (the H5 ancestry pin hid its quota failure exactly this
// way.) An async pin AWAITS in place: callers `await testA(...)` so the
// tally can never claim a pin the promise hasn't honored.
function testA(name, fn) {
    return Promise.resolve().then(fn)
        .then(() => { passed++; console.log('  ✓ ' + name); })
        .catch((e) => { failed++; console.log('  ✗ ' + name + ' — ' + (e.message || e)); });
}

const BRAIN = 'gstest';
const OPT = { brain: BRAIN };   // the throwaway-brain opts every pin below rides

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
    // (pass 287) the ACTIVE name is the path-active seam (VANT_BRAIN env >
    // state.json > 'vant') — the bare getCurrentBrain() here was the same
    // stale resolver the lib just moved OFF (see the pass-287 note in
    // lib/guests.js _brainName), so env-scoped runs issued guests into the
    // env brain while this read looked at the stack-head brain.
    const { resolveActiveBrain } = require('./active-brain');
    const active = resolveActiveBrain(ROOT);
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
        // plain async fn: same behavior, no async promise executor
        const post = async (token, tool) => {
            const res = await fetch('http://127.0.0.1:' + net + '/mcp/exec', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ tool })
            });
            const body = await res.json().catch(() => ({}));
            return { status: res.status, body };
        };

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

    // ---------- pass 271 (prd-relay §5, rung P6b): the redeem IS the key
    // binding moment — the e2e relay channelKey rides the SAME one-time
    // redeem reply as the raw token, delivered ONLY when the pod's ride
    // face is really armed (relay.enabled + relay.channelKey). The door
    // pins here: an armed pod hands the RAW key exactly once; an unbound
    // pod answers honestly (e2e:'unbound', no fake key ever).
    await (async () => {
        const config = require(path.join(ROOT, 'lib', 'config'));
        const pre = { enabled: config.get('relay.enabled'), key: config.get('relay.channelKey') };
        const CK = ('e2etest').padEnd(8, 't').split('').join('') + require('crypto').randomBytes(24).toString('hex'); // len 64
        const voucher = (n) => {
            const nm = 'vhpair-kbind-' + n + '-' + Date.now().toString(36);
            const gopt = { brain: active };
            guests.offerPairing(nm, gopt);
            return nm;
        };
        const redeemDoor = async (code) => {
            const res = await fetch('http://127.0.0.1:' + net + '/mcp/exec', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },   // redeem: UNAUTHED-class by design
                body: JSON.stringify({ tool: 'pairing_voucher_redeem', args: { code } })
            });
            const body = await res.json().catch(() => ({}));
            return (body && typeof body === 'object' && body.result ? body.result : body);
        };
        try {
            // K1: the ARMED posture — the key binds into the one-time reply
            config.set('relay.enabled', 'true');
            config.set('relay.channelKey', CK);
            const armed = await redeemDoor(voucher('armed'));
            assert.ok(armed && armed.ok && /^vguest_/.test(armed.token || ''), 'armed redeem still issues the guest identity');
            assert.strictEqual(armed.e2e, 'bound', 'armed pod states e2e:bound');
            assert.strictEqual(armed.channelKey, CK, 'the RAW channel key rides the one-time reply (binding moment)');

            // K2: the UNBOUND pod — honest e2e:'unbound', no fabricated key
            config.set('relay.enabled', 'false');
            config.set('relay.channelKey', null);
            const unbound = await redeemDoor(voucher('disarmed'));
            assert.ok(unbound && unbound.ok && unbound.token, 'unbound redeem still pairs');
            assert.strictEqual(unbound.e2e, 'unbound', 'unbound pod answers honestly');
            assert.ok(!('channelKey' in unbound), 'no fake key on an unbound pod');
        } finally {
            config.set('relay.enabled', pre.enabled);
            config.set('relay.channelKey', pre.key);
        }
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
        // (pass 287) the seam env (lib/guests._brainName) resolves
        // VANT_BRAIN-first now; the helper lives in test/active-brain.js.
        const active = require('./active-brain').resolveActiveBrain(ROOT);
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
        void guests.list(SOPT).find(g => g.name === 'pin-seam').id;   // presence probe
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

    // (pass 287 QC) The auth-seam pin runs at run() scope: resolve the
    // ACTIVE brain name here too (the helper lives in test/active-brain.js
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

            // (pass 287 QC) Fresh org-model slate: the throwaway brain's
            // orgchart store is shared across runs, and residue past teams'
            // dept quota (max 50) made every later org write fail E_QUOTA —
            // the H5 matcher then compared against half-built hierarchies
            // (and the async assert rejection was swallowed as an unhandled
            // rejection while the tally said pass). Empty the store + drop
            // hydration so this run's rows are the only rows.
            try {
                fs.writeFileSync(path.join(ROOT, 'models', 'private', BRAIN, 'orgchart', 'teams.json'),
                    JSON.stringify({ orgs: [], depts: [], teams: [], roles: [], assignments: [] }));
                teams._resetHydration();
            } catch (e) { /* store absent/unwritable: run on what's there */ }
            // (pass 287 QC) Same residue law for the crew roster: the agents
            // store accumulates across runs and agents.maxAgents (default 10)
            // tripped the door pin's spawn. The public full-wipe contract
            // (restoreState with an empty roster) clears memory AND persists —
            // its empty path tombstones the disk ids so the save's
            // newcomer-merge cannot resurrect them (a silent wipe failure
            // fails loudly right below, on the spawn's quota refusal).
            try { await agents.restoreState({ agents: [] }); } catch (e) { /* store absent: run on what's there */ }

            test('H5 matcher: tenantVisible — public row / own row / stranger row / scoped row vs default tenant', () => {
                const teamRef = 'team:pin_' + uniq;
                assert.strictEqual(guests.tenantVisible(null, teamRef), true, 'unscoped record = public');
                assert.strictEqual(guests.tenantVisible(teamRef, teamRef), true, 'own tenant row');
                assert.strictEqual(guests.tenantVisible('team:stranger_' + uniq, teamRef), false, 'another team row withheld');
                assert.strictEqual(guests.tenantVisible(teamRef, null), false, 'scoped row vs the default tenant withheld');
            });

            await testA('H5 matcher: ancestry — org sees its dept + chained team; dept sees its team; unrelated denies', async () => {
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

            await testA('H5 matcher: tenantAgentVisible — exact agent scope; container membership; fail-closed misses', async () => {
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
                if (org.error || dept.error || team.error) { failed++; console.log('  ✗ H5 door: org build refused — ' + JSON.stringify(org) + ' ' + JSON.stringify(dept) + ' ' + JSON.stringify(team)); return; }
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

    // ---------- pass 214: msg channel-scope (owner concept) at the door ----------
    // Channels gain a claim-once owner ref; the door applies the same tenant
    // posture agent_list got in pass 213: foreign scoped channels are withheld
    // on msg_list (honest empty) and REFUSED on msg_send (typed E_TENANT_CHANNEL,
    // BEFORE the write); a first guest write to an UNOWNED channel stamps the
    // guest's scopeOwner (claim-once); unscoped channels stay public.
    async function csChannelDoor() {
        const prevBrain = process.env.VANT_BRAIN;
        process.env.VANT_BRAIN = BRAIN;
        try {
            const _sb = require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox;
            _sb.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });
            const guests2 = require(path.join(ROOT, 'lib', 'guests'));
            const msg = require(path.join(ROOT, 'lib', 'msg'));
            const mcp = require(path.join(ROOT, 'lib', 'mcp'));
            const u = Date.now().toString(36);
            // Host setup: one public channel, one foreign-tenant channel.
            msg.send('cspub_' + u, { from: 'host', content: 'public board' });
            const b = msg.setChannelOwner('csfor_' + u, 'team:T2_' + u);
            if (!b || b.ok !== true) { failed++; console.log('  ✗ CS door: foreign channel bind refused — ' + JSON.stringify(b)); return; }
            msg.send('csfor_' + u, { from: 't2', content: 'secret of T2' });

            const gtok = guests2.issue('pin-cs-guest', { role: 'human', scopeOwner: 'team:T1_' + u }).token;
            const btok = guests2.issue('pin-cs-bare', { role: 'human' }).token;

            // (ci fix, pass 243d) OWN port family — this is the SECOND
            // mcp.start in this file (the H5 block above binds the same
            // 13477 family). Same-process close → rebind → fetch on the
            // SAME port kills the fetch when node's keep-alive pool hands
            // back a stale socket to the closed server (undici: 'fetch
            // failed' — the flake Actions caught). A distinct family keeps
            // the two door legs from ever sharing a port across a restart.
            const port = 13577 + (process.pid % 40);
            const call = async (tool, args, hdrs) => {
                const res = await fetch('http://127.0.0.1:' + port + '/mcp/exec', {
                    method: 'POST',
                    headers: Object.assign({ 'Content-Type': 'application/json' }, hdrs || {}),
                    body: JSON.stringify({ tool, args })
                });
                return (await res.json()).result;
            };
            const H = { Authorization: 'Bearer ' + gtok }, BH = { Authorization: 'Bearer ' + btok };
            await mcp.start({ port, silent: true });
            try {
                // 1) public channel readable by a scoped guest (proper message shape now).
                const r1 = await call('msg_list', { channel: 'cspub_' + u }, H);
                const ok1 = Array.isArray(r1) && r1.length === 1 && r1[0].from === 'host' && r1[0].content === 'public board' && typeof r1[0].timestamp === 'number';
                passed += ok1 ? 1 : 0; failed += ok1 ? 0 : 1;
                console.log(ok1 ? '  ✓ CS door: public channel readable by a scoped guest (proper message shape)' : '  ✗ CS door: public read — ' + JSON.stringify(r1));

                // 2) guest first-write to an UNOWNED channel stamps THEIR tenant.
                await call('msg_send', { channel: 'csown_' + u, content: 'hi team', from: 'guest' }, H);
                const ownRef = msg.channelOwner('csown_' + u);
                const ok2 = ownRef === 'team:T1_' + u;
                passed += ok2 ? 1 : 0; failed += ok2 ? 0 : 1;
                console.log(ok2 ? '  ✓ CS door: guest first-write claims the channel for its tenant (claim-once)' : '  ✗ CS door: owner=' + ownRef);

                // 3) guest reads its OWN tenant channel.
                const r3 = await call('msg_list', { channel: 'csown_' + u }, H);
                const ok3 = Array.isArray(r3) && r3.length === 1 && r3[0].content === 'hi team';
                passed += ok3 ? 1 : 0; failed += ok3 ? 0 : 1;
                console.log(ok3 ? '  ✓ CS door: guest lists its own tenant channel' : '  ✗ CS door: own list — ' + JSON.stringify(r3));

                // 4) foreign tenant channel: withheld on read, refused on write, content untouched.
                const r4 = await call('msg_list', { channel: 'csfor_' + u }, H);
                const ok4 = Array.isArray(r4) && r4.length === 0;
                passed += ok4 ? 1 : 0; failed += ok4 ? 0 : 1;
                console.log(ok4 ? '  ✓ CS door: foreign tenant channel withheld on msg_list (no existence leak)' : '  ✗ CS door: foreign read — ' + JSON.stringify(r4));
                const r5 = await call('msg_send', { channel: 'csfor_' + u, content: 'intrude', from: 'guest' }, H);
                const after = msg.channelMessages('csfor_' + u);
                const ok5 = r5 && r5.ok === false && r5.code === 'E_TENANT_CHANNEL' && after.length === 1 && after[0].content === 'secret of T2';
                passed += ok5 ? 1 : 0; failed += ok5 ? 0 : 1;
                console.log(ok5 ? '  ✓ CS door: foreign write refused typed E_TENANT_CHANNEL BEFORE the write' : '  ✗ CS door: foreign send — ' + JSON.stringify(r5) + ' tail=' + JSON.stringify(after).slice(0, 80));

                // 5) hosts are untouched: full foreign read; and bare guests claim nothing.
                const r6 = await call('msg_list', { channel: 'csfor_' + u });
                const ok6 = Array.isArray(r6) && r6.length === 1 && r6[0].content === 'secret of T2';
                passed += ok6 ? 1 : 0; failed += ok6 ? 0 : 1;
                console.log(ok6 ? '  ✓ CS door: hosts unaffected — full channel read' : '  ✗ CS door: host read — ' + JSON.stringify(r6));
                await call('msg_send', { channel: 'csopen_' + u, content: 'default', from: 'bare' }, BH);
                const ok7 = msg.channelOwner('csopen_' + u) === null;
                passed += ok7 ? 1 : 0; failed += ok7 ? 0 : 1;
                console.log(ok7 ? '  ✓ CS door: scopeOwner-less guest claims nothing (unscoped = default tenant)' : '  ✗ CS door: bare claim owner=' + msg.channelOwner('csopen_' + u));
                const r8 = await call('msg_list', { channel: 'csfor_' + u }, BH);
                const ok8 = Array.isArray(r8) && r8.length === 0;
                passed += ok8 ? 1 : 0; failed += ok8 ? 0 : 1;
                console.log(ok8 ? '  ✓ CS door: bare guest cannot read another tenant\'s channel either' : '  ✗ CS door: bare foreign read — ' + JSON.stringify(r8));
            } finally {
                await mcp.stop();
            }
        } catch (e) {
            failed++;
            console.log('  ✗ CS door block error — ' + (e.stack || e.message));
        } finally {
            if (prevBrain === undefined) delete process.env.VANT_BRAIN; else process.env.VANT_BRAIN = prevBrain;
        }
    }

    await csChannelDoor();

    console.log('\n=== guests: ' + passed + ' passed, ' + failed + ' failed ===\n');
    process.exit(failed > 0 ? 1 : 0);
}

run();
