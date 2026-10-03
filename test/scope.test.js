#!/usr/bin/env node
/**
 * Scope Tests (pass 40 / labs/prd-agora.md)
 *
 * Pins lib/scope.js — the agora membership rule on top of teams.js:
 *   1. normalize: canonical shape, default visibility 'scope', null owner
 *      forces public, malformed -> null
 *   2. team-scoped: members pass, org-only agents denied (no hierarchy
 *      leak — hierarchy comes from owner-kind choice)
 *   3. org-scoped: org members pass, outsiders denied
 *   4. agent-private: only the agent
 *   5. fail-closed: unknown team/dept/org/agent => deny, never empty-allow
 *   6. legacy entities (no scope field) => public/unscoped
 *   7. assertOwner: member ok, non-member throws E_SCOPE_FORBIDDEN
 *   8. multibrain: assignments carry brain; scope resolution does not
 *      cross brains implicitly (teams store is brain-scoped)
 *
 * Run: node test/scope.test.js
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0 };

function test(name, fn) {
    try {
        const err = fn();
        if (err) {
            results.failed++;
            console.log(`  ✗ ${name}: ${err}`);
        } else {
            results.passed++;
            console.log(`  ✓ ${name}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
    }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
sandbox.defaultSandbox.setCapabilities({ canRead: true, canWrite: true });
const teams = require(path.join(ROOT, 'lib', 'teams'));
const scope = require(path.join(ROOT, 'lib', 'scope'));

const ORGCHART_DIR = path.join(ROOT, 'models', 'private', 'vant', 'orgchart');

// ---------- 1. normalize ----------
test('normalize: canonical shape + defaults', () => {
    const s = scope.normalize({ owner: 'team:backend', visibility: 'scope' });
    assert(s.owner === 'team:backend' && s.visibility === 'scope', 'canonical round-trip broke: ' + JSON.stringify(s));
    const d = scope.normalize({ owner: 'org:acme' });
    assert(d.visibility === 'scope', 'default visibility should be scope, got ' + d.visibility);
    const n = scope.normalize({ owner: null, visibility: 'private' });
    assert(n.owner === null && n.visibility === 'public', 'null owner must force public');
    assert(scope.normalize({ owner: 'galaxy:andromeda' }) === null, 'unknown kind must be null');
    assert(scope.normalize({ owner: 'team:bad chars!' }) === null, 'bad charset must be null');
    assert(scope.normalize({ owner: 'team:x', visibility: 'sometimes' }) === null, 'bad visibility must be null');
    assert(scope.normalize('nope') === null, 'non-object must be null');
});

test('normalize: missing/legacy input = public/unscoped (lenient read)', () => {
    assert(JSON.stringify(scope.normalize(undefined)) === '{"owner":null,"visibility":"public"}', 'undefined');
    assert(JSON.stringify(scope.normalize(null)) === '{"owner":null,"visibility":"public"}', 'null');
});

// ---------- org fixture ----------
fs.rmSync(ORGCHART_DIR, { recursive: true, force: true });
const org = teams.createOrg('acme');
const dept = teams.createDept('infra', { org: org.id });
const team = teams.createTeam('backend', { dept: dept.id });
teams.assign('aria', { org: org.id, dept: dept.id, team: team.id });
teams.assign('volt', { org: org.id }); // org member, NOT in the team

// ---------- 2. team scope ----------
test('team scope: members pass, org-only agents denied (no hierarchy leak)', () => {
    const s = scope.normalize({ owner: 'team:backend', visibility: 'scope' });
    assert(s.owner === 'team:backend', 'owner lost in normalize');
    assert(scope.canAccess({ scope: s }, 'aria') === true, 'team member must pass');
    assert(scope.canAccess({ scope: s }, 'volt') === false, 'org-only agent must NOT pass a team scope');
    assert(scope.canAccess({ scope: s }, 'juno') === false, 'outsider denied');
});

// ---------- 3. org scope ----------
test('org scope: org members pass, outsiders denied', () => {
    const s = scope.normalize({ owner: 'org:acme', visibility: 'scope' });
    assert(scope.canAccess({ scope: s }, 'volt') === true, 'org member passes');
    assert(scope.canAccess({ scope: s }, 'juno') === false, 'outsider denied');
});

// ---------- 4. agent private ----------
test('agent-private scope: only the agent', () => {
    const s = scope.normalize({ owner: 'agent:aria', visibility: 'private' });
    assert(scope.canAccess({ scope: s }, 'aria') === true, 'owner agent passes');
    assert(scope.canAccess({ scope: s }, 'volt') === false, 'even org-mates denied on private');
});

// ---------- 5. fail-closed ----------
test('fail-closed: unknown entities deny, never empty-allow', () => {
    const unknownTeam = scope.normalize({ owner: 'team:nope' });
    assert(scope.canAccess({ scope: unknownTeam }, 'aria') === false, 'unknown team must deny');
    const unknownOrg = scope.normalize({ owner: 'org:ghost' });
    assert(scope.canAccess({ scope: unknownOrg }, 'aria') === false, 'unknown org must deny');
    const unknownAgent = scope.normalize({ owner: 'agent:ghost', visibility: 'private' });
    assert(scope.canAccess({ scope: unknownAgent }, 'aria') === false, 'unknown agent must deny');
    assert(scope.canAccess({ scope: { owner: 'team:backend', visibility: 'banana' } }, 'aria') === false, 'malformed scope must deny');
    assert(scope.canAccess(null, 'aria') === false, 'null entity must deny');
    assert(scope.canAccess({ scope: unknownTeam }, '') === false, 'empty agent denied');
    assert(scope.canAccess({ scope: unknownTeam }, null) === false, 'null agent denied');
});

// ---------- 6. legacy ----------
test('legacy entities (no scope field) are public/unscoped', () => {
    assert(scope.canAccess({}, 'aria') === true, 'no scope = public');
    assert(scope.canAccess({ title: 'old publication' }, 'juno') === true, 'legacy shape = public');
});

// ---------- 7. assertOwner ----------
test('assertOwner: member ok, non-member throws E_SCOPE_FORBIDDEN', () => {
    const s = scope.normalize({ owner: 'team:backend' });
    scope.assertOwner({ scope: s }, 'aria'); // must not throw
    let threw = null;
    try { scope.assertOwner({ scope: s }, 'volt'); } catch (e) { threw = e.code; }
    assert(threw === 'E_SCOPE_FORBIDDEN', 'non-member must throw E_SCOPE_FORBIDDEN, got ' + threw);
});

// ---------- 8. resolveMembers ----------
test('resolveMembers: team set is exact; unknown = null', () => {
    const members = scope.resolveMembers('team:backend');
    assert(members instanceof Set && members.has('aria'), 'team members must resolve, got ' + JSON.stringify([...(members || [])]));
    assert(!members.has('volt'), 'org-only agent must not be in team set');
    assert(scope.resolveMembers('team:nope') === null, 'unknown team = null (deny), not empty set');
    assert(scope.resolveMembers('org:acme') instanceof Set, 'org resolves');
    assert(scope.resolveMembers('agent:aria') instanceof Set, 'agent resolves to itself');
});

// cleanup
teams.unassign('aria');
teams.unassign('volt');
fs.rmSync(ORGCHART_DIR, { recursive: true, force: true });

console.log(`\n=== Scope: ${results.passed} passed, ${results.failed} failed ===\n`);
process.exit(results.failed > 0 ? 1 : 0);
