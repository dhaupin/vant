/**
 * Habitat (v0.8.6)
 * Framework for nature - boundaries, workspaces, RLS
 *
 * The habitat creates the conditions where nature can run.
 * Like a garden: provides soil, water, sunlight for growth.
 *
 * RLS (Row-Level Security):
 * - workspaces: isolated containers for multi-tenant
 * - roles: user roles within workspace
 * - boundaries: island-level access policies
 * - container: workspace isolation
 *
 * Concepts:
 * - boundaries: what's allowed (RLS policies)
 * - workspaces: isolated containers (like Docker containers)
 * - roles: user roles within workspace
 * - container: workspace isolation
 * - inputs: chaos sources feeding nature
 * - context: user/role/workspace for RLS
 * - persistence: where state lives
 */

const EventEmitter = require('events');
const encrypt = require('./encrypt');
const crypto = require('crypto');

class Habitat extends EventEmitter {
    constructor(options = {}) {
        super();

        // === RLS: Boundaries ===
        // { islandName: { readableBy: [], writableBy: [], filter: fn, mask: fn } }
        this.boundaries = options.boundaries || {};

        // === RLS: Workspaces (containers) ===
        // Isolated environments - like Docker containers
        // { workspaceId: { name, owner, roles: [], members: [] } }
        this.workspaces = options.workspaces || {};

        // === RLS: Roles ===
        // Role definitions per workspace
        // { workspaceId: { admin: [], editor: [], viewer: [] } }
        this.roles = options.roles || {};

        // === RLS: Default workspace ===
        this.defaultWorkspace = options.defaultWorkspace || 'default';

        // Current workspace context
        this.currentWorkspace = this.defaultWorkspace;

        // Input streams (chaos sources)
        this.inputs = [];

        // Persistence layer (brain)
        this.persistence = options.persistence || null;

        // User contexts cache
        this.contexts = new Map();

        // (pass 86) Habitat access tokens (#4 MCP auth ctx). Registry-anchored
        // bearer tokens: the token IS a habitat identity. SHA-256 hashes are
        // stored (raw tokens are only ever shown at mint time); verify() maps
        // token -> agentContext() so RLS subjects are REGISTRY-VERIFIED, never
        // caller-declared. Persisted with _habitat state; revoke = delete +
        // persist (a revoked token is dead in every future process too).
        this.tokens = options.tokens || {};

        // Default policies
        this.defaultPolicy = {
            readableBy: ['public'],
            writableBy: ['role:admin'],
            container: 'default'  // workspace/tenant isolation
        };

        // (pass 87 fix) The DECLARED default workspace must EXIST. It never
        // did in a fresh process (workspaces = {}) until something provisioned
        // it: addRole('default', ...) threw HABITAT_UNKNOWN_WORKSPACE and
        // getWorkspace('default') fell through to undefined. Previously a
        // persisted _habitat state happened to contain 'default' (masking the
        // hole); with that state absent the island-boundaries role-holder
        // gate failed deterministically. Persist-FREE on purpose: createWorkspace
        // fires _persist, and at construction that save would race the
        // getShared() restore chain and could clobber real disk state with a
        // nearly-empty snapshot.
        this._ensureDefaultWorkspace();
    }

    // ============================================
    // WORKSPACE (Container) MANAGEMENT
    // ============================================

