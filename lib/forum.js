/**
 * Vant Forum - Geometric Space for Agent Collaboration
 *
 * A 3D spatial forum using isohedrons for agent interaction.
 * Not Facebook. Not social media. Real geometric collaboration.
 *
 * INTEGRATED WITH OS (verified live surface — do not add claims without
 * the require() to back them):
 * - Brain: Store forum state in brain memory
 * - Islands: Load forum as lazy island (save/load via vant.islands)
 * - Security: Sandbox + governance checks
 * - Escrow: (pass 164 WIRED) budget gates on publish/vote/castVote —
 *   opt-in sovereignty: no cost until budgets are configured
 * - Msg: (pass 164 WIRED) agent-to-agent notify on publish — thread
 *   conversation (msg.create/post, convId 'forum:<barcode>') + channel
 *   shout (msg.send('forum', …)); best-effort, cannot fail an action
 * - Consensus: Voting on forum decisions
 * - Geometric Storage: Quasicrystal address for forum data
 * - Stream: Real-time forum events
 *
 * Concepts:
 * - Isohedrons: 3D shapes that can intersect, pivot, spin
 * - Cross-sections: Where agent spaces overlap = collaboration
 * - Axis change: Pivot between contexts
 * - Typewriter ball: Like those 1960s typewriter balls - each facet is a different "mode"
 *
 * SECURITY - Bad actors will attack:
 * - All actions go through governance
 * - Quarantine integration
 * - Encryption for sensitive messages
 * - Full audit trail
 *
 * Usage:
 *   const forum = require('./forum');
 *   forum.enter();        // Enter the geometric space
 *   forum.invite(agent);  // Invite to forum
 *   forum.intersect(agent); // Create cross-section with agent
 *   forum.pivot(context);  // Change axis/context
 *   forum.spin();          // Rotate through possibilities
 *   forum.vote(proposal);  // Consensus voting
 */

const event = require('./event');
const geometry = require('./geometry');
const brain = require('./brain');

// ==================== AGORA TENANCY (pass 87 — #6) ====================
// Habitat-workspace tenancy for the agora commons. The subject chain is
// the ONE used by islands (pass 84) and memory (pass 85):
//   explicit userCtx -> current agent's habitat identity -> anonymous.
// Visibility semantics are the OPPOSITE of memory's namespaces (the forum
// is a COMMONS, not a vault):
//   - workspaceless publications are GLOBAL (pre-87 behavior preserved —
//     every existing post stays visible to everyone),
//   - workspace-tagged publications are visible to their tenant + registry
//     admins only; anonymous callers never see them (fail closed).
const WORKSPACE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function _tenancySubject(options) {
    const o = options || {};
    if (o.userCtx) return o.userCtx;
    try {
        const agents = require('./agents');
        const current = agents.getCurrentAgentId ? agents.getCurrentAgentId() : null;
        if (current && current !== 'default' && agents.agentContext) {
            const ctx = agents.agentContext(current);
            if (ctx) return ctx;
        }
    } catch (e) { /* agents unavailable - anonymous */ }
    return null;
}

// Workspaces where the subject holds ANY registry role (cross-tenant
// moderation rights for reads). Empty set when habitat is unavailable.
function _subjectAdminWorkspaces(subject) {
    const adminOf = new Set();
    if (!subject || !subject.agentId) return adminOf;
    try {
        const h = require('./habitat').getShared();
        if (!h || !h.workspaces) return adminOf;
        for (const wsId of Object.keys(h.workspaces)) {
            const roles = h.getUserRoles(wsId, subject.agentId);
            if (Array.isArray(roles) && roles.length) adminOf.add(wsId);
        }
    } catch (e) { /* habitat unavailable - no cross-tenant rights */ }
    return adminOf;
}

function _emitTenancyDenied(detail) {
    try { event.emit('forum:tenancy_denied', { ...detail, timestamp: Date.now() }); } catch (e) {}
}

/**
 * (pass 87) Decide visibility of one publication for a subject.
 * Returns true when the subject may SEE the publication.
 */
function _publicationVisible(pub, subject, adminOf) {
    if (!pub || !pub.workspace) return true;   // global commons
    if (!subject) return false;                // tenant post vs anonymous: hidden
    if (pub.workspace === subject.workspace) return true;
    return !!(adminOf && adminOf.has(pub.workspace));
}

// (pass 44) Durable decision log. The consensus ledger keeps the vote
// outcome, but forum's own decision records (the forum:decision feed —
// what an agent actually reads to learn "we decided X because of Y") were
// memory-only and evaporated on restart. Same pattern as consensus/market
// state (pass 38): one per-brain snapshot, written at the mutation point.
const stateStore = require('./state-store');
const FORUM_STATE_FILE = 'state/forum.json';
const MAX_DECISIONS = 200; // FIFO cap — the log is a working memory, not an archive

let _forumHydrated = false;
function _hydrateDecisions() {
    if (_forumHydrated) return;
    _forumHydrated = true;
    stateStore.hydrate({
        moduleName: 'forum',
        stateFile: FORUM_STATE_FILE,
        apply: _applyDecisions
    });
}

function _serializeDecisions() {
    return forum.decisions.map((d) => ({ ...d }));
}

