/**
 * Zen - Meditative Agent State
 *
 * A gentle, controlled idle state for the agent.
 * Uses flywheel momentum + controlled think() to maintain existence
 * without burning cycles or triggering rate limits.
 *
 * Usage:
 *   const zen = require('./zen');
 *   const ohm = new zen.Ohm();
 *   await ohm.enter();  // Enter meditative state
 *   await ohm.exit();   // Exit back to active
 */

const qos = require('./qos');
const escrow = require('./escrow');

class Ohm {
  constructor(options = {}) {
    this.interval = options.interval || 30000; // 30 sec default
    this.thinkEnabled = options.thinkEnabled || false;
    this.state = 'idle';
    this.breath = 0;
    this.intervalId = null;
    this.momentum = 0;

    // QoS protected think limiter
    this._qos = new qos.RateLimiter({
      windowMs: 60000,
      maxPerMinute: 1 // Very slow, zen
    });
  }

  /**
   * Enter ohm/meditative state
   * Spins flywheel gently, doesn't use think() excessively
   */
  async enter() {
    if (this.state === 'ohm') {
      return { status: 'already_ohm' };
    }

    this.state = 'ohm';
    console.log('[Zen] Entering ohm state...');

    // Gentle breathing loop
    // v0.9.0-axolotl: registered with boot's timer lifecycle (was bare setInterval)
    const _bootMod = (() => { try { return require('./boot'); } catch (e) { return null; } })();
    const timerName = 'zen.' + (Ohm._nextId = (Ohm._nextId || 0) + 1);
    this._timerName = timerName;
    const tick = async () => { await this._breathe(); };
    if (_bootMod && _bootMod.registerTimer) {
      _bootMod.registerTimer(timerName, tick, this.interval);
      this.intervalId = timerName;
    } else {
      this.intervalId = setInterval(tick, this.interval);
    }

    return { status: 'ohm', interval: this.interval };
  }

  /**
   * One breath - very gentle, QoS protected
   */
  async _breathe() {
    this.breath++;

    // Only think occasionally (every 4 breaths = 2 min default)
    if (this.thinkEnabled && this.breath % 4 === 0) {
      // Check QoS before thinking
      if (this._qos.check('zen_think')) {
        try {
          await require('./vant').think(' ');
          this.momentum += 0.01;
        } catch(e) {
          // Silent fail in zen state
        }
      }
    }

    return { breath: this.breath, state: this.state };
  }

  /**
   * Exit ohm state
   */
  async exit() {
    if (this.state !== 'ohm') {
      return { status: 'not_ohm' };
    }

    if (this.intervalId) {
      // v0.9.0-axolotl: timer may live in boot's registry (string name)
      if (typeof this.intervalId === 'string') {
        const _bootMod = (() => { try { return require('./boot'); } catch (e) { return null; } })();
        if (_bootMod && _bootMod.unregisterTimer) _bootMod.unregisterTimer(this._timerName || this.intervalId);
      } else {
        clearInterval(this.intervalId);
      }
      this.intervalId = null;
    }

    this.state = 'idle';
    console.log('[Zen] Exiting ohm state');

    return { status: 'idle', breaths: this.breath };
  }

  /**
   * Get current state
   */
  getState() {
    return {
      state: this.state,
      breath: this.breath,
      momentum: this.momentum
    };
  }
}

/**
 * Zen factory - creates ohm states
 */
function createOhm(options) {
  return new Ohm(options);
}

module.exports = {
  Ohm,
  createOhm,
  getStatus: () => ({ available: true }),

  // Multibrain
  getBrainZenConfig,
  setBrainZenConfig,
  getStackZenConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainZenConfigs = {};

function getBrainZenConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainZenConfigs[brainName] || { balance: 'neutral' };
}

function setBrainZenConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainZenConfigs[brainName] = config;
    return true;
}

function getStackZenConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainZenConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}