    /**
     * Create a new workspace (container)
     * Optionally assign geometric address for spatial addressing
     */
    createWorkspace(workspaceId, options = {}) {
        // Get geometry for spatial addressing (lazy load)
        let geometry = null;
        try {
            geometry = require('./geometry');
        } catch (e) {
            // Geometry module not available
        }

        // Generate geometric address if geometry available
        const geoAddress = geometry?.workspaceAddress
            ? geometry.workspaceAddress(workspaceId, options.facility)
            : null;

        const workspace = {
            id: workspaceId,
            name: options.name || workspaceId,
            owner: options.owner,
            created: Date.now(),
            policy: options.policy || { ...this.defaultPolicy },
            // Geometric addressing for spatial/multi-tenant
            geometry: geoAddress || null
        };

        this.workspaces[workspaceId] = workspace;

        // Initialize roles for workspace
        this.roles[workspaceId] = {
            admin: [options.owner].filter(Boolean),
            editor: [],
            viewer: []
        };

        // (pass 81) Auto-persist: habitat state is PROCESS-RESIDENT otherwise —
        // every CLI process and every reboot lost all workspaces/roles
        // (save() existed but nothing ever called it; the pass-77 hold/release
        // genre). Mutators fire-and-forget the save; failures are logged, not
        // thrown (a persistence hiccup must not fail the mutation).
        // (pass 87) _ensureDefaultWorkspace() seeds with skipPersist — a
        // constructor-time save would race the getShared() restore chain.
        if (!options.skipPersist) this._persist('createWorkspace', workspaceId);

        return workspace;
    }

    /**
     * (pass 87 fix) Idempotent: the DECLARED default workspace must exist in
     * workspaces/roles in every process — restore() may replace both
     * wholesale from legacy state that predates this invariant. Persist-free.
     */
    _ensureDefaultWorkspace() {
        const id = this.defaultWorkspace;
        if (!id) return null;
        if (this.workspaces[id] && this.roles[id]) return this.workspaces[id];
        if (!this.workspaces[id]) {
            this.createWorkspace(id, { name: 'default', skipPersist: true });
        }
        if (!this.roles[id]) this.roles[id] = { admin: [], editor: [], viewer: [] };
        return this.workspaces[id];
    }

    /**
     * Get workspace
     */
    getWorkspace(workspaceId) {
        return this.workspaces[workspaceId] || this.workspaces[this.defaultWorkspace];
    }

    /**
     * List workspaces
     */
    listWorkspaces() {
        return Object.values(this.workspaces);
    }

    /**
     * Get workspaces as geometric map
     * Returns workspace IDs with their geometric addresses
     */
    getGeometricMap() {
        let geometry = null;
        try {
            geometry = require('./geometry');
        } catch (e) {
            return null;
        }

        const workspaces = Object.values(this.workspaces);
        return geometry.workspaceMap(workspaces);
    }

    /**
     * Set current workspace context
     */
    setWorkspace(workspaceId) {
        if (this.workspaces[workspaceId]) {
            this.currentWorkspace = workspaceId;
            // (pass 81) currentWorkspace is session context, NOT persisted
            // state (persisting it would leak one process's working context
            // into the next) — deliberately no _persist here.
            return true;
        }
        return false;
    }

    /**
     * Get current workspace
     */
    getCurrentWorkspace() {
        return this.currentWorkspace;
    }

    // ============================================
    // ROLE MANAGEMENT
    // ============================================

    /**
     * Add role to workspace
     */
    addRole(workspaceId, role, userId) {
        // (pass 81) Fail closed on unknown workspace: the old behavior
        // silently created a role row for a workspace that didn't exist
        // (CLI 'grant' succeeded against a phantom workspace — proven by
        // the two-process probe). Caller sees an honest error now.
        if (!this.workspaces[workspaceId]) {
            throw new Error('HABITAT_UNKNOWN_WORKSPACE: ' + workspaceId + ' (create it first)');
        }

        if (!this.roles[workspaceId]) {
            this.roles[workspaceId] = { admin: [], editor: [], viewer: [] };
        }

        if (this.roles[workspaceId][role]) {
            if (!this.roles[workspaceId][role].includes(userId)) {
                this.roles[workspaceId][role].push(userId);
            }
        }

        // (pass 81) Auto-persist (see createWorkspace note)
        this._persist('addRole', workspaceId + '/' + role + '/' + userId);

        return this.roles[workspaceId];
    }

