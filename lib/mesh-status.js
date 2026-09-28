/**
 * Vant Mesh Status (pass 62 / Wave F, labs/prd-mesh.md)
 *
 * The Stewardship surface of the Commons frame (labs/frame.md §3): the
 * coordination node's question — "what are my agents working on, what's
 * voted, what's blocked" — answered from ONE node, in one command.
 *
 *   vant mesh status            # human-readable summary
 *   vant mesh status --json     # machine mode for CI / agents
 *
 * Posture (the PRD's rule, everywhere):
 *   - READ-ONLY. Nothing here mutates state; no reaper, no gossip, no
 *     writes — a status probe must never be a side effect.
 *   - NO SECRETS. Peer entries are names + urls only; budgets are
 *     aggregates; nothing from lib/secret is consulted.
 *   - SCOPE STAYS OWNER-SIDE. This node reports what THIS node can see:
 *     consensus.list() filters scoped topics to members (the pass-40
 *     rule lives inside consensus), market stats run the anonymous
 *     counts-only call (scoped listing ids never leak through the stats
 *     door, pass-41 rule), msg channel summaries carry counts + ids but
 *     never message CONTENT. A scoped conversation's id is a local
 *     handle, not a boundary breach — content is what scope protects.
 *   - DEGRADED, NOT DEAD. Every subsystem is probed independently and
 *     wrapped: a module that throws (or a half-initialized install)
 *     contributes { error } to its section while the rest of the
 *     report stands. The mesh is observable even when a leg is down.
 *
 * Sections: self (node identity + version), genesis (role, peers, JV),
 * agora (topics + recent decisions), market (listing/bid/trade counts),
 * budgets (escrow aggregates), msg (conversation summaries), sync
 * (installed buses + pending round-trips), registry (peer liveness).
 */

// ---------- per-section safe probes ----------

function _probe(fn) {
    try {
        const value = fn();
        return value === undefined ? { error: 'undefined result' } : value;
    } catch (e) {
        return { error: e && e.message ? e.message : String(e) };
    }
}

function _self() {
    const version = _probe(() => require('./version'));
    const brain = _probe(() => {
        const brainMod = require('./brain');
        return brainMod.currentBrain ? brainMod.currentBrain() : null;
    });
    return { version, brain: brain || null };
}

function _genesis() {
    return _probe(() => {
        const genesis = require('./genesis');
        const s = genesis.status();
        return s && s.genesis ? s.genesis : null; // null = no genesis on this node (normal for a solo install)
    });
}

function _registry() {
    return _probe(() => {
        const registry = require('./node-registry');
        const stats = registry.getStats();
        const peers = (registry.list() || []).map((n) => ({
            name: n.name,
            id: n.id,
            status: n.status,
            lastSeen: n.lastSeen,
            stale: n.status !== 'alive' || (Date.now() - (n.lastSeen || 0) > 120000)
        }));
        return { stats, peers, count: peers.length };
    });
}

function _agora() {
    return _probe(() => {
        const consensus = require('./consensus');
        const stats = consensus.getStats();
        // (pass 65 / star live-fire) The report shows what THIS NODE may
        // see — anonymous counts view: scoped topics are UNNAMEABLE here
        // (viewerId null), so a hub cannot leak a JV topic's existence
        // through the observability door. The vote path held all along;
        // this closes the read path.
        const topics = (consensus.list(null) || []).slice(0, 50).map((l) => ({
            topic: l.topic,
            status: l.status,
            votes: l.votes,
            deadline: l.deadline || null,
            localOrigin: !!l.localOrigin,
            syncedFrom: l.syncedFrom || null
        }));
        // Recent decisions from the forum's durable feed (pass 44): the
        // "what's decided" half of the coordinator's question.
        const decisions = _probe(() => {
            const forumMod = require('./forum');
            const f = forumMod.forum || null;
            const list = (f && f.decisions) || [];
            return list.slice(-20).reverse().map((d) => ({
                topic: d.topic || null,
                winner: d.winner !== undefined ? d.winner : null,
                percentage: Number.isFinite(d.percentage) ? d.percentage : null,
                decidedAt: d.decidedAt || null,
                proposal: d.proposal || null,
                author: d.author || null
            }));
        });
        return { stats, topics, decisions };
    });
}