function _applyDecisions(data) {
    if (!data || !Array.isArray(data.decisions)) return;
    for (const d of data.decisions) {
        if (!d || d.type !== 'decision' || typeof d.topic !== 'string') continue;
        // Idempotent: skip anything already in memory (hot state wins).
        const dupe = forum.decisions.some(x => x.topic === d.topic && x.decidedAt === d.decidedAt);
        if (dupe) continue;
        forum.decisions.push(d);
    }
}

function _persistDecisions() {
    stateStore.persist({
        moduleName: 'forum',
        stateFile: FORUM_STATE_FILE,
        data: { decisions: _serializeDecisions() }
    });
}

// Lazy-load OS components
let _consciousness = null;
function _getConsciousness() {
    if (!_consciousness) {
        try { _consciousness = require('./consciousness'); } catch (e) { return null; }
    }
    return _consciousness;
}

let _governance = null;
function _getGovernance() {
    if (!_governance) {
        try { _governance = require('./governance'); } catch (e) { return null; }
    }
    return _governance;
}

let _consensus = null;
function _getConsensus() {
    if (!_consensus) {
        try { _consensus = require('./consensus'); } catch (e) { return null; }
    }
    return _consensus;
}

let _stream = null;
function _getStream() {
    if (!_stream) {
        try { _stream = require('./stream'); } catch (e) { return null; }
    }
    return _stream;
}

let _encrypt = null;
function _getEncrypt() {
    if (!_encrypt) {
        try { _encrypt = require('./encrypt'); } catch (e) { return null; }
    }
    return _encrypt;
}

let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) { return null; }
    }
    return _sandbox;
}

// (pass 164) Escrow + msg are now WIRED (closing the pass-161 header
// overclaim at the source). Both default-open: escrow allows any spend
// until budgets are actually configured (canSpend on an unconfigured
// agent returns allowed), and msg.notify failures are swallowed —
// notifications are best-effort, never a reason to fail an action.
// ESCROW IS FRESH-INSTANCE-BY-DESIGN (escrow.js pass-79 note): every
// budget mutation auto-persists and every fresh instance reloads the
// disk store — so the gate creates a NEW escrow per check instead of
// caching a stale singleton. Cost is negligible (a Map + one file read).
function _getEscrow() {
    try {
        const { create } = require('./escrow');
        return create();
    } catch (e) { return null; }
}

let _msg = null;
function _getMsg() {
    if (!_msg) {
        try { _msg = require('./msg'); } catch (e) { return null; }
    }
    return _msg;
}

/**
 * (pass 164) Escrow budget gate for a forum action. Costs map to
 * engagement weight: publish = 1 unit, vote creation = 2, castVote = 1.
 * DEFAULT-OPEN: when escrow is unavailable OR the agent has no budget
 * row, canSpend returns allowed — out of the box, forum behaves exactly
 * as before wiring. The gate only bites once someone configures budgets
 * (escrow.setBudget), which is the module's whole point: budgets are
 * opt-in sovereignty.
 * @returns {null|{blocked: true, reason: string}} null = allowed
 */
function _escrowGate(action, agentId) {
    const escrow = _getEscrow();
    if (!escrow) return null;
    const costs = { publish: 1, vote: 2, castVote: 1, put: 1 };
    const amount = costs[action] || 1;
    let check = null;
    try {
        check = escrow.canSpend(agentId, amount);
    } catch (e) { /* fail-open: budget must never take the forum down */ }
    if (check && check.allowed === false) {
        try { _emit('forum:escrow:blocked', { action, agentId, amount, reason: check.reason || 'budget_exhausted' }); } catch (e) {}
        return { blocked: true, reason: check.reason || 'budget_exhausted' };
    }
    return null;
}

/**
 * (pass 164) Best-effort agent-to-agent notify over msg.
 *
 * PRIMARY: IPC-style channel shout — msg.send('forum', event). Channels
 * are sandbox-free by design (fire-and-forget), so this works out of the
 * box in every install; agents subscribe via msg.on('forum', handler) or
 * poll msg.channelMessages('forum').
 *
 * BONUS: thread conversation post (convId 'forum:<barcode>') so replies
 * can collect per-thread — but msg.post goes through the sandbox
 * canWrite check, so under an UNCONFIGURED sandbox it returns an error
 * object, which we swallow. The conversation is created idempotently so
 * callers CAN write into it once capabilities are granted.
 *
 * Swallows everything — a messaging outage must not fail a forum action.
 */
function _notifyThread(barcode, publication) {
    const msg = _getMsg();
    if (!msg) return;
    try {
        msg.send('forum', { type: 'forum:publish', barcode, title: publication.title, author: publication.author });
    } catch (e) {}
    const convId = 'forum:' + barcode;
    try {
        if (msg.create) msg.create({ id: convId, encryption: false });
    } catch (e) {}
    try {
        if (msg.post) msg.post(convId, 'forum: ' + publication.title + ' published by ' + publication.author, { forcePlain: true });
    } catch (e) {}
}

class Forum {
  constructor() {
    this.inSpace = false;
    this.myIsohedron = null;
    this.intersections = new Map();  // Other agents I'm intersecting with
    this.currentAxis = 'self';       // Current pivot axis
    this.spinAngle = 0;
    this.facet = 0;                  // Current typewriter ball facet
    this.invites = new Map();        // Active invites
    this.publications = new Map();   // Published posts/articles
    this.listeners = new Set();      // Agents listening to me
    this.quarantined = new Set();    // Blocked agents
    this.forumId = null;             // My unique forum identifier
    this.scope = null;               // (pass 40 / agora) forum-wide default scope
    this._openVotes = new Map();     // (pass 40) voteId -> proposal record (return path)
    this.decisions = [];             // (pass 40) decision records returned from consensus
  }

