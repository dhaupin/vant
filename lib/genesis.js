/**
 * Mesh Genesis — the join ceremony (pass 57 / Wave B, labs/prd-mesh.md)
 *
 * Productizes the hand-rolled handshake from the JV/demo harnesses:
 * mutual registration, registry vetting, optional JV org-model
 * assignment, and per-pair secret distribution — as a flow, not a demo
 * script.
 *
 * Roles:
 *   HOST  — `genesis.create({ name, agentId, port, jv })`: generates the
 *           PAIR SECRET, configures + boots its bus, installs agora-sync,
 *           registers the joiner, and (optionally) builds the JV org
 *           model with BOTH principals. The secret is returned ONCE to
 *           be handed to the joiner out-of-band (the PRD: the wire never
 *           carries the secret that signs the wire).
 *   JOIN  — `genesis.join({ host, url, secret, name, agentId, port, hostAgent })`:
 *           configures + boots its bus with the pair secret, registers
 *           the host, pings genesis.hello over the signed wire. The HOST
 *           side auto-acks hello by vetting the joiner's agent into ITS
 *           node-registry (and the JV team, when a JV was created) —
 *           registry-vetted membership is real, not assumed.
 *
 * SECURITY POSTURE (per prd-mesh.md §6):
 *   - The pair secret NEVER crosses the wire (the envelope that carries
 *     it would be self-signing). It is generated host-side and handed to
 *     the joiner out-of-band (docs, ticket, env).
 *   - Secrets stay in PROCESS MEMORY (secret.set) or env
 *     (VANT_MESH_SECRET) — never in state files. Only the NON-secret
 *     topology persists: state/genesis.json (kind-marked, state-store).
 *   - Re-genesis (create/join again with a new secret) RE-KEYS the pair:
 *     rotation story in one command.
 *   - Every gate (scope, registry, quarantine) stays owner-side; genesis
 *     only adds vetted MEMBERSHIP, never bypass rights.
 *
 * The join ack is live evidence: the joiner's hello is signed with the
 * pair secret, so a successful ack PROVES both sides booted the same
 * key. The registry entry on the host is created by the host's own
 * dispatcher — the joiner never writes the host's trust anchors.
 */

const crypto = require('crypto');

// (pass 169) Backbone wiring: rites emit on the shared bus.
let _event = null;
function _emit(event, data) {
    if (!_event) { try { _event = require('./event'); } catch (e) { return; } }
    if (_event && _event.emit) { _event.emit(event, data); }
}

const GENESIS_STATE_FILE = 'state/genesis.json';
const HELLO_TIMEOUT_MS = 10000;

// ---------- persistence (NON-secret topology only) ----------

function _readTopology() {
    try {
        const store = require('./state-store');
        let out = null;
        store.hydrate({
            moduleName: 'genesis',
            stateFile: GENESIS_STATE_FILE,
            apply: (data) => { if (data && data.module === 'genesis') out = data; }
        });
        return out;
    } catch (e) { return null; }
}

function _writeTopology(record) {
    const store = require('./state-store');
    store.persist({
        moduleName: 'genesis',
        stateFile: GENESIS_STATE_FILE,
        data: record
    });
    return record;
}

function _validName(s) { return typeof s === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(s); }

function _assertSandboxNetwork() {
    try {
        const network = require('./network');
        const allowed = network.setAllowedDomains(['127.0.0.1', 'localhost']);
        return !!allowed;
    } catch (e) { return false; } // allowlist hardening is best-effort
}

function _bootstrapBus({ name, port, secret, agentId }) {
    const crewBus = require('./crew-bus');
    const agoraSync = require('./agora-sync');
    const cfg = crewBus.configure({ name, port, secret, agentId: agentId || null });
    agoraSync.install(crewBus.default);
    return { crewBus, agoraSync, cfg };
}