function _market() {
    return _probe(() => {
        const market = require('./market');
        // ANONYMOUS stats call: counts only when scoped listings exist —
        // the pass-41 rule (listing ids never leak through the stats door).
        const stats = market.stats(null);
        return {
            listings: stats.listings,
            visible: stats.visible,
            bids: stats.bids,
            trades: stats.trades
        };
    });
}

function _budgets() {
    return _probe(() => {
        const escrowMod = require('./escrow');
        const e = new escrowMod.Escrow();
        const status = e.getStatus();
        // Aggregate budget posture only — per-agent budgets are the
        // agents' own books; the coordinator sees totals, not wallets.
        let totalSpent = 0, totalLimit = 0, agents = 0;
        for (const b of (e._budgets ? e._budgets.values() : [])) {
            agents++;
            totalSpent += Number(b.spent) || 0;
            totalLimit += Number(b.limit) || 0;
        }
        return { escrowEnabled: status.enabled !== false, agents, totalSpent, totalLimit };
    });
}

function _msg() {
    return _probe(() => {
        const msg = require('./msg');
        const convs = (msg.list() || []);
        return {
            conversations: convs.length,
            channels: convs.slice(0, 50).map((c) => ({
                id: c.id,
                messages: c.messageCount,
                participants: c.participantCount,
                lastActivity: c.lastActivity
            }))
            // content deliberately absent: scope protects content, and a
            // status surface has no business carrying it.
        };
    });
}

function _sync() {
    return _probe(() => {
        const agoraSync = require('./agora-sync');
        const s = agoraSync.status();
        return {
            installedBuses: s.installedBuses,
            buses: (s.buses || []).map((b) => ({
                label: b.label || null,
                name: b.name || null,
                agentId: b.agentId || null,
                configured: !!b.configured,
                listening: !!b.listening,
                peers: b.peers
            })),
            pending: s.pending,
            msgPending: s.msgPending
        };
    });
}

function _versions() {
    return _probe(() => {
        const crewBus = require('./crew-bus');
        return { envelope: { major: crewBus.ENVELOPE_V.major, minor: crewBus.ENVELOPE_V.minor } };
    });
}

// (pass 67 / weights & measures) The economic leg's view: settlement
// claim counts, role split, in-flight invoices. Aggregates only —
// settlement memo/topic never ride the status surface (scope protects
// content; the coordinator sees counts, not wallets).
function _settlements() {
    return _probe(() => {
        const settlement = require('./settlement');
        return settlement.status();
    });
}

// ---------- (pass 68 / Wave G) the ASK-PEERS legs ----------
// The star exercise's recorded gap: the hub observes only its OWN
// registry + what arrives unsolicited — a coordinator cannot ask a
// peer "what is your world look like?". This is that ask.
//
// RULES (agreed with the owner, 2026-09-28):
//   - The asker receives a SHAREABLE SUBSET computed through the
//     pass-65 read-scope gate (consensus.list(viewerId)) — scoped
//     topics are never NAMED to a non-member; counts still flow (a
//     count is not content). Scope resolves where the state lives.
//   - Everything in the subset is already federable per frame §4:
//     counts/aggregates, public topic names, non-secret topology
//     (peer names + staleness), wire version, genesis role.
//   - NO content: no message bodies, no listing ids, no settlement
//     memo/topic, no budget per-agent wallets.
//   - The LOCAL buildReport() stays read-only and local; the
//     federated view is a SEPARATE builder (buildFederatedReport)
//     because asking peers is wire traffic, not a local probe.

/**
 * The shareable subset of THIS node's status, filtered for one viewer
 * (the asking peer's principal, resolved owner-side). Pure local read;
 * the crew.status.reply dispatcher serves this.
 * @param {string|null} viewerPrincipal - the asker's vetted identity
 * @returns {object} JSON-safe subset (bounded)
 */
