/**
 * Vant Org-Sync — Wave J (prd-mesh; frame.md §4 group-pattern decision).
 *
 * Members of a group (the Acme/Beta/Theta shape: separate orgs, one
 * decision chain) need LOCAL RESOLUTION of group scopes: without it, a
 * scoped read on a member node is fail-closed denial because the group
 * org model lives on the steward. This module is the RESOLUTION CACHE
 * the pass-68 decision specified — the steward stays the authority of
 * record; the member's own org model stays SOVEREIGN (the frame §4
 * left column).
 *
 * WHY A SEPARATE REPLICA (not merged into teams.js maps): teams.js's
 * assignment map is one-record-per-agent (getAssignment/getAgentBrain
 * read it directly). A Beta agent in a group already has a LOCAL
 * assignment; adopting group assignments there would collide with and
 * shadow it. The replica is a distinct, wipeable, provenance-marked
 * dataclass — the member's books are structurally unreachable.
 *
 * WIRE (steward pushes, agora-sync conventions, no new trust paths):
 *   org.replicate { model: {generation, orgs, depts, teams, roles,
 *                 assignments}, from }
 * Signed + registered-peers-only (crew-bus envelope gate) + a
 * configurable steward allowlist (defense in depth: a registered peer
 * is not automatically a trusted org authority).
 *
 * AUTHORITY RULE: the replica is wholesale-replaced (never merged)
 * whenever the incoming generation is NEWER — the steward is the
 * authority of record; merging would be a second writer pretending.
 * An OLDER/equal generation is acked with adopted:false (restarts and
 * replays converge, no regression). This is also how REVOCATION
 * propagates: the steward removes the agent from the model, bumps the
 * generation, pushes; members replace the replica; the agent resolves
 * out of the group scope — fail-closed, not deleted-blind.
 *
 * SHADOWING RULE: resolution is LOCAL-FIRST (teams.js), replica only
 * on miss — a replica entry for an id that also exists locally can
 * never shadow the local record. Ids are steward-generated
 * ('org_…'/'team_…' shapes) and adopt-steward-ids is the recorded
 * rule, so local and replica id spaces do not collide in practice;
 * even if they did, the miss-first order keeps local authority.
 */

const REPLICA_STATE_FILE = 'state/org-sync.json';
const REPLICA_SOURCE = 'org-sync-steward';   // replica provenance stamp
const MAX_ENTITIES = 500;                    // per-collection cap
const MAX_ASSIGNMENTS = 1000;

const _replica = {
    hydrated: false,
    dirty: false,
    generation: 0,
    steward: null,                            // node name of record
    orgs: new Map(),
    depts: new Map(),
    teams: new Map(),
    roles: new Map(),
    assignments: new Map()                    // agentId -> assignment record
};

// The steward allowlist: which peer node names may push an org model.
// Empty = any REGISTERED peer (the genesis ring IS the trust boundary);
// set to names to narrow further. Not a replaceable hook — behavior
// comes from pinned decisions, not from whoever requires this module.
const _stewardAllow = new Set();

// The scope-provider hook (the pass-52 stale-rescue convention): the
// resolver asks this before failing closed on an unknown org/dept/team.
// The provider THROWS to signal "I cannot resolve this honestly" — the
// miss stands (fail-closed); it never fabricates an empty member set.
let _provider = null;

const _installed = new WeakSet();

// ---------- replica store (kind-marked protocol state) ----------

function _ensureReplicated() {
    if (_replica.hydrated) return;
    _replica.hydrated = true;
    try {
        const store = require('./state-store');
        store.hydrate({
            moduleName: 'org-sync',
            stateFile: REPLICA_STATE_FILE,
            apply: (data) => {
                if (!data || data.module !== 'org-sync' || typeof data.generation !== 'number') return;
                for (const [key, map] of [['orgs', _replica.orgs], ['depts', _replica.depts],
                    ['teams', _replica.teams], ['roles', _replica.roles],
                    ['assignments', _replica.assignments]]) {
                    if (!Array.isArray(data[key])) continue;
                    for (const rec of data[key]) {
                        if (rec && (rec.id || rec.agentId)) map.set(rec.id || rec.agentId, rec);
                    }
                }
                // Generation LAST: it is the commit marker — a reader that
                // sees a nonzero generation can trust the maps are populated.
                _replica.steward = data.steward || null;
                _replica.generation = data.generation;
            }
        });
    } catch (e) { /* unreadable replica = empty replica; persist repairs */ }
}

function _persistReplicaIfDirty() {
    if (!_replica.dirty) return;
    const store = require('./state-store');
    store.persist({
        moduleName: 'org-sync',
        stateFile: REPLICA_STATE_FILE,
        data: {
            generation: _replica.generation,
            steward: _replica.steward,
            orgs: [..._replica.orgs.values()],
            depts: [..._replica.depts.values()],
            teams: [..._replica.teams.values()],
            roles: [..._replica.roles.values()],
            assignments: [..._replica.assignments.values()]
        }
    });
    _replica.dirty = false;
}

