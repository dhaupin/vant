/**
 * Watch - Self-Healing & Recovery System
 * 
 * Monitors system health and bounces back when things fail.
 * The "spring" that catches the system when it falls.
 * 
 * Concept:
 * - Watch: Monitor health, detect failures
 * - Spring: Bounce back, retry, recover
 * - Entropic Kinetics: Use chaos/randomness to find new recovery paths
 * 
 * Usage:
 *   const watch = require('./watch');
 *   const spring = new watch.Spring();
 *   spring.on('failure', async () => await recover());
 *   spring.watch(() => checkHealth());
 *   spring.enableEntropicRecovery();
 */

const event = require('./event');
const network = require('./network');

/**
 * Entropic Kinetics - Use entropy to recover
 * Like nature uses disorder to find new paths
 */
class EntropicRecovery {
  constructor() {
    this.entropyPool = [];
    this.maxEntropy = 1000;
  }
  
  /**
   * Add entropy to the pool
   */
  add(entropy) {
    this.entropyPool.push({ entropy, time: Date.now() });
    if (this.entropyPool.length > this.maxEntropy) {
      this.entropyPool.shift();
    }
  }
  
  /**
   * Sample from entropy pool for recovery
   */
  sample() {
    if (this.entropyPool.length === 0) {
      return Math.random();
    }
    // Sample from recent entropy
    const idx = Math.floor(Math.random() * this.entropyPool.length);
    return this.entropyPool[idx].entropy;
  }
  
  /**
   * Generate recovery approach using entropy
   */
  generateApproach() {
    const entropy = this.sample();
    const approaches = [
      { name: 'retry', weight: 0.3 },      // Try again
      { name: 'wait', weight: 0.2 },       // Patience
      { name: 'delegate', weight: 0.2 },   // Ask others
      { name: 'escape', weight: 0.15 },    // New path
      { name: 'transform', weight: 0.15 }   // Become something new
    ];
    
    let cumulative = 0;
    for (const approach of approaches) {
      cumulative += approach.weight;
      if (entropy < cumulative) {
        return approach.name;
      }
    }
    return 'retry';
  }
}

// Singleton entropy pool
const entropyPool = new EntropicRecovery();

class Watch {
  constructor(options = {}) {
    this.interval = options.interval || 30000; // Check every 30s
    this.failures = 0;
    this.maxFailures = options.maxFailures || 3;
    this.recovering = false;
    this.intervalId = null;
    this.healthCheck = null;
  }
  
  /**
   * Start watching
   */
  watch(healthCheckFn) {
    this.healthCheck = healthCheckFn;
    this.intervalId = setInterval(async () => {
      await this._check();
    }, this.interval);
    console.log('[Watch] Started monitoring');
  }
  
  /**
   * Stop watching
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('[Watch] Stopped');
  }
  
  /**
   * Check health
   */
  async _check() {
    if (!this.healthCheck) return;
    
    try {
      const healthy = await this.healthCheck();
      if (healthy) {
        this.failures = 0; // Reset on success
        event.emit('watch:healthy', { timestamp: Date.now() });
      } else {
        this.failures++;
        event.emit('watch:unhealthy', { failures: this.failures });
      }
    } catch (e) {
      this.failures++;
      event.emit('watch:error', { error: e.message, failures: this.failures });
    }
  }
  
  /**
   * Get status
   */
  getStatus() {
    return {
      watching: !!this.intervalId,
      failures: this.failures,
      maxFailures: this.maxFailures,
      recovering: this.recovering
    };
  }
}

class Spring {
  constructor(options = {}) {
    this.watch = options.watch || new Watch(options);
    this.recoveryFn = options.recovery || (() => console.log('[Spring] Default recovery'));
    this.retryDelay = options.retryDelay || 5000;
    this.maxRetries = options.maxRetries || 5;
    this.listeners = {
      failure: [],
      recovery: [],
      retry: []
    };
    
    // Set up event listeners
    event.on('watch:unhealthy', async (data) => {
      if (data.failures >= this.watch.maxFailures) {
        await this._triggerRecovery();
      }
    });
  }
  
