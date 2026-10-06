#!/usr/bin/env node
/**
 * Teams refresh seam tests (pass 53 — closes the pass-52 JV gap)
 *
 * The pass-52 two-org exercise caught it: teams.js hydrated its org model
 * ONCE via an async IIFE at module init, so a long-lived node could never
 * see org-model writes made by another process after its boot —
 * receiving-side scope gates were boot-race-dependent (correct by luck of
 * timing, denied real members forever on the bad branch).
 *
 * Pins:
 *   1. refresh seam exists; merge-only rehydrate rebuilds a wiped view
 *   2. stale view rescued: a write made "after boot" is adopted by refresh
 *   3. throttle: refresh() is rate-limited (force bypasses)
 *   4. scope.resolveMembers miss -> throttled sync refresh -> retry hits
 *      (the actual gate-level fix; still fail-closed for unknown entities)
 *   5. merge-only: in-memory wins on conflict, disk never overwrites local
 *   6. brain resolution via state-store (VANT_BRAIN env) — teams.json AND
 *      escrow.json land in the SAME brain as protocol state
 *
 * Run: node test/teams-refresh.test.js
 */

const path = require('path');
const fs = require('fs');

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

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

// Clean brain state BEFORE requiring modules (load-on-init races rm).
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'orgchart'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'state'), { recursive: true, force: true });

const teams = require(path.join(ROOT, 'lib', 'teams'));
const scope = require(path.join(ROOT, 'lib', 'scope'));
const escrowMod = require(path.join(ROOT, 'lib', 'escrow'));

const TEAMS_FILE = path.join(ROOT, 'models', 'private', 'vant', 'orgchart', 'teams.json');
const settle = (ms) => new Promise((r) => setTimeout(r, ms)); // _saveTeams is async (fire-and-forget)