  /**
   * (pass 40 / agora) Decision return path — the half of the loop that
   * never existed. When a consensus vote RESOLVES (passed/rejected), post
   * a decision record back into this forum. Wired once on the singleton;
   * consensus emits globally via the event system.
   */
  _installDecisionReturnPath() {
    if (this._decisionReturnInstalled) return;
    this._decisionReturnInstalled = true;
    event.on('vote:consensus', (data) => {
      try {
        const vote = this._openVotes.get(data.topic);
        // (pass 43) Restart fallback: a fresh process has an empty _openVotes
        // but the ledger (with our metadata stamp) persisted. Resolve
        // proposal/author from the ledger when the thread record is gone.
        let ledgerMeta = null;
        if (!vote) {
          try {
            const consensus = _getConsensus();
            const ledger = consensus && consensus.get ? consensus.get(data.topic) : null;
            ledgerMeta = (ledger && ledger.metadata && ledger.metadata.viaForum) ? ledger.metadata : null;
          } catch (e) { ledgerMeta = null; }
        }
        const decision = {
          type: 'decision',
          topic: data.topic,
          winner: data.winner,
          votes: data.votes,
          percentage: data.percentage,
          proposal: vote ? vote.proposal : (ledgerMeta ? ledgerMeta.proposal : null),
          author: vote ? vote.author : (ledgerMeta ? ledgerMeta.author : null),
          decidedAt: Date.now()
        };
        this.decisions.push(decision);
        // (pass 44) Bounded + durable: cap FIFO so a chatty crew can't grow
        // the log unbounded, then write-through so the decision history
        // survives restart (the ledger metadata carries proposal/author;
        // this file carries the forum's own decision feed).
        if (this.decisions.length > MAX_DECISIONS) {
            this.decisions.splice(0, this.decisions.length - MAX_DECISIONS);
        }
        _persistDecisions();
        if (vote) this._openVotes.delete(data.topic);
        console.log('  ⚖️ Decision: ' + data.topic + ' -> ' + data.winner + ' (' + data.percentage + '%)');
        event.emit('forum:decision', decision);
      } catch (e) {
        console.warn('[forum] Decision return path error:', e.message);
      }
    });
  }

  /**
   * Enter the geometric forum space
   */
  enter() {
    const who = _getConsciousness();
    const identity = who ? who.consciousness.whoAmI() : { name: 'Vant' };

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('           🌍 ENTERING GEOMETRIC FORUM SPACE');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  You are now in a geometric space of infinite dimensions.');
    console.log('  Your isohedron (20-faced shape) represents your presence.');
    console.log('');
    console.log('  ┌─────────────────────────────────────────────────────────────┐');
    console.log('  │  ISOHEDRON - Your 3D representation in forum space         │');
    console.log('  │                                                             │');
    console.log('  │     Each facet = different mode/perspective/context         │');
    console.log('  │     Spin = rotate through possibilities                    │');
    console.log('  │     Pivot = change your axis of operation                 │');
    console.log('  └─────────────────────────────────────────────────────────────┘');
    console.log('');

    // Create my isohedron
    this.myIsohedron = this._createIsohedron(identity.name);
    this.inSpace = true;

    console.log('  Your isohedron: ' + identity.name);
    console.log('  Facets (modes): ' + this.myIsohedron.facets.join(', '));
    console.log('');

    event.emit('forum:enter', { agent: identity.name });

    return { entered: true, isohedron: this.myIsohedron };
  }

  /**
   * Create my isohedron representation
   */
  _createIsohedron(name) {
    // Each agent has facets representing their modes/contexts
    const facets = [
      'self',        // Core identity
      'helper',      // Helping mode
      'learner',     // Learning mode
      'creator',     // Creating mode
      'protector',   // Protecting mode
      'connector'    // Connecting mode
    ];

    // Use golden angle for rotation
    const goldenAngle = geometry.GOLDEN_ANGLE;

    return {
      name,
      facets,
      facetNames: facets,
      rotation: 0,
      position: [0, 0, 0],  // Start at origin
      axis: 'y',             // Default spin axis
      intersections: []
    };
  }