    /**
     * Remove role from workspace
     */
    removeRole(workspaceId, role, userId) {
        if (this.roles[workspaceId] && this.roles[workspaceId][role]) {
            this.roles[workspaceId][role] = this.roles[workspaceId][role].filter(u => u !== userId);
            // (pass 81) Auto-persist (see createWorkspace note)
            this._persist('removeRole', workspaceId + '/' + role + '/' + userId);
        }
        return this.roles[workspaceId];
    }

    /**
     * Get user roles in workspace
     */
    getUserRoles(workspaceId, userId) {
        const workspaceRoles = this.roles[workspaceId] || {};
        const userRoles = [];

        for (const [role, members] of Object.entries(workspaceRoles)) {
            if (members.includes(userId)) {
                userRoles.push(role);
            }
        }

        return userRoles;
    }

    /**
     * Check if user has role in workspace
     */
    hasRole(workspaceId, userId, role) {
        const workspaceRoles = this.roles[workspaceId] || {};
        return workspaceRoles[role]?.includes(userId) || false;
    }

    /**
     * Feed chaos into the system
     * This is how entropy enters the habitat
     */
    feed(event) {
        const chaos = event.chaos || 1;
        const type = event.type || 'unknown';

        // Emit for listeners (nature will listen)
        this.emit('chaos', {
            type,
            chaos,
            timestamp: Date.now(),
            data: event.data
        });

        return chaos;
    }

    /**
     * Add an input source
     */
    addInput(source) {
        this.inputs.push(source);

        // Wire up the source to feed()
        if (source.on && typeof source.on === 'function') {
            source.on('event', (e) => this.feed(e));
        }
    }

    /**
     * Feed cosmic entropy from encrypt module
     * This is the main entry point for cosmic entropy during boot
     */
    async feedCosmicEntropy() {
        try {
            const encrypt = require('./encrypt');
            const entropy = await encrypt.default.getCosmicEntropy();

            // Feed the chaos into habitat
            const chaos = this._computeChaos(entropy);
            this.feed({
                type: 'cosmic-entropy',
                chaos,
                data: entropy
            });

            return chaos;
        } catch (e) {
            // Fallback - feed minimal chaos
            this.feed({ type: 'cosmic-fallback', chaos: 1 });
            return 1;
        }
    }

    /**

    /**
     * Get user context from token
     * This is used for RLS (Row-Level Security)
     * Includes workspace/container context
     */
    async context(token) {
        if (!token) {
            return {
                userId: 'anonymous',
                roles: [],
                scopes: [],
                workspace: this.currentWorkspace
            };
        }

        // Check cache
        if (this.contexts.has(token)) {
            const ctx = this.contexts.get(token);
            // Always use current workspace
            ctx.workspace = this.currentWorkspace;
            return ctx;
        }

        try {
            // Verify and decode token
            const payload = await encrypt.default.verifyToken(token);
            const ctx = {
                userId: payload.userId,
                roles: payload.roles || [],
                scopes: payload.scopes || [],
                team: payload.team,
                workspace: payload.workspace || this.currentWorkspace
            };

            // Also get roles from workspace
            if (ctx.workspace) {
                ctx.roles = [...ctx.roles, ...this.getUserRoles(ctx.workspace, ctx.userId)];
            }

            this.contexts.set(token, ctx);
            return ctx;
        } catch (e) {
            return {
                userId: 'anonymous',
                roles: [],
                scopes: [],
                workspace: this.currentWorkspace
            };
        }
    }

    // ============================================
    // AGENT IDENTITY (pass 82)
    // ============================================

