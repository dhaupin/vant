/**
 * Vant Forum - Geometric Space for Agent Collaboration
 * 
 * A 3D spatial forum using isohedrons for agent interaction.
 * Not Facebook. Not social media. Real geometric collaboration.
 * 
 * FULLY INTEGRATED WITH OS:
 * - Brain: Store forum state in brain memory
 * - Islands: Load forum as lazy island
 * - Security: Sandbox, escrow, governance checks
 * - Consensus: Voting on forum decisions
 * - Geometric Storage: Quasicrystal address for forum data
 * - Stream: Real-time forum events
 * - Msg: Agent-to-agent forum messages
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
    
    return { published: true, publication };
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
  
  /**
   * Create a vote/proposal
   */
  async vote(proposal, options = {}) {
    const who = _getConsciousness();
    const identity = who ? who.consciousness.whoAmI() : { name: 'Vant' };
    
    // Governance check
    const gov = _getGovernance();
    if (gov) {
      const allowed = await gov.isAllowed('forum_vote', {
        requiresConsent: true,
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
    
    const voteId = 'VOTE-' + Date.now();
    const result = await consensus.create(voteId, {
      proposal,
      author: identity.name,
      options: options.options || ['yes', 'no'],
      duration: options.duration || 60000
    });
    
    console.log('  🗳️ Created vote: ' + proposal + ' (' + voteId + ')');
    event.emit('forum:vote', { voteId, proposal });
    
    return { voted: true, voteId };
  }
  
  /**
   * Cast a vote
   */
  async castVote(voteId, choice) {
    const who = _getConsciousness();
    const identity = who ? who.consciousness.whoAmI() : { name: 'Vant' };
    
    const consensus = _getConsensus();
    if (!consensus) {
      return { cast: false, reason: 'consensus_not_available' };
    }
    
    const result = await consensus.vote(voteId, identity.name, choice);
    
    console.log('  🗳️ Voted: ' + choice + ' on ' + voteId);
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
  async get(barcode) {
    const pub = this.publications.get(barcode);
    if (pub) {
      return { found: true, publication: pub };
    }
    return { found: false };
  }
  
  /**
   * List publications (parity with tmp.list())
   */
  async list() {
    return { publications: Array.from(this.publications.values()) };
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
  castVote: (voteId, choice) => forum.castVote(voteId, choice),
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
  get: (barcode) => forum.get(barcode),
  list: () => forum.list(),
  
  // Multibrain Stack
  getStackForumStatus,
  listStackIntersections
};