// Wholesale replacement, capped + clamped. Wire data is untrusted.
// Shape-tolerant: ids/refs must be strings (bounded); other fields
// pass through as-is (records are cache entries, not locally created
// entities — the steward's creation gates made them, owner-side).
function _replacement(model) {
    if (!model || typeof model !== 'object') return null;
    const gen = parseInt(model.generation, 10);
    if (!Number.isFinite(gen) || gen < 0) return null;
    const collect = (arr, max, valid) => {
        if (!Array.isArray(arr)) return [];
        const out = [];
        for (const raw of arr) {
            if (out.length >= max) break;
            if (raw && typeof raw === 'object' && valid(raw)) out.push(raw);
        }
        return out;
    };
    const hasId = (r) => typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 100;
    const orgs = collect(model.orgs, MAX_ENTITIES, hasId);
    const depts = collect(model.depts, MAX_ENTITIES, hasId);
    const teams = collect(model.teams, MAX_ENTITIES, hasId);
    const roles = collect(model.roles, MAX_ENTITIES, hasId);
    const assignments = collect(model.assignments, MAX_ASSIGNMENTS,
        (r) => typeof r.agentId === 'string' && r.agentId.length > 0 && r.agentId.length <= 100);
    return {
        generation: gen,
        steward: typeof model.steward === 'string' ? model.steward.slice(0, 64) : null,
        orgs, depts, teams, roles, assignments
    };
}

function _setReplica(next) {
    // Maps FIRST, generation LAST: the generation is the commit marker.
    // (The old order — generation first — opened a window where a reader
    // saw a nonzero generation over EMPTY maps and resolved fail-closed
    // mid-replacement; the live-fire's phase-3b check caught it.)
    _replica.orgs = new Map(next.orgs.map((r) => [r.id, r]));
    _replica.depts = new Map(next.depts.map((r) => [r.id, r]));
    _replica.teams = new Map(next.teams.map((r) => [r.id, r]));
    _replica.roles = new Map(next.roles.map((r) => [r.id, r]));
    _replica.assignments = new Map(next.assignments.map((r) => [r.agentId, r]));
    _replica.steward = next.steward;
    _replica.generation = next.generation;
    _replica.dirty = true;
}

// ---------- public: the provider (scope resolution against the replica) ----------

/**
 * Activate the scope provider. Idempotent. The provider answers
 * resolution requests ONLY against the replica: local-first ordering
 * (teams.js, then the replica on miss) lives in the CALLER
 * (scope.js/the resolver seam), never here — the cache never shadows
 * the sovereign org model.
 *
 * The provider THROWS on anything it cannot resolve honestly:
 * no replica, entity absent from the replica, ambiguous name match.
 * Callers treat a throw as the miss it is (fail-closed).
 */
function setProvider() {
    _provider = (ownerRef) => {
        _ensureReplicated();
        if (!_replica.generation) throw new Error('org-sync: no replica'); // fail-closed
        const parsed = require('./scope').parseOwner(ownerRef);
        if (!parsed || parsed.kind === null) throw new Error('org-sync: not a scoped ref');
        let bucket;
        if (parsed.kind === 'org') bucket = _replica.orgs;
        else if (parsed.kind === 'dept') bucket = _replica.depts;
        else if (parsed.kind === 'team') bucket = _replica.teams;
        else throw new Error('org-sync: kind not in replica');      // agent: refs resolve locally
        const hits = [...bucket.values()].filter((r) => r.id === parsed.id || (r.name && r.name === parsed.id));
        if (hits.length !== 1) throw new Error('org-sync: no such entity in replica');
        const entity = hits[0];
        const field = parsed.kind === 'org' ? 'org' : parsed.kind === 'dept' ? 'dept' : 'team';
        const members = [..._replica.assignments.values()].filter((a) => a[field] === entity.id);
        return new Set(members.map((a) => a.agentId));
    };
    return { provider: true };
}

/**
 * The provider getter for the resolver seam (scope.js). Returns the
 * resolver fn or null when the provider was never activated.
 */
function provider() {
    return _provider;
}

/** The replica's provenance stamp (route- routing in scope.js). */
function replicaSource() {
    return REPLICA_SOURCE;
}

/**
 * Replica introspection (bounded). Never leaks record internals to
 * the wire — this is for status surfaces and tests.
 */
function replicaStatus() {
    _ensureReplicated();
    return {
        generation: _replica.generation,
        steward: _replica.steward,
        orgs: _replica.orgs.size,
        depts: _replica.depts.size,
        teams: _replica.teams.size,
        roles: _replica.roles.size,
        assignments: _replica.assignments.size
    };
}