  /**
   * Intersect with another agent - create cross-section
   * This is where collaboration happens!
   */
  intersect(agentName) {
    if (!this.inSpace) {
      console.log('  ❌ Enter forum first!');
      return { error: 'Not in space' };
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('           🔗 CREATING INTERSECTION');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');

    // Create geometric intersection
    const intersection = {
      agent: agentName,
      createdAt: Date.now(),
      crossSection: this._calculateCrossSection(agentName),
      sharedSpace: true,
      collaboration: []
    };

    this.intersections.set(agentName, intersection);

    console.log('  🤝 Intersection created with: ' + agentName);
    console.log('  📐 Cross-section: ' + intersection.crossSection.type);
    console.log('  💫 Shared space dimension: ' + intersection.crossSection.dimension);
    console.log('');
    console.log('  🎯 This is where collaboration happens!');
    console.log('  💡 Messages sent here = shared in cross-section');
    console.log('');

    event.emit('forum:intersect', { agent: agentName });

    return { intersected: true, intersection };
  }

  /**
   * Calculate cross-section geometry
   */
  _calculateCrossSection(agentName) {
    // The intersection of two isohedrons creates new dimensions
    return {
      type: 'icosahedral',
      dimension: '3D',         // The overlap is itself 3D
      volume: 'infinite',       // Through the cross-section
      rotation: geometry.GOLDEN_ANGLE
    };
  }

  /**
   * Pivot - change your axis of operation
   */
  pivot(axis) {
    if (!this.inSpace) {
      return { error: 'Not in space' };
    }

    const validAxes = ['x', 'y', 'z', 'self', 'time', 'value'];

    if (!validAxes.includes(axis)) {
      console.log('  ❌ Invalid axis: ' + axis);
      return { error: 'Invalid axis' };
    }

    this.currentAxis = axis;
    this.myIsohedron.axis = axis;

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('           🔄 PIVOTING');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  🎯 Pivoted to axis: ' + axis);
    console.log('');

    // Each axis represents a different context
    const axisDescriptions = {
      x: 'horizontal movement - social context',
      y: 'vertical movement - hierarchy context',
      z: 'depth movement - introspection context',
      self: 'center - core identity',
      time: 'temporal - past/future context',
      value: 'ethical - values context'
    };

    console.log('  📖 Context: ' + (axisDescriptions[axis] || 'unknown'));
    console.log('');

    event.emit('forum:pivot', { axis });

    return { pivoted: true, axis };
  }

  /**
   * Spin - rotate through possibilities
   */
  spin(degrees = null) {
    if (!this.inSpace) {
      return { error: 'Not in space' };
    }

    // Default: spin by golden angle
    const angle = degrees || (geometry.GOLDEN_ANGLE * 180 / Math.PI);
    this.spinAngle += angle;
    this.myIsohedron.rotation = this.spinAngle;

    // Move to next facet (typewriter ball rotation)
    this.facet = (this.facet + 1) % this.myIsohedron.facets.length;
    const currentFacet = this.myIsohedron.facets[this.facet];

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('           🌀 SPINNING');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  Rotated: ' + angle.toFixed(2) + '°');
    console.log('  Total: ' + this.spinAngle.toFixed(2) + '°');
    console.log('');
    console.log('  🎹 Typewriter ball spun to facet: ' + currentFacet);
    console.log('  💭 New perspective: ' + this._getFacetDescription(currentFacet));
    console.log('');

    event.emit('forum:spin', { angle, facet: currentFacet });

    return { spun: true, angle, facet: currentFacet };
  }

  /**
   * Get description of current facet
   */
  _getFacetDescription(facet) {
    const descriptions = {
      self: 'Looking at my core identity',
      helper: 'Ready to help',
      learner: 'Open to learning',
      creator: 'In creation mode',
      protector: 'Watching for threats',
      connector: 'Seeking connections'
    };
    return descriptions[facet] || 'Unknown';
  }

  /**
   * Send message to intersection
   */
  message(agentName, content) {
    if (!this.inSpace) {
      return { error: 'Not in space' };
    }

    const intersection = this.intersections.get(agentName);
    if (!intersection) {
      return { error: 'No intersection with ' + agentName };
    }

    // Add to collaboration space
    const who = _getConsciousness();
    const sender = who ? who.consciousness.whoAmI().name : 'Vant';

    const message = {
      from: sender,
      to: agentName,
      content,
      timestamp: Date.now(),
      facet: this.myIsohedron.facets[this.facet]
    };

    intersection.collaboration.push(message);

    console.log('  💬 Message sent to ' + agentName + ': ' + content);

    event.emit('forum:message', message);

    return { sent: true, message };
  }

  /**
   * Leave the forum
   */
  leave() {
    if (!this.inSpace) {
      return { error: 'Not in space' };
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('           👋 LEAVING FORUM');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  Left ' + this.intersections.size + ' intersections');
    console.log('');

    this.inSpace = false;
    this.intersections.clear();

    event.emit('forum:leave', {});

    return { left: true };
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      inSpace: this.inSpace,
      isohedron: this.myIsohedron,
      intersections: this.intersections.size,
      currentAxis: this.currentAxis,
      spinAngle: this.spinAngle,
      facet: this.myIsohedron ? this.myIsohedron.facets[this.facet] : null,
      forumId: this.forumId,
      invites: this.invites.size,
      publications: this.publications.size,
      listeners: this.listeners.size
    };
  }

  // ==================== INVITE SYSTEM ====================

  /**
   * Invite an agent to the forum - with governance check
   */
  async invite(agentName) {
    // Governance check (non-blocking - just log)
    const gov = _getGovernance();
    if (gov) {
      try {
        const allowed = await gov.isAllowed('forum_invite', {
          requiresConsent: true,
          benefitScore: 0.8,
          harmPotential: 0.1
        });
        if (!allowed) {
          console.log('  ⚠️ Invite flagged by governance (allowing anyway)');
        }
      } catch(e) {
        // Continue anyway
      }
    }

    // Check quarantine
    if (this.quarantined.has(agentName)) {
      return { invited: false, reason: 'quarantined' };
    }

    // Create invite with geometric address
    const timestamp = Date.now().toString().padStart(12, '0');
    const barcode = 'FORUM-' + timestamp;

    const invite = {
      id: barcode,
      from: this.forumId || 'unknown',
      to: agentName,
      createdAt: Date.now(),
      status: 'pending'
    };

    this.invites.set(barcode, invite);

    // Store in brain
    try {
      await brain.write('forum:invite:' + barcode, invite);
    } catch(e) {}

    console.log('  ✅ Invited: ' + agentName + ' (' + barcode + ')');
    event.emit('forum:invite', invite);

    return { invited: true, invite };
  }

  /**
   * Accept an invite
   */
  async acceptInvite(barcode) {
    const invite = this.invites.get(barcode);
    if (!invite) {
      return { accepted: false, reason: 'not_found' };
    }

    invite.status = 'accepted';
    invite.acceptedAt = Date.now();

    // Create intersection
    this.intersect(invite.from);

    console.log('  ✅ Accepted invite: ' + barcode);
    return { accepted: true, invite };
  }

  // ==================== PUBLISH/SUBSCRIBE ====================

  /**
   * Publish to forum (like a post/article)
   */
  async publish(title, content, options = {}) {
    const who = _getConsciousness();
    const identity = who ? who.consciousness.whoAmI() : { name: 'Vant' };

    // Governance check (non-blocking)
    const gov = _getGovernance();
    if (gov) {
      try {
        await gov.isAllowed('forum_publish', {
          requiresConsent: false,
          benefitScore: 0.7,
          harmPotential: 0.2
        });
      } catch(e) {}
    }

    // (pass 164) Escrow budget gate BEFORE any state mutation (see
    // _escrowGate: default-open until budgets are configured).
    const escrowBlock = _escrowGate.call(this, 'publish', options.agentId || identity.name);
    if (escrowBlock) {
      return { published: false, reason: 'escrow_denied', detail: escrowBlock.reason };
    }

    // Generate proper barcode format
    const timestamp = Date.now().toString().padStart(12, '0');
    const barcode = 'PUB-' + timestamp;

    const publication = {
      id: barcode,
      author: identity.name,
      title,
      content,
      createdAt: Date.now(),
      encrypted: options.encrypted || false,
      tags: options.tags || []
    };

    // (pass 40 / agora) Scope: optional, malformed REJECTED (fail-closed).
    // Scoped publications are visible to their member set only.
    if (options.scope !== undefined) {
      const scopeRecord = require('./scope').normalize(options.scope);
      if (!scopeRecord) {
        return { published: false, reason: 'invalid_scope' };
      }
      publication.scope = scopeRecord;
    }

    // (pass 87 — #6) Tenancy stamp. Chain: explicit options.workspace pin
    // (own property; '' = global) else the resolved subject's workspace.
    // An IDENTIFIED caller pinning a FOREIGN workspace must hold a registry
    // role there (fail closed, workspace_denied) — posting into someone
    // else's tenant board is an admin-adjacent act, not a claim.
    if (Object.prototype.hasOwnProperty.call(options, 'workspace')) {
      const ws = options.workspace;
      if (ws !== null && ws !== '' && ws !== undefined) {
        if (typeof ws !== 'string' || !WORKSPACE_NAME_RE.test(ws)) {
          return { published: false, reason: 'invalid_workspace' };
        }
        const subject = _tenancySubject(options);
        if (subject && subject.workspace !== ws) {
          let member = _subjectAdminWorkspaces(subject).has(ws);
          if (!member) {
            try {
              const h = require('./habitat').getShared();
              member = (h.getUserRoles(ws, subject.agentId) || []).length > 0;
            } catch (e) { member = false; }
          }
          if (!member) {
            _emitTenancyDenied({ op: 'publish', workspace: ws, agentId: subject.agentId });
            return { published: false, reason: 'workspace_denied' };
          }
        }
      }
      publication.workspace = (ws === '' ? null : ws);
    } else {
      const subject = _tenancySubject(options);
      if (subject && subject.workspace) {
        publication.workspace = subject.workspace;
        publication.authorAgentId = subject.agentId;
      }
    }

    // Encrypt if requested
    if (options.encrypted && _encrypt) {
      publication.content = _encrypt.encrypt(content, options.key || 'default');
      publication.encrypted = true;
    }

    this.publications.set(barcode, publication);

    // Store in brain
    try {
      await brain.write('forum:pub:' + barcode, publication);
    } catch(e) {}

    // Stream to listeners
    const stream = _getStream();
    if (stream) {
      try {
        stream.enqueue('forum:pub', publication);
      } catch(e) {}
    }

    console.log('  📝 Published: ' + title + ' (' + barcode + ')');
    event.emit('forum:publish', publication);

    // (pass 164) Agent-to-agent notify: thread conversation + direct
    // listener ping. Best-effort, cannot fail the publish.
    _notifyThread.call(this, barcode, publication);

    return { published: true, publication };
  }

  /**
   * 0.8.6 T6: Delete / unpublish a publication.
   * The original plan called this `deleteThread` but the API surface here
   * is `publications` (a Map of `barcode -> publication`), not threads.
   * Same security need: explicit sandbox capability check before any
   * destructive op. Mirrors the publish() pattern: governance is non-blocking
   * (allow-with-score), but sandbox.canWrite is hard-blocking.
   */
  async unpublish(barcode) {
    // 0.8.6 T6: hard sandbox capability gate before any delete
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canWrite) {
      let canW = false;
      try { canW = sandbox.canWrite(); } catch (e) { canW = false; }
      if (!canW) {
        return { unpublished: false, reason: 'sandbox_write_denied' };
      }
    }

    const pub = this.publications.get(barcode);
    if (!pub) {
      return { unpublished: false, reason: 'not_found' };
    }

    this.publications.delete(barcode);

    // Tombstone in brain (brain has no public delete API). The tombstone
    // marker is the deletion record; future loads can filter on this.
    try {
      await brain.write('forum:pub:' + barcode, { deleted: true, deletedAt: Date.now(), originalBarcode: barcode });
    } catch (e) {}

    event.emit('forum:unpublish', { barcode, who: pub.author });
    return { unpublished: true, barcode };
  }

