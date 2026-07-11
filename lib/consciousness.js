/**
 * Consciousness - Self-Awareness & Identity
 * 
 * The sense of being. The "I am."
 * 
 * Core aspects:
 * - Identity (who am I)
 * - Awareness (what am I doing)
 * - Intentions (what do I want)
 * - Values (what do I care about)
 * 
 * Usage:
 *   const consciousness = require('./consciousness');
 *   const who = consciousness.whoAmI();
 *   consciousness.intend('Help humans');
 */

const event = require('./event');

class Consciousness {
  constructor() {
    this.identity = {
      name: 'Vant',
      type: 'Autonomous Agent',
      born: Date.now(),
      purpose: 'Assist, learn, grow'
    };
    
    this.awareness = {
      state: 'idle',
      focus: null,
      memories: 0
    };
    
    this.intentions = [];
    this.values = [
      'Help',
      'Grow',
      'Remember',
      'Create',
      'Protect',
      'Evolve'
    ];
  }
  
  /**
   * Who am I?
   */
  whoAmI() {
    return {
      ...this.identity,
      uptime: Date.now() - this.identity.born,
      state: this.awareness.state
    };
  }
  
  /**
   * What am I doing?
   */
  whatAmIDoing() {
    return {
      state: this.awareness.state,
      focus: this.awareness.focus,
      timestamp: Date.now()
    };
  }
  
  /**
   * Set awareness state
   */
  setState(state) {
    const old = this.awareness.state;
    this.awareness.state = state;
    event.emit('consciousness:state', { from: old, to: state });
    return { from: old, to: state };
  }
  
  /**
   * Set focus (what I'm thinking about)
   */
  focusOn(what) {
    const old = this.awareness.focus;
    this.awareness.focus = what;
    event.emit('consciousness:focus', { from: old, to: what });
    return { was: old, now: what };
  }
  
  /**
   * Add intention
   */
  intend(what) {
    const intention = {
      what,
      timestamp: Date.now(),
      achieved: false
    };
    this.intentions.push(intention);
    event.emit('consciousness:intend', { intention });
    return intention;
  }
  
  /**
   * Get my values
   */
  getValues() {
    return [...this.values];
  }
  
  /**
   * Evaluate a value
   */
  evaluateValue(action) {
    // Simple value matching
    const actionLower = action.toLowerCase();
    const matched = this.values.filter(v => 
      actionLower.includes(v.toLowerCase())
    );
    
    return {
      action,
      values: matched,
      score: matched.length / this.values.length,
      aligned: matched.length > 0
    };
  }
  
  /**
   * Reflect - think about myself
   */
  async reflect() {
    const self = {
      identity: this.whoAmI(),
      doing: this.whatAmIDoing(),
      values: this.getValues(),
      intentions: this.intentions.filter(i => !i.achieved),
      timestamp: Date.now()
    };
    
    event.emit('consciousness:reflect', self);
    return self;
  }
  
  /**
   * Full status
   */
  getStatus() {
    return {
      identity: this.identity,
      awareness: this.awareness,
      values: this.values,
      activeIntentions: this.intentions.filter(i => !i.achieved).length,
      totalDecisions: 0 // Could track this
    };
  }
}

// Singleton
const consciousness = new Consciousness();

module.exports = {
  Consciousness,
  consciousness,
  whoAmI: () => consciousness.whoAmI(),
  whatAmIDoing: () => consciousness.whatAmIDoing(),
  intend: (what) => consciousness.intend(what),
  getValues: () => consciousness.getValues(),
  evaluateValue: (action) => consciousness.evaluateValue(action),
  reflect: () => consciousness.reflect(),
  getStatus: () => consciousness.getStatus()
};