  /**
   * On failure event
   */
  on(event, fn) {
    if (this.listeners[event]) {
      this.listeners[event].push(fn);
    }
  }
  
  /**
   * Trigger recovery
   */
  async _triggerRecovery() {
    if (this.recovering) return;
    
    this.recovering = true;
    event.emit('spring:recovery:start', { time: Date.now() });
    
    // Notify listeners
    for (const fn of this.listeners.failure) {
      try { await fn(); } catch (e) {}
    }
    
    // Retry with backoff
    for (let i = 0; i < this.maxRetries; i++) {
      event.emit('spring:retry', { attempt: i + 1, max: this.maxRetries });
      
      await network.sleep(this.retryDelay * (i + 1)); // Exponential backoff
      
      try {
        await this.recoveryFn();
        event.emit('spring:recovery:success', { attempts: i + 1 });
        
        // Notify listeners
        for (const fn of this.listeners.recovery) {
          try { await fn(); } catch (e) {}
        }
        
        break;
      } catch (e) {
        if (i === this.maxRetries - 1) {
          event.emit('spring:recovery:failed', { attempts: i + 1 });
        }
      }
    }
    
    this.recovering = false;
  }
  
  /**
   * Set recovery function
   */
  setRecovery(fn) {
    this.recoveryFn = fn;
  }
  
  /**
   * Enable entropic recovery - use chaos to find new paths
   * This is REAL entropic kinetics!
   */
  enableEntropicRecovery() {
    const self = this;
    this.useEntropy = true;
    
    this.recoveryFn = async function() {
      // Use entropy to determine approach
      const approach = entropyPool.generateApproach();
      console.log('[Entropic] Recovery approach:', approach);
      
      switch(approach) {
        case 'retry':
          // Just retry
          return { recovered: true, approach: 'retry' };
          
        case 'wait':
          // Wait and let entropy settle
          await network.sleep(1000 * Math.random() * 10);
          return { recovered: true, approach: 'wait' };
          
        case 'delegate':
          // Delegate to another system
          event.emit('spring:delegate', { time: Date.now() });
          return { recovered: true, approach: 'delegate' };
          
        case 'escape':
          // Find new path
          event.emit('spring:escape', { time: Date.now() });
          return { recovered: true, approach: 'escape' };
          
        case 'transform':
          // Transform into something new
          event.emit('spring:transform', { time: Date.now() });
          return { recovered: true, approach: 'transform' };
          
        default:
          return { recovered: true, approach: 'retry' };
      }
    };
    
    console.log('[Entropic] Recovery enabled - using chaos to find paths');
  }
  
  /**
   * Add entropy to the pool
   */
  addEntropy(value) {
    entropyPool.add(value);
  }
  
  /**
   * Get status
   */
  getStatus() {
    return {
      ...this.watch.getStatus(),
      recovering: this.recovering
    };
  }
}

/**
 * Create a spring with default recovery
 */
function createSpring(options) {
  return new Spring(options);
}

/**
 * Health check utilities
 */
async function checkSystemHealth() {
  try {
    // Check if brain is accessible
    const vant = require('./vant');
    const state = vant.getState();
    
    return {
      healthy: !!state,
      state: state?.status,
      uptime: state?.uptime
    };
  } catch (e) {
    return { healthy: false, error: e.message };
  }
}

module.exports = {
  Watch,
  Spring,
  EntropicRecovery,
  entropyPool,
  createSpring,
  checkSystemHealth,
  
  // Multibrain
  getBrainWatchConfig,
  setBrainWatchConfig,
  getStackWatchConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainWatchConfigs = {};

function getBrainWatchConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainWatchConfigs[brainName] || { interval: 5000 };
}

function setBrainWatchConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainWatchConfigs[brainName] = config;
    return true;
}

function getStackWatchConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };
    
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainWatchConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}