function shareableReport(viewerPrincipal) {
    const agoraStats = _probe(() => require('./consensus').getStats());
    // THE pass-65 rule doing the work: list(viewerId) already hides
    // scoped topics from non-members (null = anonymous hides scoped
    // entirely; a member principal sees their own). The names a peer
    // receives are exactly the names it is entitled to.
    const agoraTopics = _probe(() =>
        (require('./consensus').list(viewerPrincipal || null) || [])
            .slice(0, 50)
            .map((l) => ({ topic: l.topic, status: l.status, votes: l.votes }))
    );
    const market = _probe(() => {
        const s = require('./market').stats(null); // anonymous counts-only (pass-41 rule)
        return { listings: s.listings, visible: s.visible, bids: s.bids, trades: s.trades };
    });
    const budgets = _probe(() => {
        const escrowMod = require('./escrow');
        const e = new escrowMod.Escrow();
        let totalSpent = 0, totalLimit = 0, agents = 0;
        for (const b of (e._budgets ? e._budgets.values() : [])) {
            agents++;
            totalSpent += Number(b.spent) || 0;
            totalLimit += Number(b.limit) || 0;
        }
        return { agents, totalSpent, totalLimit };
    });
    const settlements = _probe(() => require('./settlement').status());
    const msg = _probe(() => ({ conversations: (require('./msg').list() || []).length }));
    const registry = _probe(() => {
        const peers = (require('./node-registry').list() || []).map((n) => ({
            name: n.name,
            status: n.status,
            stale: n.status !== 'alive' || (Date.now() - (n.lastSeen || 0) > 120000)
        }));
        return { count: peers.length, peers: peers.slice(0, 20) };
    });
    const genesis = _probe(() => {
        const s = require('./genesis').status();
        return s && s.genesis ? { role: s.genesis.role, self: s.genesis.self ? s.genesis.self.name : null, hasJv: !!s.genesis.jv } : null;
    });
    const versions = _probe(() => {
        const crewBus = require('./crew-bus');
        return { envelope: { major: crewBus.ENVELOPE_V.major, minor: crewBus.ENVELOPE_V.minor } };
    });
    return {
        module: 'mesh-status',
        kind: 'vant-mesh-status-shareable',
        generatedAt: Date.now(),
        agora: { stats: agoraStats, topics: agoraTopics },
        market,
        budgets,
        settlements,
        msg,
        registry,
        genesis,
        versions
        // deliberately absent: decisions (proposal/author text), msg
        // channel ids, budget per-agent wallets, settlement memo/topic,
        // listing ids, anything scoped-and-unresolvable for the viewer.
    };
}

// ---------- assembly ----------

/**
 * Build the full mesh status report. Never throws: every section is
 * independently probed (a broken leg degrades its section, not the report).
 * @returns {object} the report (plain JSON-safe)
 */
function buildReport() {
    return {
        module: 'mesh-status',
        kind: 'vant-mesh-status', // kind-marked (pass-37 convention)
        generatedAt: Date.now(),
        self: _self(),
        versions: _versions(),
        genesis: _genesis(),
        registry: _registry(),
        agora: _agora(),
        market: _market(),
        budgets: _budgets(),
        settlements: _settlements(),
        msg: _msg(),
        sync: _sync()
    };
}

// ---------- rendering ----------

function _fmtAgo(ts) {
    if (!Number.isFinite(ts)) return 'never';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 90) return s + 's ago';
    if (s < 5400) return Math.floor(s / 60) + 'm ago';
    if (s < 172800) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
}

/**
 * Human-readable rendering. Every section prints even when degraded —
 * the error IS the status.
 * @param {object} report - from buildReport()
 * @returns {string}
 */