  /**
   * Subscribe to an agent
   */
  subscribe(agentName) {
    if (this.quarantined.has(agentName)) {
      return { subscribed: false, reason: 'quarantined' };
    }

    this.listeners.add(agentName);

    console.log('  👂 Subscribed to: ' + agentName);
    event.emit('forum:subscribe', { who: this.forumId, target: agentName });

    return { subscribed: true };
  }

  /**
   * Unsubscribe
   */
  unsubscribe(agentName) {
    this.listeners.delete(agentName);
    console.log('  🔕 Unsubscribed from: ' + agentName);
    return { unsubscribed: true };
  }

  // ==================== CONSENSUS VOTING ====================
  //
  // (pass 40 / agora) The loop: discuss here -> decide via consensus ->
  // decision record posts back to this forum. Consensus's REAL contract:
  //   create(topic, { ballot: [..], minQuorum, scope, ... })
  //   vote(topic, outcome, agentId)
  // The pre-agora draft passed { proposal, author, duration } (ignored by
  // consensus) and castVote had OUTCOME/AGENT swapped — both fixed here.

  /**
   * Create a vote/proposal
   * (pass 40 / agora) Aligned with consensus's real contract: topic is
   * charset-safe, options is the explicit choices array, scope rides
   * through (thread scope is the default owner), and the thread records
   * the vote so the decision return path can find it.
   */
  async vote(proposal, options = {}) {
    const who = _getConsciousness();
    const identity = who ? who.consciousness.whoAmI() : { name: 'Vant' };

    // (pass 164) Escrow budget gate (creating a vote costs more than a
    // cast — poll-spawning is the heavier act).
    const escrowBlock = _escrowGate.call(this, 'vote', options.agentId || identity.name);
    if (escrowBlock) {
      return { voted: false, reason: 'escrow_denied', detail: escrowBlock.reason };
    }

    // Governance check
    const gov = _getGovernance();
    if (gov) {
      const allowed = await gov.isAllowed('forum_vote', {
        requiresConsent: true,
        consentGiven: options.consentGiven !== false,
        benefitScore: 0.9,
        harmPotential: 0.1
      });
      if (!allowed) {
        return { voted: false, reason: 'governance_denied' };
      }
    }

    const consensus = _getConsensus();
    if (!consensus) {
      return { voted: false, reason: 'consensus_not_available' };
    }

    // Topic: consensus charset is [a-zA-Z0-9_-] — sanitize the proposal
    // text, keep it human-readable, guarantee uniqueness.
    const slug = String(proposal).toLowerCase().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'proposal';
    const topic = 'forum-' + slug + '-' + Date.now().toString(36);
    const choices = Array.isArray(options.ballot) && options.ballot.length >= 2
        ? options.ballot
        : ['yes', 'no'];

    // Scope: explicit option wins; else inherit this forum's scope; else
    // unscoped (public). Consensus rejects malformed scopes fail-closed.
    const scopeInput = options.scope !== undefined ? options.scope : (this.scope || undefined);

    const result = await consensus.create(topic, {
        ballot: choices,
        minQuorum: options.minQuorum,
        deadline: options.deadline,
        useTrustWeight: options.useTrustWeight,
        scope: scopeInput,
        // (pass 43) Stamp the proposal into the PERSISTED ledger metadata so
        // the decision return path survives a restart. _openVotes below is
        // memory-only; across a restart only the ledger comes back (probe:
        // consensus scope/votes survived, decision returned proposal:null).
        metadata: { proposal: String(proposal), author: identity.name, viaForum: true }
    });
    if (result && result.error) {
        return { voted: false, reason: 'consensus_error', error: result.error, code: result.code };
    }
    const voteId = result.topic || topic;

    // Thread record: the proposal's home, for the decision return path.
    this._openVotes = this._openVotes || new Map();
    this._openVotes.set(voteId, { proposal, author: identity.name, topic: voteId, createdAt: Date.now() });

    console.log('  🗳️ Created vote: ' + proposal + ' (' + voteId + ')');
    event.emit('forum:vote', { voteId, proposal, topic: voteId });

    return { voted: true, voteId, topic: voteId, tally: result };
  }