    /**
     * (pass 82) Provision an agent's habitat identity: ensure its workspace
     * exists and grant its roles. IDEMPOTENT — spawn can call this on every
     * boot/respawn without duplicating rows (addRole already dedupes).
     *
     * options:
     *   workspace - explicit workspace id (wins over team mapping)
     *   team      - team name; maps to an 'org-<team>' workspace
     *   role      - primary role to grant (default 'editor'; 'admin' escalates)
     *   roles     - extra roles array
     *
     * Returns { workspace, roles: [granted roles] }.
     */
    provisionAgent(agentId, options = {}) {
        if (!agentId) throw new Error('HABITAT_PROVISION_INVALID: agentId required');

        const workspaceId = options.workspace
            || (options.team ? 'org-' + options.team : null)
            || this.defaultWorkspace;

        if (!this.workspaces[workspaceId]) {
            this.createWorkspace(workspaceId, {
                name: options.team ? ('org ' + options.team) : workspaceId,
                owner: options.owner || agentId
            });
        }

        const primary = options.role || 'editor';
        const wanted = [primary, ...(Array.isArray(options.roles) ? options.roles : [])];
        for (const role of wanted) {
            if (!role || typeof role !== 'string') continue;
            // addRole throws on unknown workspace — we just created it, and
            // this.roles[workspaceId] is initialized by createWorkspace, so
            // a throw here is a real bug; let it surface.
            if (!this.roles[workspaceId][role]) {
                this.roles[workspaceId][role] = [];
            }
            this.addRole(workspaceId, role, agentId);
        }

        return { workspace: workspaceId, roles: wanted.filter(Boolean) };
    }

    /**
     * (pass 82) Build the RLS userCtx for a registered agent. Habitat's own
     * role registry is authoritative for workspace roles (merged over any
     * roles stored on the agent record). Returns null for unknown agents —
     * callers decide whether that is an error in their context.
     */
    agentContext(agentId) {
        if (!agentId) return null;
        let agent = null;
        try {
            agent = require('./agents').get(agentId);
        } catch (e) {
            return null;  // agents subsystem unavailable
        }
        if (!agent) {
            // (pass 86) Cold-process fallback: the agents registry is
            // memory-only; the durable habitat rows (provisionAgent) are the
            // authority. Same registry-verified shape either way.
            return this._agentContextFromRegistry(agentId);
        }

        const workspace = agent.workspace || this.currentWorkspace;
        const roles = Array.isArray(agent.roles) ? [...agent.roles] : [];
        for (const r of this.getUserRoles(workspace, agentId)) {
            if (!roles.includes(r)) roles.push(r);
        }

        return {
            userId: agentId,
            agentId,
            name: agent.name,
            workspace,
            roles,
            team: agent.team || null,
            brain: agent.brain || null
        };
    }

    /**
     * (pass 82) Check if user can access resource
     * RLS: readableBy, writableBy + workspace isolation
     */
    async can(userCtx, resource, mode = 'read') {
        // (pass 82) Normalize once — null/sparse contexts previously
        // TypeError'd here (userCtx.workspace on null) instead of denying.
        const ctx = userCtx || {};

        // First: Check workspace/container isolation
        const policy = this.boundaries[resource] || this.defaultPolicy;
        const resourceContainer = policy.container || 'default';

        // If resource is in a different container, deny
        if (ctx.workspace && ctx.workspace !== resourceContainer) {
            // Cross-container access denied
            if (resourceContainer !== 'public') {
                return false;
            }
        }

        // Second: Check boundary policies
        if (mode === 'read') {
            return this._matches(policy.readableBy || [], ctx);
        } else if (mode === 'write') {
            return this._matches(policy.writableBy || [], ctx);
        }

        return false;
    }