function _registerPeer(name, url, port, secret) {
    const crewBus = require('./crew-bus');
    // The PAIR secret rides the node entry: crew-bus signs each envelope
    // with the PEER's registered secret (per-node table), so both sides
    // must register each other with the SAME pair secret.
    return crewBus.registerNode({ name, url: url || ('http://127.0.0.1:' + port), secret });
}

// (pass 68 find) secret.js validates the secret TYPE against
// [a-zA-Z0-9_-]+ — colon keys ('mesh:a:b') were never storable. The mesh
// secret type is the two names joined by a hyphen (valid charset, and
// deterministic so both sides derive the same key).
function _secretType(a, b) {
    return 'mesh-' + a + '-' + b;
}

// admit's tolerant ring-secret lookup: any pair type this node could be
// holding (host-side or join-side ordering), newest topology peers first.
function prevSecretTypes(selfName) {
    const t = _readTopology();
    const types = [];
    if (t && Array.isArray(t.peers)) {
        for (const p of t.peers) {
            if (p && p.name) types.push(_secretType(selfName, p.name), _secretType(p.name, selfName));
        }
    }
    return types;
}

// ---------- HOST side ----------

/**
 * Host a genesis: generate the pair secret, boot the bus, install sync,
 * optionally build the JV org model, register the expected joiner.
 * The secret is returned ONCE — hand it to the joiner out-of-band.
 *
 * @param {object} opts - { name, agentId?, port?, joiner: { name, agentId }, jv?: { org?, dept?, team? } }
 * @returns {Promise<{ ok, secret, node, jv?, topology }>} or { ok: false, reason }
 */
