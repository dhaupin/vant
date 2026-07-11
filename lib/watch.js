/**
 * Watch - Self-Healing & Recovery System
 * 
 * Monitors system health and bounces back when things fail.
 * The "spring" that catches the system when it falls.
 * 
 * Concept:
 * - Watch: Monitor health, detect failures
 * - Spring: Bounce back, retry, recover
 * 
 * Usage:
 *   const watch = require('./watch');
 *   const spring = new watch.Spring();
 *   spring.on('failure', async () => await recover());
 *   spring.watch(() => checkHealth());
 */

const event = require('./event');
const network = require('./network');

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
  createSpring,
  checkSystemHealth
};