    /**
     * Check if user matches any policy rule
     */
    _matches(rules, userCtx) {
        if (!rules || rules.length === 0) return true;

        // Defensive: CLI and internal callers pass sparse contexts (often {}).
        // Normalize once so rule checks below never throw on missing fields.
        const ctx = userCtx || {};
        const roles = Array.isArray(ctx.roles) ? ctx.roles : [];

        for (const rule of rules) {
            // Public is readable by anyone
            if (rule === 'public') return true;

            // Container/workspace check
            if (rule.startsWith('container:')) {
                const container = rule.slice(10);
                if (ctx.workspace === container) return true;
            }

            // Role check
            if (rule.startsWith('role:')) {
                const role = rule.slice(5);
                if (roles.includes(role)) return true;
            }

            // User check
            if (rule.startsWith('user:')) {
                const userId = rule.slice(5);
                if (ctx.userId === userId) return true;
            }

            // Team check
            if (rule.startsWith('team:')) {
                const team = rule.slice(5);
                if (ctx.team === team) return true;
            }

            // Brain check (for brain-specific operations like dream)
            if (rule.startsWith('brain:')) {
                const brain = rule.slice(6);
                if (ctx.brain === brain) return true;
            }
        }

        return false;
    }

    // ============================================
    // ROW-LEVEL FILTER/MASK (pass 82 — was policy-shape vapor)
    // ============================================

    /**
     * (pass 82) Apply a boundary policy's row-level rules to a data payload.
     * This is the "row-level" in RLS that the policy shape promised but never
     * implemented:
     *   filter - string[] of field names to strip, or fn(data) => filtered
     *   mask   - string[] of field names to replace with '[masked]', or fn(data) => masked
     *
     * Applies filter BEFORE mask (narrow, then redact what survives).
     * Non-function/non-array values are ignored (defensive against policy
     * JSON payloads that cannot carry functions).
     */
    _applyPolicy(data, policy) {
        if (data === null || data === undefined) return data;
        if (!policy) return data;

        let out = data;

        const filter = policy.filter;
        if (typeof filter === 'function') {
            out = filter(out);
        } else if (Array.isArray(filter) && out && typeof out === 'object') {
            out = { ...out };
            for (const field of filter) delete out[field];
        }

        const mask = policy.mask;
        if (typeof mask === 'function') {
            out = mask(out);
        } else if (Array.isArray(mask) && out && typeof out === 'object') {
            out = { ...out };
            for (const field of mask) {
                if (field in out) out[field] = '[masked]';
            }
        }

        return out;
    }

    /**
     * (pass 82) Evaluate access AND row-level transform in one call.
     * Returns { allowed, data } — data is the policy-filtered/masked payload
     * when allowed and data was provided, else undefined. can() stays a pure
     * boolean decision; this is the enforcement entry point.
     */
    async evaluate(userCtx, resource, mode = 'read', data = undefined) {
        const allowed = await this.can(userCtx, resource, mode);
        if (!allowed) return { allowed: false, data: undefined };
        const policy = this.boundaries[resource] || this.defaultPolicy;
        return { allowed: true, data: this._applyPolicy(data, policy) };
    }

    /**
     * (pass 82) Throwing form of can() — the decision API surfaces call.
     * Throws VantError with code RLS_DENIED (same code lib/rls.js has always
     * thrown) so callers get one denial contract across the stack.
     */
    async check(userCtx, resource, mode = 'read') {
        const allowed = await this.can(userCtx, resource, mode);
        if (!allowed) {
            const error = require('./error');
            throw new error.VantError(
                'Access denied: cannot ' + mode + ' ' + resource,
                { code: error.CODES.RLS_DENIED, retryable: false }
            );
        }
        return true;
    }

    /**
     * (pass 82) Container-isolation gate WITHOUT an async boundary — mirrors
     * the first check inside can() so sync callers (sandbox.generateCaps)
     * get fail-closed cross-workspace denial. Returns true when the context
     * is admitted to the resource's container (or no context/overlay says
     * otherwise); policy rules still apply upstream via can().
     */
    containerAdmits(userCtx, resource) {
        const policy = this.boundaries[resource] || this.defaultPolicy;
        const resourceContainer = policy.container || 'default';
        const ctx = userCtx || {};
        if (ctx.workspace && ctx.workspace !== resourceContainer && resourceContainer !== 'public') {
            return false;
        }
        return true;
    }