async function create(opts = {}) {
    const { name, agentId, joiner } = opts;
    if (!_validName(name)) return { ok: false, reason: 'invalid_name' };
    if (!joiner || !_validName(joiner.name)) return { ok: false, reason: 'invalid_joiner' };
    if (joiner.name === name) return { ok: false, reason: 'joiner_must_differ' };
    const port = parseInt(opts.port, 10) || 4890;

    _assertSandboxNetwork();

    // The pair secret: generated HERE, returned ONCE, never persisted.
    const secret = crypto.randomBytes(32).toString('hex');
    // (pass 68 find) secret.js validates the secret TYPE against
    // [a-zA-Z0-9_-]+ — the old 'mesh:<a>:<b>' key could NEVER be stored
    // (the throw was swallowed by this try/catch, so the memory path has
    // been dead since it was written). Store under a valid type instead.
    try {
        const secretMod = require('./secret');
        await secretMod.set(_secretType(name, joiner.name), secret);
    } catch (e) { /* memory-cache unavailable — env/VANT_MESH_SECRET is the restart path */ }

    // Boot with the REAL pair secret and LISTEN before returning: the
    // webhook route binds to this secret, so a late re-key would orphan
    // the inbound signature check (boot-pending → 401s). The join-side
    // hello carries backoff retries to bridge the out-of-band gap.
    const boot = _bootstrapBus({ name, port, secret, agentId });
    await boot.crewBus.listen(port);
    _registerPeer(joiner.name, joiner.url, joiner.port, secret);

    // 3. Registry vetting anchors: BOTH principals go into OUR registry —
    //    consensus's requireRegistry verifies remote ballots against this.
    const registry = require('./node-registry');
    registry.register({ id: agentId || name, name, host: '127.0.0.1', port });
    if (joiner.agentId) {
        registry.register({ id: joiner.agentId, name: joiner.name, host: joiner.host || '127.0.0.1', port: parseInt(joiner.port, 10) || 4891 });
    }

    // 4. Optional JV org model FIRST: org > dept > team, BOTH principals.
    //    Built BEFORE the hello dispatcher so the ack carries the RESOLVED
    //    record (generated ids + scope), not the requested labels — the
    //    joiner's persisted topology must describe the real JV, not the
    //    wish. teams.* return { error } shapes on refusal; a half-built JV
    //    (org without team) must fail the genesis loudly, never ack.
    let jvRecord = null;
    if (opts.jv) {
        const teams = require('./teams');
        const _fail = (step, r) => ({ ok: false, reason: 'jv_' + step + '_failed: ' + (r && r.error ? r.error : 'unknown') });
        // Re-key reuse: re-genesis with the SAME JV names hits E_DUPLICATE —
        // that is rotation, not an error. Reuse the existing ids so the pair
        // re-keys while the joint org model stays stable.
        const _reuse = (kind, name, list) => {
            const found = list.find((x) => x.name === name);
            return found ? { id: found.id, reused: true } : null;
        };
        const orgName = opts.jv.org || ('mesh-' + name + '-' + joiner.name);
        let org = teams.createOrg(orgName);
        if (org && org.code === 'E_SANDBOX') return _fail('org', org);
        if (org && org.error && /already exists/i.test(org.error)) org = _reuse('org', orgName, teams.listOrgs());
        if (!org || org.error) return _fail('org', org);
        const deptName = opts.jv.dept || 'joint';
        let dept = teams.createDept(deptName, { org: org.id });
        if (dept && dept.error && /already exists/i.test(dept.error)) {
            dept = _reuse('dept', deptName, teams.listDepts().filter((d) => d.org === org.id));
        }
        if (!dept || dept.error) return _fail('dept', dept);
        const teamName = opts.jv.team || 'crew';
        let team = teams.createTeam(teamName, { dept: dept.id });
        if (team && team.error && /already exists/i.test(team.error)) {
            team = _reuse('team', teamName, teams.listTeams().filter((t) => t.dept === dept.id));
        }
        if (!team || team.error) return _fail('team', team);
        for (const a of [agentId || name, joiner.agentId].filter(Boolean)) {
            const asg = teams.assign(a, { org: org.id, dept: dept.id, team: team.id });
            if (asg && asg.error) return _fail('assign', asg);
        }
        jvRecord = { org: org.id, dept: dept.id, team: team.id, scope: { owner: 'team:' + team.id, visibility: 'scope' } };
    }

    // 5. Auto-ack the joiner's signed hello (dispatcher, host side) — now
    //    holding the RESOLVED jvRecord (ids + scope) for vetting + ack.
    _installHelloDispatcher({ self: name, selfAgent: agentId || name, joiner, jv: jvRecord });

    // 6. Persist the NON-secret topology for restart + `mesh status`.
    const topology = _writeTopology({
        role: 'host',
        self: { name, agentId: agentId || name, port },
        peers: [{ name: joiner.name, agentId: joiner.agentId || null, url: joiner.url || ('http://127.0.0.1:' + (parseInt(joiner.port, 10) || 4891)) }],
        jv: jvRecord,
        secretSource: process.env.VANT_MESH_SECRET ? 'env' : 'memory'
    });

    _emit('genesis:created', { node: name, timestamp: Date.now() });
    return { ok: true, secret, node: { name, port, agentId: agentId || null }, jv: jvRecord, topology };
}

// ---------- JOIN side ----------

/**
 * Join a host's genesis: boot with the OUT-OF-BAND pair secret, register
 * the host, and ping genesis.hello. Resolves with the host's ack
 * ({ acked: true, jv }) — the ack is the LIVE PROOF that both sides
 * booted the same key (the hello was signed with the pair secret).
 *
 * @param {object} opts - { host: <nodeName>, hostUrl, hostAgent, hostPort, secret, name, agentId?, port?, timeoutMs? }
 * @returns {Promise<{ ok, acked, jv?, node, topology }>} or { ok: false, reason }
 */