function renderReport(report) {
    const lines = [];
    const err = (v) => (v && v.error ? '  (error: ' + v.error + ')' : '');

    lines.push('MESH STATUS — ' + new Date(report.generatedAt).toISOString());
    lines.push('');
    const selfVersion = report.self && report.self.version;
    const selfBrain = report.self && report.self.brain;
    const wireV = report.versions && report.versions.envelope;
    lines.push('self      ' + (selfVersion ? 'v' + selfVersion : '(unavailable)') + err(report.self)
        + (selfBrain ? '  brain: ' + selfBrain : '')
        + (wireV ? '  wire v' + wireV.major + '.' + wireV.minor : ''));
    lines.push('genesis   ' + (report.genesis && !report.genesis.error
        ? (report.genesis
            ? report.genesis.role + ' ' + (report.genesis.self ? report.genesis.self.name : '?')
                + (report.genesis.jv ? '  JV team ' + report.genesis.jv.team : '')
            : '(no genesis — solo install)')
        : '(unavailable)') + err(report.genesis));

    // Registry / peers
    const reg = report.registry || {};
    lines.push('peers     ' + (reg.stats
        ? reg.stats.total + ' known, ' + reg.stats.alive + ' alive'
        : '(unavailable)') + err(reg));
    for (const p of (reg.peers || []).slice(0, 20)) {
        lines.push('  - ' + p.name + '  ' + p.status + (p.stale ? '  STALE' : '') + '  ' + _fmtAgo(p.lastSeen));
    }

    // Agora
    const ag = report.agora || {};
    lines.push('agora     ' + (ag.stats
        ? 'open ' + ag.stats.open + ', passed ' + ag.stats.passed + ', rejected ' + ag.stats.rejected + ', expired ' + ag.stats.expired
        : '(unavailable)') + err(ag));
    for (const t of (ag.topics || []).slice(0, 12)) {
        lines.push('  # ' + t.topic + '  ' + t.status + '  votes=' + t.votes + (t.syncedFrom ? '  synced' : (t.localOrigin ? '  local' : '')));
    }
    for (const d of (ag.decisions || []).slice(0, 8)) {
        lines.push('  decided: ' + (d.topic || '(untitled)') + ' -> ' + String(d.winner).slice(0, 40)
            + (Number.isFinite(d.percentage) ? ' (' + d.percentage + '%)' : ''));
    }

    // Market + budgets
    const mk = report.market || {};
    lines.push('market    ' + (mk.error === undefined && mk.listings !== undefined
        ? 'listings ' + mk.listings + ' (visible ' + mk.visible + '), bids ' + mk.bids + ', trades ' + mk.trades
        : '(unavailable)') + err(mk));
    const bd = report.budgets || {};
    lines.push('budgets   ' + (bd.error === undefined && bd.agents !== undefined
        ? bd.agents + ' agents, spent ' + bd.totalSpent + ' / ' + bd.totalLimit
        : '(unavailable)') + err(bd));
    const st = report.settlements || {};
    lines.push('settle    ' + (st.error === undefined && st.count !== undefined
        ? st.count + ' record(s) — claims ' + (st.ownerClaims || 0) + ', paid ' + (st.partnerPaid || 0)
            + (st.pending ? ', PENDING ' + st.pending : '')
        : '(unavailable)') + err(st));

    // Msg channels
    const ms = report.msg || {};
    lines.push('msg       ' + (ms.conversations !== undefined
        ? ms.conversations + ' conversation(s)'
        : '(unavailable)') + err(ms));
    for (const c of (ms.channels || []).slice(0, 12)) {
        lines.push('  ~ ' + c.id + '  msgs=' + c.messages + '  people=' + c.participants + '  ' + _fmtAgo(c.lastActivity));
    }

    // Sync
    const sy = report.sync || {};
    lines.push('sync      ' + (sy.installedBuses !== undefined
        ? sy.installedBuses + ' bus(es), pending ' + (sy.pending || 0) + ', msgPending ' + (sy.msgPending || 0)
        : '(unavailable)') + err(sy));
    for (const b of (sy.buses || [])) {
        lines.push('  bus ' + (b.name || b.label || '?') + (b.agentId ? ' as ' + b.agentId : '')
            + '  ' + (b.listening ? 'listening' : 'not listening') + '  peers: ' + ((b.peers || []).join(', ') || '(none)'));
    }

    return lines.join('\n');
}