    /**
     * Set boundary policy for a resource
     */
    setPolicy(resource, policy) {
        this.boundaries[resource] = { ...this.defaultPolicy, ...policy };
        // (pass 81) Auto-persist (see createWorkspace note)
        this._persist('setPolicy', resource);
    }

    /**
     * Get all boundaries
     */
    getBoundaries() {
        return this.boundaries;
    }

    // ============================================
    // PERSISTENCE (save/load workspace state)
    // ============================================

    /**
     * (pass 81) Fire-and-forget persistence hook for mutators. Serializes
     * on the instance's _readyPromise so an in-flight restore() can never
     * clobber fresh state with the pre-restore snapshot. Failures are
     * logged, never thrown — a persistence hiccup must not fail the
     * mutation that triggered it.
     */
    _persist(op, detail) {
        if (!this.persistence) return;
        // (pass 82 fix) The chain MUST resolve to the instance. It used to
        // resolve to undefined (the last .then/.catch returned nothing), so
        // the FIRST mutation swapped _readyPromise for an undefined-resolving
        // promise and every subsequent getSharedReady()/await _sharedHabitat()
        // handed callers undefined (h.can -> TypeError). Latent since pass 81;
        // single-call probes never mutated-then-read, multi-step probes hit it
        // immediately.
        const prev = this._readyPromise || Promise.resolve();
        const run = prev
            .then(() => this.save())
            .then(() => { if (process.env.DEBUG) console.log('[habitat] persisted', op, detail); })
            .catch(e => console.error('[habitat] persist failed after', op, ':', e.message))
            .then(() => this);
        // Keep a handle so concurrent mutations serialize instead of racing
        this._readyPromise = run;
    }

    /**
     * (pass 86) Mint an access token for a registered agent (#4 MCP auth
     * ctx). The token's RLS subject is ALWAYS rebuilt from the agent/habitat
     * registries at verify time (agentContext), so roles granted/revoked
     * after minting apply immediately - tokens carry authority, not a
     * snapshot. Raw token shown ONCE here; only the SHA-256 hash persists.
     *
     * @param {string} agentId - the identity to anchor the token to
     * @param {object} opts - { ttlMs } (default 24h)
     * @returns {object} { token, tokenHash, agentId, workspace, roles, expiresAt }
     */
    mintToken(agentId, opts = {}) {
        const ctx = this.agentContext(agentId);
        if (!ctx) {
            const error = require('./error');
            throw new error.VantError(
                'AGENT_NOT_FOUND: ' + agentId + ' (spawn it first) — tokens anchor to habitat identities, never to declared claims',
                { code: 'AGENT_NOT_FOUND', retryable: false }
            );
        }
        const raw = 'vant_' + crypto.randomBytes(32).toString('hex');
        const record = {
            hash: this._tokenHash(raw),
            agentId,
            mintedAt: Date.now(),
            expiresAt: Date.now() + (Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : 24 * 60 * 60 * 1000)
        };
        this.tokens[record.hash] = record;
        // Role changes after minting apply immediately (subject is rebuilt at
        // verify time) — but token lifecycle rows still need to persist.
        this._persist('mintToken', agentId);
        return {
            token: raw,
            tokenHash: record.hash,
            agentId,
            workspace: ctx.workspace,
            roles: ctx.roles,
            expiresAt: record.expiresAt
        }; 
    }

    /**
     * (pass 86) Verify a bearer token -> registry-verified RLS subject.
     * Fail closed: unknown/expired/revoked tokens all return null. The
     * returned subject is agentContext() of the anchored agent — the SAME
     * shape islands/memory/spawn resolve, so every pass-82/85 consumer
     * accepts it unchanged.
     *
     * @param {string} rawToken
     * @returns {object|null} RLS context (registry-verified) or null
     */
    verifyToken(rawToken) {
        if (!rawToken || typeof rawToken !== 'string') return null;
        const record = this.tokens[this._tokenHash(rawToken)];
        if (!record) return null;              // unknown
        if (Date.now() > record.expiresAt) return null;  // expired
        let ctx = this.agentContext(record.agentId);
        if (!ctx) {
            // (pass 86) Cold-process fallback: the agents registry is
            // memory-only, but the habitat rows provisionAgent wrote are
            // DURABLE (_habitat state). Rebuild the subject from the registry
            // so verification works in a fresh process — still
            // registry-verified, never caller-declared.
            ctx = this._agentContextFromRegistry(record.agentId);
        }
        return ctx || null;                    // agent deregistered + no durable rows
    }