// The host acks hello by vetting us into ITS registry (and JV team).
// The hello RETRIES with backoff: the out-of-band secret handoff means
// the host may still be booting when we first send (ECONNREFUSED) —
// a lottery is not a ceremony.
const HELLO_ATTEMPTS = [0, 400, 1000, 2000, 3500];
function _waitForAck(crewBus, { host, name, agentId, timeoutMs }) {
    return new Promise((resolve) => {
        let settled = false;
        const settle = (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };
        const timer = setTimeout(() => settle({ acked: false, reason: 'timeout' }), timeoutMs);
        crewBus.onDispatch('genesis.ack', (env) => {
            settle({ acked: !!(env.payload && env.payload.acked), jv: (env.payload && env.payload.jv) || null, from: env.from });
        });
        (async () => {
            let lastErr = null;
            for (const delay of HELLO_ATTEMPTS) {
                if (settled) return;
                if (delay) await new Promise((r) => setTimeout(r, delay));
                if (settled) return;
                try {
                    await crewBus.send(host, 'genesis.hello', { joiner: name, agentId: agentId || name });
                    return; // delivered (ack may still arrive async)
                } catch (e) {
                    lastErr = e;
                }
            }
            if (!settled && lastErr) settle({ acked: false, reason: 'send_failed: ' + (lastErr && lastErr.message ? lastErr.message : String(lastErr)) });
        })();
    });
}

async function join(opts = {}) {
    const { host, secret, name, agentId } = opts;
    if (!_validName(host) || !_validName(name)) return { ok: false, reason: 'invalid_name' };
    if (typeof secret !== 'string' || secret.length < 16) return { ok: false, reason: 'invalid_secret' };
    if (host === name) return { ok: false, reason: 'host_must_differ' };
    const port = parseInt(opts.port, 10) || 4891;
    const hostPort = parseInt(opts.hostPort, 10) || 4890;

    _assertSandboxNetwork();

    try {
        const secretMod = require('./secret');
        await secretMod.set(_secretType(host, name), secret);
    } catch (e) { /* memory-cache unavailable — env is the restart path */ }

    const boot = _bootstrapBus({ name, port, secret, agentId });
    await boot.crewBus.listen(port);
    _registerPeer(host, opts.hostUrl, hostPort, secret);

    const registry = require('./node-registry');
    registry.register({ id: agentId || name, name, host: '127.0.0.1', port });
    if (opts.hostAgent) {
        registry.register({ id: opts.hostAgent, name: host, host: '127.0.0.1', port: hostPort });
    }

    // The host acks hello by vetting us into ITS registry (and JV team).
    // See _waitForAck: the hello retries with backoff because the
    // out-of-band secret handoff means the host may still be booting.
    const ack = await _waitForAck(boot.crewBus, {
        host, name, agentId, timeoutMs: parseInt(opts.timeoutMs, 10) || HELLO_TIMEOUT_MS
    });

    // Persist ONLY on a successful ack: a failed join (wrong secret,
    // timeout, unreachable host) must never clobber an existing genesis
    // record — the topology file describes the JOINED mesh, not attempts.
    if (!ack.acked) {
        return { ok: false, acked: false, reason: ack.reason || null, jv: null, node: { name, port, agentId: agentId || null }, topology: null };
    }

    const topology = _writeTopology({
        role: 'join',
        self: { name, agentId: agentId || name, port },
        peers: [{ name: host, agentId: opts.hostAgent || null, url: opts.hostUrl || ('http://127.0.0.1:' + hostPort) }],
        jv: ack.jv || null,
        secretSource: process.env.VANT_MESH_SECRET ? 'env' : 'memory'
    });

    _emit('genesis:joined', { host, node: name, timestamp: Date.now() });
    return { ok: true, acked: true, reason: null, jv: ack.jv || null, node: { name, port, agentId: agentId || null }, topology };
}

// ---------- host-side hello dispatcher (the vetting ack) ----------

