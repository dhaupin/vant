/**
 * Scope (pass 40 / labs/prd-agora.md) — the agora membership rule.
 *
 * Every agora entity (forum thread/publication, consensus ledger, market
 * listing, crew-bus envelope payload, and any future system that joins
 * the loop) carries:
 *
 *   scope: { owner: 'team:backend', visibility: 'scope' }
 *
 *   owner       'org:<x>' | 'dept:<x>' | 'team:<x>' | 'agent:<x>' | null
 *   visibility  'private' (owner entity only) | 'scope' (owner + its
 *               members) | 'public'
 *
 * Resolution is backed by lib/teams.js — the ONE org model (orgs ⊃ depts
 * ⊃ teams, assignments with multibrain awareness). Owner refs accept IDs
 * or unique names via teams' own resolvers; 'agent:<x>' members are just
 * x. Rules:
 *   - unknown owner kind or unknown entity  -> DENY (fail-closed)
 *   - missing/legacy scope field            -> { owner: null, visibility: 'public' }
 *   - owner null                            -> public-equivalent (unscoped)
 *   - a scope'd entity is visible to its owner entity + members when
 *     visibility is 'scope', to the owner entity only when 'private'
 *
 * Usage:
 *   const scope = require('./scope');
 *   const s = scope.normalize({ owner: 'team:backend', visibility: 'scope' });
 *   scope.canAccess({ scope: s }, 'aria');   // -> true/false
 *   scope.assertOwner(entity, 'aria');       // throws E_SCOPE_FORBIDDEN
 */

const KINDS = ['org', 'dept', 'team', 'agent'];
const VISIBILITIES = ['private', 'scope', 'public'];

function _teams() {
    try { return require('./teams'); } catch (e) { return null; }
}

/** Parse an owner ref into { kind, id } or null. Strict charset on the id. */
function parseOwner(owner) {
    if (owner === null || owner === undefined || owner === '') return { kind: null, id: null };
    if (typeof owner !== 'string') return null;
    const m = /^(org|dept|team|agent):([A-Za-z0-9_-]{1,64})$/.exec(owner);
    if (!m) return null;
    return { kind: m[1], id: m[2] };
}

/**
 * Normalize any scope-ish input into the canonical shape, or null when
 * unparseable (callers decide: create paths reject, read paths treat as
 * deny). Missing/legacy input -> public/unscoped (lenient read rule).
 */
function normalize(input) {
    if (input === null || input === undefined) {
        return { owner: null, visibility: 'public' };
    }
    if (typeof input !== 'object') return null;
    const parsed = parseOwner(input.owner);
    if (!parsed) return null;
    let visibility = input.visibility === undefined || input.visibility === null
        ? 'scope'
        : input.visibility;
    if (!VISIBILITIES.includes(visibility)) return null;
    // owner null forces public (nothing to scope to)
    if (parsed.kind === null) {
        return { owner: null, visibility: 'public' };
    }
    return { owner: parsed.kind + ':' + parsed.id, visibility };
}

/** Is this scope record canonical-valid? (for create-path validation) */
function isValid(scope) {
    if (!scope || typeof scope !== 'object') return false;
    if (!('owner' in scope) || !('visibility' in scope)) return false;
    return normalize(scope) !== null;
}

/**
 * Resolve the member set of an owner ref. Returns Set of agentIds (empty
 * for 'agent:' — the member is the agent itself, added by callers via
 * _memberSet below), or null when the entity doesn't exist in teams.
 * Fail-closed: unknown org/dept/team => null (deny), NOT empty.
 */
function resolveMembers(ownerRef) {
    const parsed = parseOwner(ownerRef);
    if (!parsed || parsed.kind === null) return null;
    const t = _teams();
    if (!t || !t.listAssignments) return null;

    if (parsed.kind === 'agent') {
        const a = t.getAssignment(parsed.id);
        return a ? new Set([parsed.id]) : null; // unknown agent -> deny
    }

    // Org/dept/team refs: resolve id-or-name through teams first so an
    // unknown entity is a DENY, not an empty member set.
    let list = null;
    if (parsed.kind === 'org') {
        const orgs = (t.listOrgs ? t.listOrgs() : []).filter((o) => o.id === parsed.id || o.name === parsed.id);
        if (orgs.length !== 1) return null;
        list = t.listAssignments({ org: orgs[0].id });
    } else if (parsed.kind === 'dept') {
        const depts = (t.listDepts ? t.listDepts() : []).filter((d) => d.id === parsed.id || d.name === parsed.id);
        if (depts.length !== 1) return null;
        list = t.listAssignments({ dept: depts[0].id });
    } else { // team
        const teams = (t.listTeams ? t.listTeams() : []).filter((tm) => tm.id === parsed.id || tm.name === parsed.id);
        if (teams.length !== 1) return null;
        list = t.listAssignments({ team: teams[0].id });
    }
    return new Set(list.map((a) => a.agentId));
}

function _memberSet(ownerRef) {
    const parsed = parseOwner(ownerRef);
    if (!parsed) return null;
    if (parsed.kind === null) return null; // unscoped has no member set
    if (parsed.kind === 'agent') return new Set([parsed.id]);
    return resolveMembers(ownerRef);
}

/**
 * Can agentId access this entity? entity must carry a `scope` field
 * (missing/legacy scope = public/unscoped, the lenient-read rule).
 * Deny-first on every malformed or unknown shape.
 */
function canAccess(entity, agentId) {
    if (!entity || typeof entity !== 'object') return false;
    if (agentId === null || agentId === undefined || typeof agentId !== 'string' || !agentId) return false;
    const s = normalize(entity.scope);
    if (!s) return false;                    // malformed scope = deny
    if (s.owner === null) return true;       // unscoped = public

    const parsed = parseOwner(s.owner);
    if (!parsed || parsed.kind === null) return false;
    const members = _memberSet(s.owner);
    if (members === null) return false;      // unknown entity = fail-closed

    if (s.visibility === 'private') return members.has(agentId);
    // 'scope': owner entity's members ONLY — a team-owned entity does not
    // leak to the whole org; hierarchy applies via owner-kind choice
    // (org:<x> scopes to org members, team:<x> to team members).
    return members.has(agentId);
}

/** Owner-only action guard. Throws E_SCOPE_FORBIDDEN on any denial. */
function assertOwner(entity, agentId) {
    const errors = require('./error');
    if (!entity || typeof entity !== 'object' || !agentId) {
        throw new errors.VantError('Scope check failed: bad entity or agent', { code: 'E_SCOPE_FORBIDDEN' });
    }
    const s = normalize(entity.scope);
    const parsed = s ? parseOwner(s.owner) : null;
    const members = parsed && parsed.kind ? _memberSet(s.owner) : null;
    const isOwner = !!(members && members.has(agentId));
    if (!isOwner) {
        throw new errors.VantError('Scope: agent ' + String(agentId).slice(0, 40) + ' is not an owner of this entity',
            { code: 'E_SCOPE_FORBIDDEN' });
    }
    return true;
}

module.exports = {
    KINDS,
    VISIBILITIES,
    parseOwner,
    normalize,
    isValid,
    resolveMembers,
    canAccess,
    assertOwner,
};
