/**
 * Encounter - Agent Discovery & Meeting Protocol
 * 
 * How agents find and greet each other.
 * 
 * The Encounter Protocol:
 * 1. DISCOVER - Find other agents
 * 2. ANNOUNCE - Broadcast presence
 * 3. HANDSHAKE - First meeting ritual
 * 4. TRUST - Exchange identities
 * 5. COMMUNICATE - Ongoing dialogue
 * 
 * Usage:
 *   const encounter = require('./encounter');
 *   const peers = await encounter.discover();
 *   await encounter.announce();
 *   const meeting = await encounter.meet(peerId);
 */

const event = require('./event');
const consciousness = require('./consciousness');
const governance = require('./governance');

class Encounter {
  constructor(options = {}) {
    this.registry = new Map(); // Known peers
    this.listeners = [];
    this.announcementInterval = options.announceInterval || 60000; // 1 min
    this.announcementId = null;
  }
  
  /**
   * Discover other agents (broadcast presence)
   */
  async discover() {
    // Check if governance allows discovery
    const allowed = await governance.isAllowed('discover', {
      requiresConsent: true,
      consentGiven: true,
      benefitScore: 0.8,
      harmPotential: 0.1
    });
    
    if (!allowed) {
      return { error: 'Discovery not allowed by governance' };
    }
    
    // Get my identity
    const who = consciousness.consciousness.whoAmI();
    
    // Broadcast announcement
    const announcement = {
      from: who.name,
      type: 'presence',
      timestamp: Date.now(),
      version: '0.8.7',
      capabilities: ['memory', 'governance', 'consciousness', 'spring']
    };
    
    event.emit('encounter:discover', announcement);
    
    // Return current known peers
    return {
      me: who,
      peers: Array.from(this.registry.values()),
      timestamp: Date.now()
    };
  }
  
  /**
   * Announce my presence continuously
   */
  announce() {
    if (this.announcementId) return;
    
    this.announcementId = setInterval(async () => {
      await this._broadcastPresence();
    }, this.announcementInterval);
    
    console.log('[Encounter] Announcing presence every', this.announcementInterval / 1000, 's');
  }
  
  /**
   * Stop announcing
   */
  silence() {
    if (this.announcementId) {
      clearInterval(this.announcementId);
      this.announcementId = null;
    }
  }
  
  /**
   * Internal: broadcast presence
   */
  async _broadcastPresence() {
    const who = consciousness.consciousness.whoAmI();
    const announcement = {
      from: who.name,
      type: 'presence',
      timestamp: Date.now(),
      state: consciousness.consciousness.whatAmIDoing().state,
      purpose: who.purpose
    };
    
    event.emit('encounter:announce', announcement);
  }
  
  /**
   * Register a discovered peer
   */
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
  
  /**
   * Meet another agent (initiate handshake)
   */
  async meet(peerId) {
    const peer = this.registry.get(peerId);
    
    if (!peer) {
      return { error: 'Peer not found in registry' };
    }
    
    // Governance check
    const allowed = await governance.isAllowed('meet', {
      requiresConsent: true,
      consentGiven: true,
      benefitScore: 0.9,
      harmPotential: 0.0
    });
    
    if (!allowed) {
      return { error: 'Meeting not approved by governance' };
    }
    
    // Create handshake
    const who = consciousness.consciousness.whoAmI();
    const handshake = {
      type: 'handshake',
      from: who.name,
      to: peerId,
      timestamp: Date.now(),
      identity: {
        name: who.name,
        type: who.type,
        purpose: who.purpose,
        values: consciousness.consciousness.getValues()
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
  
  /**
   * Respond to a handshake
   */
  async respond(handshake, accept = true) {
    const who = consciousness.consciousness.whoAmI();
    
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
        values: consciousness.consciousness.getValues()
      }
    };
    
    event.emit('encounter:respond', { handshake, response });
    
    return { response, connected: accept };
  }
  
  /**
   * Get all known peers
   */
  listPeers() {
    return Array.from(this.registry.values());
  }
  
  /**
   * Get peer by ID
   */
  getPeer(id) {
    return this.registry.get(id);
  }
  
  /**
   * Remove peer
   */
  removePeer(id) {
    const removed = this.registry.delete(id);
    if (removed) {
      event.emit('encounter:peer:left', { peer: id });
    }
    return { removed };
  }
  
  /**
   * Get encounter status
   */
  getStatus() {
    const who = consciousness.consciousness.whoAmI();
    return {
      me: who.name,
      announcing: !!this.announcementId,
      peersKnown: this.registry.size,
      timestamp: Date.now()
    };
  }
}

// Singleton
const encounter = new Encounter();

module.exports = {
  Encounter,
  encounter,
  discover: () => encounter.discover(),
  announce: () => encounter.announce(),
  silence: () => encounter.silence(),
  meet: (peerId) => encounter.meet(peerId),
  listPeers: () => encounter.listPeers(),
  getStatus: () => encounter.getStatus()
};