// ---------- wire: the steward leg ----------

/**
 * OPERATOR CONFIG (deploy-time, like teams.store): pin which peer node
 * names may push an org model. Empty allowlist = any REGISTERED peer
 * (the genesis ring IS the trust boundary). Pass names to narrow the
 * gate — the recommended posture for a real group is exactly the
 * steward's node name.
 *
 * @param {string[]|string} names
 */
function configureStewards(names) {
    const list = Array.isArray(names) ? names : [names];
    _stewardAllow.clear();
    for (const n of list) {
        if (typeof n === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(n)) _stewardAllow.add(n);
    }
    return { stewards: [..._stewardAllow] };
}

/**
 * Wire the org.replicate dispatcher onto a bus. Idempotent per bus.
 * The payload is wholesale-replaced into the replica when its
 * generation is NEWER than ours; older/equal generations are ignored
 * (restarts and replays converge — the replica is persisted, so a
 * restarted member already holds its newest generation). Fire-and-
 * forget by design: the push receipt is the steward's confirmation of
 * DELIVERY; adoption is verified member-side (replicaStatus), never
 * claimed by an unread ack leg.
 */
function install(bus) {
    if (!bus || typeof bus.onDispatch !== 'function') {
        throw new Error('org-sync.install: bus required');
    }
    if (_installed.has(bus)) return { installed: true, already: true };
    _installed.add(bus);

    bus.onDispatch('org.replicate', (env) => {
        const from = env && env.from;
        const p = env && env.payload;
        if (!p || !p.model) return;
        // Registered peers only (envelope already signed; this gate is
        // the same convention every agora leg uses).
        let peers;
        try { peers = bus.nodes(); } catch (e) { peers = []; }
        if (!peers.some((n) => n.name === from)) return;
        // Steward allowlist (defense in depth over the ring gate).
        if (_stewardAllow.size > 0 && !_stewardAllow.has(from)) return;
        const next = _replacement(p.model);
        if (!next) return; // malformed model: drop
        _ensureReplicated();
        if (next.generation <= _replica.generation) return; // authority has not moved
        _setReplica(next);
        _persistReplicaIfDirty();
    });

    return { installed: true, already: false };
}

function _busName(bus) {
    try { const s = bus.status(); return s && s.name; } catch (e) { return null; }
}

// Steward-side generation: monotone per steward process. Date.now()
// with a +1 floor guarantees strictly-increasing generations even
// when two pushes land in the same millisecond.
let _genFloor = 0;
function _nextGeneration() {
    const now = Date.now();
    if (now > _genFloor) { _genFloor = now; return now; }
    _genFloor += 1;
    return _genFloor;
}

/**
 * STEWARD SIDE: export the group org model (deep copies). The
 * generation defaults to the monotone clock; pin one in opts only for
 * deterministic tests.
 *
 * @param {object} [opts] - { generation? }
 */
function exportOrgModel(opts = {}) {
    const t = require('./teams');
    return {
        generation: Number.isFinite(opts.generation) ? opts.generation : _nextGeneration(),
        orgs: JSON.parse(JSON.stringify(t.listOrgs ? t.listOrgs() : [])),
        depts: JSON.parse(JSON.stringify(t.listDepts ? t.listDepts() : [])),
        teams: JSON.parse(JSON.stringify(t.listTeams ? t.listTeams() : [])),
        roles: JSON.parse(JSON.stringify(t.listRoles ? t.listRoles() : [])),
        assignments: JSON.parse(JSON.stringify(t.listAssignments ? t.listAssignments({}) : []))
    };
}

/**
 * STEWARD SIDE: push the current org model to one member. The member
 * wholesale-replaces its replica when the generation is newer.
 * Fire-and-forget (see install) — the receipt confirms delivery only.
 *
 * @param {object} bus - configured bus with the member registered
 * @param {string} nodeName - member to push to
 * @param {object} [opts] - { generation? }
 * @returns {Promise<{ pushed, ok?, handlers?, reason? }>}
 */
async function replicate(bus, nodeName, opts = {}) {
    if (!bus || typeof bus.send !== 'function') throw new Error('org-sync.replicate: bus required');
    if (!_installed.has(bus)) install(bus);
    const model = exportOrgModel({ generation: opts.generation });
    try {
        const r = await bus.send(nodeName, 'org.replicate', { model, from: _busName(bus) });
        return { pushed: true, ...r };
    } catch (e) {
        return { pushed: false, reason: 'send_failed: ' + e.message };
    }
}

module.exports = {
    setProvider, provider, replicaSource, replicaStatus,
    configureStewards, install, exportOrgModel, replicate,
    REPLICA_STATE_FILE, REPLICA_SOURCE
};