async function main() {
    console.log('\n🔄 TEAMS REFRESH SEAM TESTS (pass 53)\n');

    // Seed the persisted org model: org r53-o > dept r53-d > team
    // r53-shared + one member. Writes flush asynchronously, so settle
    // before treating the store as authoritative.
    await test('refresh seam exists; merge-only rehydrate rebuilds a wiped view', async () => {
        assert(typeof teams.refresh === 'function' && typeof teams._resetHydration === 'function' && typeof teams._refreshSync === 'function',
            'refresh seam not exported');
        const org = teams.createOrg('r53-o');
        const dept = teams.createDept('r53-d', { org: org.id });
        const team = teams.createTeam('r53-shared', { dept: dept.id });
        const a = teams.assign('r53-member', { org: org.id, dept: dept.id, team: team.id });
        assert(!a || !a.error, 'seed assign failed: ' + JSON.stringify(a));
        await settle(120); // write-through flush

        // Simulate a process that booted BEFORE the model existed:
        teams._resetHydration();
        const r = teams._refreshSync({ force: true });
        assert(r.refreshed === true && r.merged >= 3, 'merge rehydrate did not adopt the persisted model: ' + JSON.stringify(r));
        const members = scope.resolveMembers('team:' + team.id);
        assert(members && members.has('r53-member'), 'members not resolvable after rehydrate');
    });

    let lateTeamId = null;
    await test('stale view rescued: a write made "after boot" is adopted by refresh', async () => {
        // Another "process" adds a team by writing the store directly
        // (same-disk multi-process contract) — our in-memory view is stale.
        const base = JSON.parse(fs.readFileSync(TEAMS_FILE, 'utf8'));
        const lateTeam = {
            id: 'team_r53_late_' + Date.now().toString(36),
            name: 'r53-late',
            dept: base.depts[0].id,
            roles: [],
            members: [],
            created: Date.now()
        };
        base.teams.push(lateTeam);
        fs.writeFileSync(TEAMS_FILE, JSON.stringify(base, null, 2));
        lateTeamId = lateTeam.id;

        // ...refresh adopts it (forced to sidestep the throttle in-pin).
        const r = teams._refreshSync({ force: true });
        assert(r.refreshed === true, 'refresh failed: ' + JSON.stringify(r));
        const members = scope.resolveMembers('team:' + lateTeamId);
        assert(members !== null && members.size === 0, 'late team not adopted by refresh');
    });

    await test('throttle: refresh() is rate-limited; force bypasses', async () => {
        teams._refreshSync({ force: true }); // prime _lastRefresh
        const throttled = await teams.refresh();
        assert(throttled.refreshed === false && throttled.throttled === true, 'refresh() not throttled: ' + JSON.stringify(throttled));
        const forced = await teams.refresh({ force: true });
        assert(forced.refreshed === true, 'force bypass failed: ' + JSON.stringify(forced));
    });

    await test('scope miss -> sync refresh -> retry HITS (the gate-level fix)', async () => {
        // Another "process" assigns a member to the late team on disk.
        const base = JSON.parse(fs.readFileSync(TEAMS_FILE, 'utf8'));
        base.assignments.push({ agentId: 'r53-late-member', org: base.depts[0].org, dept: base.depts[0].id, team: lateTeamId, assigned: Date.now() });
        fs.writeFileSync(TEAMS_FILE, JSON.stringify(base, null, 2));

        // Fresh-stale boot: wipe memory + throttle window; the in-memory
        // view does NOT know the late team or its member.
        teams._resetHydration(); // also resets _lastRefresh -> rescue unthrottled

        // The GATE path: resolveMembers misses (stale view), fires the
        // throttled sync refresh, retries, and admits the real member.
        const members = scope.resolveMembers('team:' + lateTeamId);
        assert(members !== null, 'stale view NOT rescued by the miss-retry (the pass-52 gap)');
        assert(members.has('r53-late-member'), 'late member not in the rescued member set');

        // Fail-closed preserved: an entity that exists NOWHERE stays denied.
        assert(scope.resolveMembers('team:r53-ghost-never-existed') === null, 'ghost team must stay denied');
        assert(scope.canAccess({ scope: { owner: 'team:r53-ghost-never-existed', visibility: 'scope' } }, 'r53-late-member') === false,
            'canAccess must stay fail-closed for unknown entities');
    });

    await test('merge-only: in-memory wins on conflict; disk never overwrites local', async () => {
        // Rewrite the persisted team with a CONFLICTING same-id record.
        const base = JSON.parse(fs.readFileSync(TEAMS_FILE, 'utf8'));
        const local = base.teams.find((t) => t.id === lateTeamId);
        base.teams = base.teams.map((t) => (t.id === lateTeamId ? { ...t, name: 'r53-RENAMED-ON-DISK' } : t));
        fs.writeFileSync(TEAMS_FILE, JSON.stringify(base, null, 2));

        const r = teams._refreshSync({ force: true });
        assert(r.refreshed === true, 'refresh failed');
        // In-memory record keeps its identity: resolution by the LOCAL name
        // still hits, and the same-id record was not overwritten.
        const stillLocal = scope.resolveMembers('team:' + lateTeamId);
        assert(stillLocal !== null, 'local team lost after refresh');
        const listed = teams.listTeams().filter((t) => t.id === lateTeamId);
        assert(listed.length === 1 && listed[0].name === local.name, 'disk record OVERWROTE in-memory state: ' + JSON.stringify(listed[0]));
        // Restore the on-disk name for later pins.
        const base2 = JSON.parse(fs.readFileSync(TEAMS_FILE, 'utf8'));
        fs.writeFileSync(TEAMS_FILE, JSON.stringify({ ...base2, teams: base2.teams.map((t) => (t.id === lateTeamId ? local : t)) }, null, 2));
        teams._refreshSync({ force: true });
    });

    await test('brain resolution via state-store: VANT_BRAIN env routes teams.json AND escrow.json to the same brain', async () => {
        const altDir = path.join(ROOT, 'models', 'private', 'r53-alt', 'orgchart');
        fs.rmSync(path.join(ROOT, 'models', 'private', 'r53-alt'), { recursive: true, force: true });
        process.env.VANT_BRAIN = 'r53-alt';
        try {
            const org = teams.createOrg('r53-alt-org');
            assert(org && org.id, 'alt-brain org create failed');
            assert(fs.existsSync(path.join(altDir, 'teams.json')), 'teams.json did not land in the VANT_BRAIN brain');

            const esc = new escrowMod.Escrow();
            esc.setBudgetLimit('r53-alt-agent', 10);
            assert(fs.existsSync(path.join(altDir, 'escrow.json')), 'escrow.json did not land in the VANT_BRAIN brain');
        } finally {
            delete process.env.VANT_BRAIN;
            fs.rmSync(path.join(ROOT, 'models', 'private', 'r53-alt'), { recursive: true, force: true });
        }
    });

    console.log(`\n=== Teams refresh seam: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Test harness error:', e);
    process.exit(1);
});