    /**
     * (pass 86) Subject from the durable habitat registry alone (no agents
     * registry). An identity "exists" iff it still holds at least one role
     * row in some workspace. First workspace wins (agents normally live in
     * exactly one — the provisioning contract from pass 82).
     */
    _agentContextFromRegistry(agentId) {
        if (!agentId) return null;
        let workspace = null;
        const roles = [];
        for (const [wsId, byRole] of Object.entries(this.roles || {})) {
            for (const [role, users] of Object.entries(byRole || {})) {
                if (Array.isArray(users) && users.includes(agentId)) {
                    if (!workspace) workspace = wsId;
                    if (!roles.includes(role)) roles.push(role);
                }
            }
        }
        if (!workspace) return null;
        return { userId: agentId, agentId, name: null, workspace, roles, team: null, brain: null };
    }

    /**
     * (pass 86) Revoke a token by its hash (or by the raw token itself).
     * Revocation persists — dead in this process AND every future one.
     */
    revokeToken(hashOrToken) {
        if (!hashOrToken) return false;
        const hash = hashOrToken.startsWith('vant_')
            ? this._tokenHash(hashOrToken)
            : hashOrToken;
        if (!this.tokens[hash]) return false;
        delete this.tokens[hash];
        this._persist('revokeToken', hash.slice(0, 12));
        return true;
    }

    /**
     * (pass 86) Token lifecycle rows for introspection (hash-prefixed,
     * agentId, expiry) — never the raw secrets.
     */
    listTokens() {
        return Object.entries(this.tokens).map(([hash, t]) => ({
            hash: hash.slice(0, 12) + '...',
            agentId: t.agentId,
            mintedAt: t.mintedAt,
            expiresAt: t.expiresAt,
            expired: Date.now() > t.expiresAt
        }));
    }

    _tokenHash(raw) {
        return crypto.createHash('sha256').update(String(raw)).digest('hex');
    }

    /**
     * Save state to brain
     */
    async save(options = {}) {
        if (!this.persistence) return null;

        const state = {
            workspaces: this.workspaces,
            roles: this.roles,
            boundaries: this.boundaries,
            defaultWorkspace: this.defaultWorkspace,
            tokens: this.tokens,
            savedAt: Date.now()
        };

        if (this.persistence.state) {
            await this.persistence.state('_habitat', state, {
                ttl: 100 * 365 * 24 * 60 * 60 * 1000,
                brain: options.brain,
                // (pass 85) Habitat state is PROCESS-GLOBAL - pin it out of
                // per-workspace memory namespacing so save/restore stay on
                // the same flat row no matter which agent is current.
                workspace: null
            });
        }

        return state;
    }

    /**
     * Restore state from brain
     * @param {Object} options - Options including brain name
     */
    async restore(options = {}) {
        if (!this.persistence) return null;

        try {
            if (this.persistence.recall) {
                // (pass 85) workspace: null - see save(); flat row, always.
                const state = await this.persistence.recall('_habitat', { brain: options.brain, workspace: null });
                if (state) {
                    this.workspaces = state.workspaces || {};
                    this.roles = state.roles || {};
                    this.boundaries = state.boundaries || {};
                this.defaultWorkspace = state.defaultWorkspace || 'default';
                this.tokens = state.tokens || {};
                // (pass 87 fix) Legacy/foreign state may lack the declared
                // default workspace — restore replaces wholesale, so re-assert
                // the invariant AFTER the replace (constructor seed is gone).
                this._ensureDefaultWorkspace();
                return state;
                }
            }
        } catch (e) {
            // No saved state
        }

        return null;
    }