const _helloWired = new WeakSet();
function _installHelloDispatcher({ self, selfAgent, joiner, jv }) {
    const crewBus = require('./crew-bus');
    const bus = crewBus.default;
    if (_helloWired.has(bus)) return;
    _helloWired.add(bus);
    crewBus.onDispatch('genesis.hello', (env) => {
        const p = env && env.payload;
        if (!p || p.joiner !== joiner.name) return; // signed + expected joiner only
        // Vetting: the joiner's principal enters OUR registry (host-side
        // write — the joiner never touches our trust anchors), and the JV
        // team gets the assignment when a JV exists. Then we ack.
        try {
            const registry = require('./node-registry');
            if (p.agentId && !registry.get(p.agentId)) {
                registry.register({ id: p.agentId, name: p.joiner, host: '127.0.0.1', port: parseInt(joiner.port, 10) || 4891 });
            }
            if (jv && jv.team && p.agentId) {
                const teams = require('./teams');
                if (!teams.getAssignment(p.agentId)) {
                    teams.assign(p.agentId, { org: jv.org, dept: jv.dept, team: jv.team });
                }
            }
        } catch (e) { /* vetting best-effort; ack still proves the key */ }
        crewBus.send(p.joiner, 'genesis.ack', { acked: true, jv: jv || null, from: self }).catch(() => {});
    });
}

// ---------- status / re-key ----------

/** Non-secret mesh status for `vant mesh status` / agora_sync_status. */
function status() {
    const t = _readTopology();
    return {
        genesis: t ? { role: t.role, self: t.self, peers: t.peers, jv: t.jv ? { org: t.jv.org, team: t.jv.team, scope: t.jv.scope } : null, savedAt: t.savedAt } : null,
        secretSource: t ? t.secretSource : null
    };
}

/** Rotation: re-run create/join with a fresh secret (re-genesis re-keys the pair). */
function rekeyHint() {
    return 'Re-run `vant genesis create` + `vant genesis join` with the NEW secret — the pair re-keys; old envelopes fail HMAC and are dropped.';
}

// ---------- (pass 68 / Wave H) THIRD-ORG RITES — the commons key ring ----------
// The frame's standing leg: a commons of three-plus needs a join rite
// that scales WITHOUT diluting the sovereignty line. Option A (owner-
// approved, 2026-09-28): the COMMONS KEY RING — one shared transport
// secret; admitting a member = handing them the ring secret (out-of-band,
// ONCE) + registering them + telling the standing members. What the wire
// proves is RING MEMBERSHIP, not a specific node's identity — identity is
// what the gates + registry vetting prove (the pass-50 lesson: the wire
// never carries trust; trust resolves where the state lives).
//
//   HOST (ring holder)                 NEW MEMBER
//   ------------------                 ----------------
//   genesis.admit({ member })          receives ring secret out-of-band
//     boot bus if not yet up             |
//     registry anchor                    |
//     rewire hello dispatcher →          |
//       expect THIS member               |
//     broadcast member.intro ──────────▶ (standing members adopt the
//                                        new principal, merge-only)
//     ◀────────── genesis.hello ──────  genesis.accept({ host, ring secret })
//     vet into registry (+JV opt)   ──▶ vetting ack (the live proof)
//     topology: member appended         topology: ring membership recorded
//
// Deliberate v1 scope: rotation is manual (re-genesis re-keys the ring,
// same as pairs today); there is no invite-token, no cascade automation.
// The rite is the MINIMUM standing-leg that makes the third org real.

const ADMIT_TIMEOUT_MS = 15000;

/**
 * Host side: admit a new member into an EXISTING commons (the ring).
 * Unlike a second `create`, this NEVER re-keys: the ring secret stays
 * as-is (read from memory/env), standing members keep working.
 *
 * @param {object} opts - { member: { name, agentId?, port?, host?, url?, jv?: { org, dept, team } } }
 * @returns {Promise<{ ok, secret, member, topology }>} or { ok: false, reason }
 *   (secret returned ONCE — hand it to the member out-of-band)
 */