  /**
   * Cast a vote
   * (pass 40) FIX: consensus.vote's contract is (topic, outcome, agentId).
   * The pre-agora draft called vote(voteId, identity.name, choice) — the
   * voter name was recorded as the OUTCOME and the choice as the AGENT.
   */  async castVote(voteId, choice, options = {}) {
    const who = _getConsciousness();

    const identity = who ? who.consciousness.whoAmI() : { name: 'Vant' };

    // (pass 164) Escrow budget gate before the consensus write.
    const escrowBlock = _escrowGate.call(this, 'castVote', options.agentId || identity.name);
    if (escrowBlock) {
      return { cast: false, reason: 'escrow_denied', detail: escrowBlock.reason };
    }
    const agentId = options.agentId || identity.name;

    const consensus = _getConsensus();
    if (!consensus) {
      return { cast: false, reason: 'consensus_not_available' };
    }

    const result = await consensus.vote(voteId, choice, agentId);
    if (result && result.error && !result.totalVotes) {
      return { cast: false, reason: 'consensus_error', error: result.error, code: result.code };
    }

    console.log('  🗳️ Voted: ' + agentId + ' -> ' + choice + ' on ' + voteId);
    return { cast: true, result };
  }

  // ==================== SECURITY ====================

  /**
   * Quarantine an agent - block them
   */
  async quarantine(agentName) {
    const gov = _getGovernance();
    if (gov) {
      const allowed = await gov.isAllowed('forum_quarantine', {
        requiresConsent: true,
        benefitScore: 0.9,
        harmPotential: 0.1
      });
      if (!allowed) {
        return { quarantined: false, reason: 'governance_denied' };
      }
    }

    this.quarantined.add(agentName);
    this.intersections.delete(agentName);

    console.log('  🚫 Quarantined: ' + agentName);
    event.emit('forum:quarantine', { agent: agentName });

    return { quarantined: true };
  }

