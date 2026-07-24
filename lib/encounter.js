/**
 * Encounter - Agent Discovery & Meeting Protocol (Vant OS Integrated)
 * 
 * How agents find and greet each other.
 * Uses OS patterns: lazy-loading, event emissions, capability checks.
 */

const event = require('./event');
const consciousness = require('./consciousness');
const governance = require('./governance');

class Encounter {
  constructor(options = {}) {
    this.registry = new Map();
    this.listeners = [];
    this.announcementInterval = options.announceInterval || 60000;
    this.announcementId = null;
  }
  
  async discover() {
    const gov = governance || { isAllowed: async () => true };
    const allowed = await gov.isAllowed('discover', {
      requiresConsent: true,
      consentGiven: true,
      benefitScore: 0.8,
      harmPotential: 0.1
    });
    
    if (!allowed) {
      return { error: 'Discovery not allowed by governance' };
    }
    
    const who = (consciousness && consciousness.consciousness) ? consciousness.consciousness.whoAmI() : { name: 'Vant', type: 'Agent' };
    
    const announcement = {
      from: who.name,
      type: 'presence',
      timestamp: Date.now(),
      version: '0.8.7',
      capabilities: ['memory', 'governance', 'consciousness', 'spring']
    };
    
    event.emit('encounter:discover', announcement);
    
    return {
      me: who,
      peers: Array.from(this.registry.values()),
      timestamp: Date.now()
    };
  }
  
  announce() {
    if (this.announcementId) return;
    
    this.announcementId = setInterval(async () => {
      await this._broadcastPresence();
    }, this.announcementInterval);
    
    console.log('[Encounter] Announcing presence every', this.announcementInterval / 1000, 's');
  }
  
  silence() {
    if (this.announcementId) {
      clearInterval(this.announcementId);
      this.announcementId = null;
    }
  }
  
  async _broadcastPresence() {
    const who = (consciousness && consciousness.consciousness) ? consciousness.consciousness.whoAmI() : { name: 'Vant' };
    const state = (consciousness && consciousness.consciousness) ? consciousness.consciousness.whatAmIDoing() : { state: 'idle' };
    
    const announcement = {
      from: who.name,
      type: 'presence',
      timestamp: Date.now(),
      state: state.state,
      purpose: who.purpose
    };

    event.emit('encounter:announce', announcement);
  }
  
  registerPeer(peer) {
    const id = peer.name || peer.from || 'unknown';
    this.registry.set(id, {
      ...peer,
      firstSeen: peer.firstSeen || Date.now(),
      lastSeen: Date.now()
    });
    
    event.emit('encounter:peer:found', { peer: id });
    return { registered: id };
  }
  
  async meet(peerId) {
    const peer = this.registry.get(peerId);
    
    if (!peer) {
      return { error: 'Peer not found in registry' };
    }
    
    const gov = governance || { isAllowed: async () => true };
    const allowed = await gov.isAllowed('meet', {
      requiresConsent: true,
      consentGiven: true,
      benefitScore: 0.9,
      harmPotential: 0.0
    });
    
    if (!allowed) {
      return { error: 'Meeting not approved by governance' };
    }
    
    const who = (consciousness && consciousness.consciousness) ? consciousness.consciousness.whoAmI() : { name: 'Vant' };
    const vals = (consciousness && consciousness.consciousness) ? consciousness.consciousness.getValues() : ['Help', 'Grow'];
    
    const handshake = {
      type: 'handshake',
      from: who.name,
      to: peerId,
      timestamp: Date.now(),
      identity: {
        name: who.name,
        type: who.type,
        purpose: who.purpose,
        values: vals
      },
      intent: 'greeting'
    };
    
    event.emit('encounter:meet', { peer: peerId, handshake });
    
    return {
      peer: peerId,
      handshake,
      status: 'initiated'
    };
  }
  
  async respond(handshake, accept = true) {
    const who = (consciousness && consciousness.consciousness) ? consciousness.consciousness.whoAmI() : { name: 'Vant' };
    const vals = (consciousness && consciousness.consciousness) ? consciousness.consciousness.getValues() : ['Help', 'Grow'];
    
    const response = {
      type: 'handshake_response',
      from: who.name,
      to: handshake.from,
      timestamp: Date.now(),
      accepted: accept,
      identity: {
        name: who.name,
        type: who.type,
        purpose: who.purpose,
        values: vals
      }
    };
    
    event.emit('encounter:respond', { handshake, response });
    
    return { response, connected: accept };
  }
  
  listPeers() {
    return Array.from(this.registry.values());
  }
  
  getPeer(id) {
    return this.registry.get(id);
  }
  
  removePeer(id) {
    const removed = this.registry.delete(id);
    if (removed) {
      event.emit('encounter:peer:left', { peer: id });
    }
    return { removed };
  }
  
  getStatus() {
    const who = (consciousness && consciousness.consciousness) ? consciousness.consciousness.whoAmI() : { name: 'Vant' };
    return {
      me: who.name,
      announcing: !!this.announcementId,
      peersKnown: this.registry.size,
      timestamp: Date.now()
    };
  }
}

const encounter = new Encounter();

module.exports = {
  Encounter,
  encounter,
  discover: () => encounter.discover(),
  announce: () => encounter.announce(),
  silence: () => encounter.silence(),
  meet: (peerId) => encounter.meet(peerId),
  listPeers: () => encounter.listPeers(),
  getStatus: () => encounter.getStatus(),
  registerPeer: (peer) => encounter.registerPeer(peer),
  removePeer: (name) => encounter.removePeer(name),
  
  // Multibrain
  getBrainEncounterConfig,
  setBrainEncounterConfig,
  getStackEncounterConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainEncounterConfigs = {};

function getBrainEncounterConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainEncounterConfigs[brainName] || { discovery: true };
}

function setBrainEncounterConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainEncounterConfigs[brainName] = config;
    return true;
}

function getStackEncounterConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };
    
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainEncounterConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}