async function admit(opts = {}) {
    const m = opts.member || {};
    if (!_validName(m.name)) return { ok: false, reason: 'invalid_member_name' };
    const crewBusMod = require('./crew-bus');
    const bus = crewBusMod.default;

    const st = (bus.status && bus.status()) || {};
    if (!st.configured) {
        return { ok: false, reason: 'bus_not_configured — boot the node first (genesis.create / crewBus.configure)' };
    }
    const selfName = st.name;
    const port = st.port;
    const agentId = st.agentId || selfName;
    if (m.name === selfName) return { ok: false, reason: 'member_must_differ' };

    // The RING secret: reuse what this node already runs on. Never
    // generated here (that would fork the ring); never persisted anew.
    // Read tolerantly: the pair type this host created, the reverse type
    // (a join-side host), or env. First hit wins.
    let secret = null;
    try {
        const secretMod = require('./secret');
        for (const t of (prevSecretTypes(selfName))) {
            try {
                const v = await secretMod.get(t);
                if (typeof v === 'string' && v.length >= 16) { secret = v; break; }
            } catch (e2) { /* try next */ }
        }
    } catch (e) { /* fall through to env */ }
    if (!secret && process.env.VANT_MESH_SECRET) secret = process.env.VANT_MESH_SECRET;
    if (!secret) return { ok: false, reason: 'ring_secret_unavailable — no genesis pair secret in memory and no VANT_MESH_SECRET (boot a pair first, or set the env)' };

    // Vetting anchor (host-side write, the same rule as create/join).
    const registry = require('./node-registry');
    if (m.agentId) {
        registry.register({ id: m.agentId, name: m.name, host: m.host || '127.0.0.1', port: parseInt(m.port, 10) || 4892 });
    }

    // Register the member as a peer with the RING secret.
    _registerPeer(m.name, m.url, parseInt(m.port, 10) || 4892, secret);

    // Rewire the hello dispatcher for THIS rite: expect exactly this
    // member's signed hello, vet, ack. (The pair-era dispatcher expected
    // one joiner for one ceremony and is CLOSED OVER that joiner — the
    // rite REPLACES it per admission. Prior ceremonies are complete; a
    // standing pair is unaffected. The dispatcher is also the real
    // production path: over HTTP, verified envelopes dispatch here.)
    _admitHelloState = { self: selfName, member: m, jv: m.jv || null };
    bus.onDispatch('genesis.hello', _admitHelloHandler);

    // Tell the standing members: crew.member.intro carries NON-secret
    // topology only. Each member adopts the new principal merge-only
    // (registry entries it has never seen). The rite's standing-leg —
    // without this, only the host would know the new member.
    let introResults = null;
    try {
        introResults = await bus.broadcast('member.intro', {
            member: { name: m.name, agentId: m.agentId || null, url: m.url || ('http://127.0.0.1:' + (parseInt(m.port, 10) || 4892)) },
            from: selfName
        });
    } catch (e) { introResults = null; } // broadcast is best-effort; members also learn via hellos

    // Persist topology: the member APPENDS to the peer list.
    const prev = _readTopology();
    const peers = (prev && Array.isArray(prev.peers)) ? prev.peers.filter((p) => p.name !== m.name) : [];
    peers.push({ name: m.name, agentId: m.agentId || null, url: m.url || ('http://127.0.0.1:' + (parseInt(m.port, 10) || 4892)) });
    const topology = _writeTopology({
        role: prev && prev.role === 'host' ? 'host' : 'ring-host',
        self: prev && prev.self ? prev.self : { name: selfName, agentId, port },
        peers,
        jv: (prev && prev.jv) || null,
        ring: true,
        secretSource: process.env.VANT_MESH_SECRET ? 'env' : 'memory'
    });

    _emit('genesis:admitted', { member: m.name, timestamp: Date.now() });
    return { ok: true, secret, member: { name: m.name, agentId: m.agentId || null }, intro: introResults, topology };
}