    /**
     * Get entropy from cosmic sources
     * Uses encrypt.getCosmicEntropy() for true randomness
     */
    async getEntropy() {
        try {
            const cosmic = await encrypt.default.getCosmicEntropy();
            return {
                source: cosmic.source,
                timestamp: cosmic.timestamp,
                chaos: this._computeChaos(cosmic)
            };
        } catch (e) {
            // Fallback to crypto
            return {
                source: 'fallback',
                timestamp: Date.now(),
                chaos: 1
            };
        }
    }

    /**
     * Compute chaos weight from entropy
     */
    _computeChaos(entropy) {
        // Use entropy data as chaos seed
        const str = JSON.stringify(entropy.data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        // Normalize to 1-10 range
        return Math.abs(hash % 10) + 1;
    }

    /**
     * Status
     */
    status() {
        return {
            inputs: this.inputs.length,
            boundaries: Object.keys(this.boundaries).length,
            contexts: this.contexts.size
        };
    }
}

// ==================== MULTIBRAIN SUPPORT ====================

const _brainHabitatConfigs = {};

function getBrainHabitatConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainHabitatConfigs[brainName] || { environment: 'development' };
}

function setBrainHabitatConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainHabitatConfigs[brainName] = config;
    return true;
}

function getStackHabitatConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainHabitatConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}

module.exports = Habitat;
module.exports.getBrainHabitatConfig = getBrainHabitatConfig;
module.exports.setBrainHabitatConfig = setBrainHabitatConfig;
module.exports.getStackHabitatConfigs = getStackHabitatConfigs;
module.exports.gatherState = gatherState;
module.exports.restoreState = restoreState;

/**
 * (pass 81) Shared-instance accessor — the ONE way surfaces (MCP tools,
 * CLI, boot) get the habitat. Boot (lib/vant.js) stores the boot-built
 * instance on global.__vant_habitat; if a surface runs BEFORE boot (e.g.
 * habitat MCP tools probed without vant_boot_init), this lazily builds an
 * identical instance (memory persistence) and claims the same global, so
 * boot then ADOPTS it instead of clobbering — no dual-instance state loss
 * (the pass 77/78 throwaway-helper discipline, applied to habitat).
 */
module.exports.getShared = function () {
    if (global.__vant_habitat) return global.__vant_habitat;
    const memory = require('./memory');
    const instance = new Habitat({ persistence: memory });
    global.__vant_habitat = instance;
    // (pass 81) Restore persisted workspace/role/boundary state BEFORE the
    // instance is handed out — restore() REPLACES this.workspaces/roles/
    // boundaries wholesale, so a fire-and-forget restore could clobber a
    // workspace created on the defaults in the interim (race). Callers
    // await getSharedReady(); non-awaiting callers still get a consistent
    // instance because the swap happens before any state can be written.
    instance._readyPromise = Promise.resolve()
        .then(() => instance.restore())
        .catch(() => null)
        .then(() => instance);
    return instance;
};

/**
 * Awaitable form of getShared for surfaces that need restored state before
 * first use (MCP handlers are async anyway). Resolves to the instance.
 */
module.exports.getSharedReady = function () {
    const h = module.exports.getShared();
    return h._readyPromise || Promise.resolve(h);
};

// ==================== HORCRUX GATHER/RESTORE ====================
function gatherState() {
    return {
        configs: Object.assign({}, _brainHabitatConfigs),
        count: Object.keys(_brainHabitatConfigs).length,
        gatheredAt: Date.now()
    };
}
function restoreState(data) {
    if (data && data.configs) Object.assign(_brainHabitatConfigs, data.configs);
    return { restored: true, configs: Object.keys(_brainHabitatConfigs).length };
}