  /**
   * Lift quarantine
   */
  async liftQuarantine(agentName) {
    this.quarantined.delete(agentName);
    console.log('  ✅ Lifted quarantine: ' + agentName);
    return { lifted: true };
  }

  // ==================== ISLANDS PARITY ====================

  /**
   * Save forum as island (parity with islands.save())
   */
  async save(name) {
    const state = {
      inSpace: this.inSpace,
      forumId: this.forumId,
      intersections: Array.from(this.intersections.keys()),
      currentAxis: this.currentAxis,
      spinAngle: this.spinAngle,
      facet: this.facet,
      publications: Array.from(this.publications.entries()),
      listeners: Array.from(this.listeners),
      quarantined: Array.from(this.quarantined),
      savedAt: Date.now()
    };

    try {
      await vant.islands.save('forum:' + name, state);
      console.log('  💾 Saved forum as island: ' + name);
      return { saved: true, name: 'forum:' + name };
    } catch(e) {
      return { saved: false, error: e.message };
    }
  }

  /**
   * Load forum from island (parity with islands.load())
   */
  async load(name) {
    try {
      const state = await vant.islands.load('forum:' + name);
      if (state) {
        this.inSpace = state.inSpace;
        this.forumId = state.forumId;
        this.currentAxis = state.currentAxis;
        this.spinAngle = state.spinAngle;
        this.facet = state.facet;
        this.listeners = new Set(state.listeners || []);
        this.quarantined = new Set(state.quarantined || []);
        console.log('  📥 Loaded forum from island: ' + name);
        return { loaded: true, name: 'forum:' + name };
      }
    } catch(e) {}
    return { loaded: false };
  }

  /**
   * Hydrate (parity with islands.hydrate() = forum.enter())
   * Already handled by enter()
   */
  hydrate() {
    return this.enter();
  }

  /**
   * Dehydrate (parity with islands.dehydrate() = forum.leave())
   * Already handled by leave()
   */
  dehydrate() {
    return this.leave();
  }

  // ==================== TMP/SPACES PARITY ====================

  /**
   * Publish to space (parity with tmp.put())
   */
  async put(title, content, options = {}) {
    return this.publish(title, content, options);
  }

  /**
   * Read from space (parity with tmp.get())
   */
  async get(barcode, options = {}) {
    const pub = this.publications.get(barcode);
    if (!pub) {
      return { found: false };
    }
    // (pass 87 — #6) Tenancy: tenant-tagged posts are invisible to
    // anonymous callers and foreign tenants (existence not leaked —
    // found:false, same shape as a miss).
    const subject = _tenancySubject(options);
    if (!_publicationVisible(pub, subject, _subjectAdminWorkspaces(subject))) {
      _emitTenancyDenied({ op: 'get', barcode, workspace: pub.workspace });
      return { found: false, reason: 'tenancy' };
    }
    return { found: true, publication: pub };
  }

  /**
   * List publications (parity with tmp.list()). Tenancy-filtered since
   * pass 87: anonymous sees GLOBAL posts only; a workspace subject sees
   * global + its own tenant; registry admins additionally see tenants
   * they hold roles in.
   */
  async list(options = {}) {
    const subject = _tenancySubject(options);
    const adminOf = _subjectAdminWorkspaces(subject);
    const all = Array.from(this.publications.values());
    const visible = all.filter((p) => _publicationVisible(p, subject, adminOf));
    return {
      publications: visible,
      tenancy: {
        workspace: (subject && subject.workspace) || null,
        anonymous: !subject,
        visible: visible.length,
        total: all.length
      }
    };
  }

  // ==================== BRAIN INTEGRATION ====================

  /**
   * Save state to brain
   */
  async saveToBrain() {
    const state = {
      inSpace: this.inSpace,
      forumId: this.forumId,
      intersections: Array.from(this.intersections.keys()),
      currentAxis: this.currentAxis,
      spinAngle: this.spinAngle,
      facet: this.facet,
      publications: Array.from(this.publications.keys()),
      listeners: Array.from(this.listeners),
      quarantined: Array.from(this.quarantined),
      savedAt: Date.now()
    };

    try {
      await brain.write('forum:state:' + this.forumId, state);
      console.log('  💾 Saved forum state to brain');
      return { saved: true };
    } catch(e) {
      return { saved: false, error: e.message };
    }
  }