// The admit-side hello handler lives at module scope so it can be
// REPLACED between rites (the handler state carries the expected member).
let _admitHelloState = null;
function _admitHelloHandler(env) {
    const state = _admitHelloState;
    if (!state) return;
    const p = env && env.payload;
    if (!p || p.joiner !== state.member.name) return; // signed + expected member only
    const crewBusMod = require('./crew-bus');
    const bus = crewBusMod.default;
    try {
        const registry = require('./node-registry');
        if (p.agentId && !registry.get(p.agentId)) {
            registry.register({ id: p.agentId, name: p.joiner, host: '127.0.0.1', port: parseInt(state.member.port, 10) || 4892 });
        }
        if (state.jv && state.jv.team && p.agentId) {
            const teams = require('./teams');
            if (!teams.getAssignment(p.agentId)) {
                teams.assign(p.agentId, { org: state.jv.org, dept: state.jv.dept, team: state.jv.team });
            }
        }
    } catch (e) { /* vetting best-effort; ack still proves the ring key */ }
    bus.send(p.joiner, 'genesis.ack', { acked: true, jv: state.jv || null, from: state.self }).catch(() => {});
}

/**
 * Member side: accept an EXISTING commons ring (as opposed to join,
 * which closes a fresh pair). Boots with the ring secret, registers the
 * host, and hellos until the host's vetting ack arrives — the ack is
 * the live proof of ring membership.
 *
 * @param {object} opts - { host, hostUrl?, hostPort?, hostAgent?, secret, name, agentId?, port?, timeoutMs? }
 * @returns {Promise<{ ok, acked, node, topology }>} or { ok: false, reason }
 */
async function accept(opts = {}) {
    const { host, secret, name, agentId } = opts;
    if (!_validName(host) || !_validName(name)) return { ok: false, reason: 'invalid_name' };
    if (typeof secret !== 'string' || secret.length < 16) return { ok: false, reason: 'invalid_secret' };
    if (host === name) return { ok: false, reason: 'host_must_differ' };
    const port = parseInt(opts.port, 10) || 4892;
    const hostPort = parseInt(opts.hostPort, 10) || 4890;

    _assertSandboxNetwork();

    // Memory-cache the ring secret (same rule as join — never persisted).
    try {
        const secretMod = require('./secret');
        await secretMod.set(_secretType(host, name), secret);
    } catch (e) { /* env is the restart path */ }

    const boot = _bootstrapBus({ name, port, secret, agentId });
    await boot.crewBus.listen(port);
    _registerPeer(host, opts.hostUrl, hostPort, secret);

    const registry = require('./node-registry');
    registry.register({ id: agentId || name, name, host: '127.0.0.1', port });
    if (opts.hostAgent) {
        registry.register({ id: opts.hostAgent, name: host, host: '127.0.0.1', port: hostPort });
    }

    const ack = await _waitForAck(boot.crewBus, {
        host, name, agentId, timeoutMs: parseInt(opts.timeoutMs, 10) || ADMIT_TIMEOUT_MS
    });

    if (!ack.acked) {
        return { ok: false, acked: false, reason: ack.reason || null, node: { name, port, agentId: agentId || null }, topology: null };
    }

    const topology = _writeTopology({
        role: 'ring-member',
        self: { name, agentId: agentId || name, port },
        peers: [{ name: host, agentId: opts.hostAgent || null, url: opts.hostUrl || ('http://127.0.0.1:' + hostPort) }],
        jv: null,
        ring: true,
        secretSource: process.env.VANT_MESH_SECRET ? 'env' : 'memory'
    });

    _emit('genesis:accepted', { host, node: name, timestamp: Date.now() });
    return { ok: true, acked: true, node: { name, port, agentId: agentId || null }, topology };
}

module.exports = { create, join, admit, accept, status, rekeyHint, GENESIS_STATE_FILE, HELLO_TIMEOUT_MS };