/**
 * One-call convenience: { report, text } — the CLI renders from the same
 * JSON the CI mode consumes. One source of truth, two surfaces.
 */
function status() {
    const report = buildReport();
    return { report, text: renderReport(report) };
}

// ---------- (pass 68 / Wave G) the federated view ----------

/**
 * Ask every registered peer on the bus for its shareable report and
 * assemble the hub's federated view. DEGRADED NOT DEAD on the wire: a
 * silent/failed peer degrades its OWN row (error: reason), never the
 * aggregate. Local state is NOT included — this is the peers' world
 * only; the local half of the picture is buildReport().
 *
 * @param {object} bus - configured crew bus (peers = registered nodes)
 * @param {object} [opts] - { timeoutMs (per peer), concurrency }
 * @returns {Promise<{ asked: number, answered: number, peers: [{ node, report?, error? }], generatedAt }>}
 */
async function buildFederatedReport(bus, opts = {}) {
    const agoraSync = require('./agora-sync');
    if (!bus || typeof bus.nodes !== 'function') {
        throw new Error('mesh-status.buildFederatedReport: bus required');
    }
    if (!_probe(() => agoraSync.status()).buses) {
        // sync layer unavailable entirely — degrade to an empty ask
    }
    let peers = [];
    try { peers = (bus.nodes() || []).filter((p) => p && p.name); } catch (e) { peers = []; }
    const selfName = (bus.status && bus.status().name) || null;
    const targets = peers.filter((p) => p.name !== selfName);
    const rows = await Promise.all(targets.map(async (p) => {
        try {
            const r = await agoraSync.askStatus(bus, p.name, { timeoutMs: opts.timeoutMs });
            if (r.asked && r.report && r.report.kind === 'vant-mesh-status-shareable') {
                return { node: p.name, report: r.report };
            }
            return { node: p.name, error: r.asked ? 'malformed_report' : r.reason };
        } catch (e) {
            return { node: p.name, error: e.message };
        }
    }));
    const answered = rows.filter((r) => r.report).length;
    return { asked: targets.length, answered, peers: rows, generatedAt: Date.now() };
}

/**
 * Human rendering for the federated view — one line per answered peer,
 * carrying ONLY aggregates (the same posture as the local report).
 */
function renderFederated(fed) {
    const lines = [];
    lines.push('FEDERATED VIEW — ' + fed.answered + '/' + fed.asked + ' peers answered');
    for (const row of fed.peers) {
        if (!row.report) {
            lines.push('  - ' + row.node + '  UNAVAILABLE (' + (row.error || 'no report') + ')');
            continue;
        }
        const r = row.report;
        const agora = (r.agora && r.agora.stats) || {};
        const mk = r.market || {};
        const bd = r.budgets || {};
        const st = r.settlements || {};
        lines.push('  - ' + row.node
            + '  topics ' + ((r.agora && r.agora.topics) || []).length + ' (open ' + (agora.open || 0) + ', passed ' + (agora.passed || 0) + ')'
            + ', listings ' + (mk.listings !== undefined ? mk.listings : '?')
            + ', spent ' + (bd.totalSpent !== undefined ? bd.totalSpent : '?') + '/' + (bd.totalLimit !== undefined ? bd.totalLimit : '?')
            + ', settlements ' + (st.count !== undefined ? st.count : '?'));
    }
    return lines.join('\n');
}

module.exports = {
    buildReport,
    renderReport,
    status,
    shareableReport,       // (pass 68 / Wave G) the crew.status.reply payload
    buildFederatedReport,  // (pass 68 / Wave G) ask all peers, aggregate
    renderFederated,
    getLayerStatus: () => ({ name: 'MeshStatus', type: 'observability', version: require('./version'), enabled: true })
};