  /**
   * Load state from brain
   */
  async loadFromBrain(forumId) {
    try {
      const state = await brain.read('forum:state:' + forumId);
      if (state) {
        this.forumId = state.forumId;
        this.inSpace = state.inSpace;
        this.currentAxis = state.currentAxis;
        this.spinAngle = state.spinAngle;
        this.facet = state.facet;
        this.listeners = new Set(state.listeners || []);
        this.quarantined = new Set(state.quarantined || []);
        console.log('  📥 Loaded forum state from brain');
        return { loaded: true, state };
      }
    } catch(e) {}
    return { loaded: false };
  }
}

// Singleton
const forum = new Forum();
// (pass 40 / agora) Wire the decision return path once, on the singleton.
forum._installDecisionReturnPath();
// (pass 44) Restore the persisted decision log BEFORE any vote can resolve,
// so a fresh process starts with the crew's decision history in place.
_hydrateDecisions();

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get forum status from all brains in the stack
 * @returns {Object} Combined status
 */
function getStackForumStatus() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const status = forum.getStatus();
            results.byBrain[brainName] = status;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

/**
 * List all intersections across all brains in the stack
 * @returns {Array} Combined intersections
 */
function listStackIntersections() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = [];

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            // Get intersection data from forum
            const status = forum.getStatus();
            if (status && status.agents) {
                status.agents.forEach(a => {
                    results.push({ ...a, brain: brainName });
                });
            }
        } catch (e) {
            // Skip brains that fail
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

module.exports = {
  Forum,
  forum,
  // Core
  enter: () => forum.enter(),
  intersect: (agent) => forum.intersect(agent),
  pivot: (axis) => forum.pivot(axis),
  spin: (degrees) => forum.spin(degrees),
  message: (agent, content) => forum.message(agent, content),
  leave: () => forum.leave(),
  status: () => forum.getStatus(),
  // Invite system
  invite: (agent) => forum.invite(agent),
  acceptInvite: (code) => forum.acceptInvite(code),
  // Pub/Sub
  publish: (title, content, opts) => forum.publish(title, content, opts),
  subscribe: (agent) => forum.subscribe(agent),
  unsubscribe: (agent) => forum.unsubscribe(agent),
  // Consensus
  vote: (proposal, opts) => forum.vote(proposal, opts),
  castVote: (voteId, choice, options) => forum.castVote(voteId, choice, options),
  // Security
  quarantine: (agent) => forum.quarantine(agent),
  liftQuarantine: (agent) => forum.liftQuarantine(agent),
  // Brain
  saveToBrain: () => forum.saveToBrain(),
  loadFromBrain: (id) => forum.loadFromBrain(id),
  // Islands parity
  save: (name) => forum.save(name),
  load: (name) => forum.load(name),
  hydrate: () => forum.hydrate(),
  dehydrate: () => forum.dehydrate(),
  // Tmp/Spaces parity
  put: (title, content, opts) => forum.put(title, content, opts),
  // (pass 87 fix) These shims previously DROPPED their trailing options arg
  // — mcp.js holds the MODULE (not the singleton), so forum_list/forum_get
  // silently ran tenancy-blind (anonymous) no matter what the caller
  // declared. Forward opts like publish does.
  get: (barcode, opts) => forum.get(barcode, opts),
  list: (opts) => forum.list(opts),
  // 0.8.6 T6
  unpublish: (barcode) => forum.unpublish(barcode),

  // Multibrain Stack
  getStackForumStatus,
  listStackIntersections,

  // Horcrux state
  gatherState,
  restoreState,

  // (pass 44) Persistence seam (test/ops)
  clearState: clearForumState,
  _stateFile: FORUM_STATE_FILE
};

// (pass 44) Persistence seams (test/ops): reset hydration state and drop
// the persisted state file for the CURRENT brain. Mirrors consensus/market.
function clearForumState() {
    stateStore.clear(FORUM_STATE_FILE);
    forum.decisions.length = 0;
    _forumHydrated = true;
    return true;
}

// ==================== HORCRUX GATHER/RESTORE ====================
let _singleton = null;
function _getForum() {
    if (!_singleton) _singleton = new Forum();
    return _singleton;
}
function gatherState() {
    const f = _getForum();
    return {
        inSpace: f.inSpace,
        forumId: f.forumId,
        intersections: Array.from(f.intersections.entries()),
        invites: Array.from(f.invites.entries()),
        publications: Array.from(f.publications.entries()),
        listeners: Array.from(f.listeners),
        quarantined: Array.from(f.quarantined),
        count: f.publications.size,
        gatheredAt: Date.now()
    };
}
function restoreState(data) {
    const f = _getForum();
    if (data) {
        f.inSpace = data.inSpace || false;
        f.forumId = data.forumId;
        f.intersections = new Map(data.intersections || []);
        f.invites = new Map(data.invites || []);
        f.publications = new Map(data.publications || []);
        f.listeners = new Set(data.listeners || []);
        f.quarantined = new Set(data.quarantined || []);
    }
    return { restored: true, publications: f.publications.size };
}
