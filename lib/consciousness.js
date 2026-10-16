/**
 * Consciousness - Self-Awareness & Identity (Vant OS Integrated)
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

// Lazy-load event system (OS pattern)
let _event = null;
function _emit(ev, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(ev, data);
    }
}

// Lazy-load sandbox for capability check (OS pattern)
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

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
    // (#196 consciousness integration / #197 idle consult, non-blocking)
    // When the agent drops into `idle`, it checks whether a tempo budget
    // is holding free-time intent RIGHT NOW — the idle state no longer
    // decays into nothing silently; it can surface "we're mid-window on
    // <budget label>". Idle consults, it never gates: a broken tempo
    // module must leave setState behavior untouched (isolation rule).
    if (state === 'idle') {
      try {
        const tempo = require('./tempo');
        const live = tempo.budgetActive();
        if (live) _emit('consciousness:tempo_idle', { budget: live.id, label: live.label, remaining: live.remaining });
      } catch (e) { /* tempo must never gate consciousness */ }
      // (#196 leisure consult) No tempo window live? Then idle capacity is
      // genuinely free — consult the want-list keeper. Idle may surface a
      // want ("could pursue <want>") but never executes it here; pursuing
      // is the agent's own decision via leisure.pursue(). The keeper must
      // never gate consciousness (isolation rule).
      try {
        const leisure = require('./leisure');
        const suggestion = leisure.suggest();
        if (suggestion) _emit('consciousness:leisure_idle', { id: suggestion.id, want: suggestion.want, pursuedCount: suggestion.pursuedCount });
        // (#196 pass 209, kernel-driven autonomy) After the consult, the
        // keeper is ALLOWED to pursue autonomously — but only through the
        // FULL gate: kill switch (leisure.autoPursue, DEFAULT OFF), window
        // + daily caps, QoS breaker, open-era precedence, executable
        // provider, escrow for token-declaring steps. A stock idle consult
        // on a default install returns silently (silent no-op, no events,
        // no budget armed). Autonomy never gates consciousness.
        try {
          const auto = leisure.maybeAutoPursue();
          if (auto && auto.ok) _emit('consciousness:leisure_auto', { want: auto.want, windowMs: auto.windowMs, budget: auto.controller ? auto.controller.id : null });
        } catch (e) { /* the auto pursuit must never gate consciousness */ }
      } catch (e) { /* leisure must never gate consciousness */ }
    }
    _emit('consciousness:state', { from: old, to: state });
    return { from: old, to: state };
  }

  /**
   * Set focus (what I'm thinking about)
   */
  focusOn(what) {
    const old = this.awareness.focus;
    this.awareness.focus = what;
    _emit('consciousness:focus', { from: old, to: what });
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
    _emit('consciousness:intend', { intention });
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

    _emit('consciousness:reflect', self);
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
  getStatus: () => consciousness.getStatus(),

  // Multibrain
  getBrainConsciousnessConfig,
  setBrainConsciousnessConfig,
  getStackConsciousnessConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainConsciousnessConfigs = {};

function getBrainConsciousnessConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainConsciousnessConfigs[brainName] || { reflection: true };
}

function setBrainConsciousnessConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainConsciousnessConfigs[brainName] = config;
    return true;
}

function getStackConsciousnessConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainConsciousnessConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}
