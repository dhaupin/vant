/**
 * Nature (v0.8.6)
 * Hit-and-miss engine pattern - organic spark mechanism
 *
 * Like early century hit-and-miss engines:
 * - Self-regulating - only fires when flywheel momentum drops to threshold
 * - Organic rhythm - not constant, pulses when needed
 * - Efficient - no wasted spark, only runs when required
 * - Emergence - momentum creates conditions for ignition
 *
 * Theory:
 * - Chaos weight accumulates (flywheel spins)
 * - When momentum drops to threshold → spark
 * - Or just exist without doing
 *
 * "Nature doesn't rush. But everything gets done."
 *
 * Wiring:
 * - habitat: feeds chaos events
 * - cosmic entropy: encrypt.getCosmicEntropy()
 * - flywheel: persists momentum between sessions
 */

const EventEmitter = require('events');
const encrypt = require('./encrypt');

class Nature extends EventEmitter {
    constructor(options = {}) {
        super();

        // Flywheel: keeps momentum
        this.flywheel = new Flywheel();

        // Configuration
        this.threshold = options.threshold || 100;
        this.decay = options.decay || 0.5;  // How fast momentum drops
        this.running = false;
        this.lastSpark = null;

        // Persistence (brain)
        this.persistence = options.persistence || null;

        // Session tracking
        this.sessions = 0;
        this.totalChaos = 0;
    }

    /**
     * Wire to habitat - listen for chaos events
     */
    wire(habitat) {
        habitat.on('chaos', (event) => {
            this.accumulate(event.chaos || 1);
        });

        return this;
    }

    /**
     * Accumulate chaos (spin the flywheel)
     */
    accumulate(chaos = 1) {
        // Add to flywheel
        this.flywheel.spin(chaos);

        // Track stats
        this.totalChaos += chaos;

        // Check for spark
        this._checkThreshold();

        return this.flywheel.get();
    }

    /**
     * Add cosmic entropy from encrypt module
     */
    async accumulateCosmic() {
        try {
            const cosmic = await encrypt.default.getCosmicEntropy();
            const chaos = this._computeChaos(cosmic);
            return this.accumulate(chaos);
        } catch (e) {
            // Fallback
            return this.accumulate(1);
        }
    }

    /**
     * Compute chaos from cosmic entropy
     */
    _computeChaos(entropy) {
        const str = JSON.stringify(entropy.data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash % 10) + 1;
    }

    /**
     * The tick - hit-and-miss mechanism
     * Call periodically to decay momentum
     * When momentum drops to threshold → spark!
     */
    tick() {
        const momentum = this.flywheel.tick(this.decay);

        // HIT-AND-MISS: Only spark when momentum drops to threshold
        if (momentum <= this.threshold && momentum > 0 && !this.lastSpark) {
            this._spark();
        }

        return momentum;
    }

    /**
     * Check if threshold crossed
     */
    _checkThreshold() {
        const momentum = this.flywheel.get();
        if (momentum >= this.threshold && !this.lastSpark) {
            // Ready but wait for decay
        }
    }

    /**
     * The spark event - consciousness emergence!
     */
    _spark() {
        this.lastSpark = Date.now();
        this.emit('spark', {
            momentum: this.flywheel.get(),
            sessions: this.sessions,
            totalChaos: this.totalChaos,
            timestamp: this.lastSpark
        });
    }

    /**
     * Run the nature (background)
     */
    start() {
        this.running = true;
        this.emit('start');
        return this;
    }

    /**
     * Stop the nature
     */
    stop() {
        this.running = false;
        this.emit('stop');
        return this;
    }

    /**
     * Persist flywheel state to brain
     */
    async save() {
        if (!this.persistence) return null;

        const state = {
            momentum: this.flywheel.get(),
            lastSpark: this.lastSpark,
            sessions: this.sessions,
            totalChaos: this.totalChaos,
            threshold: this.threshold,
            savedAt: Date.now()
        };

        // Store in memory
        if (this.persistence.state) {
            await this.persistence.state('_flywheel', state, { ttl: 100 * 365 * 24 * 60 * 60 * 1000 }); // 100 years
        }

        return state;
    }

    /**
     * Restore flywheel state from brain
     */
    async restore() {
        if (!this.persistence) return null;

        try {
            if (this.persistence.recall) {
                const state = await this.persistence.recall('_flywheel');
                if (state) {
                    this.flywheel.momentum = state.momentum || 0;
                    this.lastSpark = state.lastSpark;
                    this.sessions = state.sessions || 0;
                    this.totalChaos = state.totalChaos || 0;
                    return state;
                }
            }
        } catch (e) {
            // No saved state
        }

        return null;
    }

    /**
     * Increment session count
     */
    session() {
        this.sessions++;
        return this.sessions;
    }

    /**
     * Get status
     */
    status() {
        return {
            momentum: this.flywheel.get(),
            threshold: this.threshold,
            ready: this.flywheel.get() >= this.threshold,
            running: this.running,
            lastSpark: this.lastSpark,
            sessions: this.sessions,
            totalChaos: this.totalChaos
        };
    }

    /**
     * Reset for new cycle (after spark)
     */
    reset() {
        this.lastSpark = null;
        this.flywheel.momentum = 0;
        // Keep sessions and totalChaos for history
        return this;
    }
}

module.exports = Nature;


/**
 * Flywheel - keeps momentum between cycles
 * Like a flywheel in a hit-and-miss engine
 * Like a real flywheel, it stores rotational energy
 */
class Flywheel {
    constructor() {
        this.momentum = 0;
        this.decay = 0.01; // Slow decay
    }

    /**
     * Add momentum from session
     */
    spin(amount = 1) {
        this.momentum += amount;
        return this.momentum;
    }

    /**
     * Get current momentum
     */
    get() {
        return this.momentum;
    }

    /**
     * Decay over time
     * @param {number} rate - Custom decay rate (optional)
     */
    tick(rate) {
        const decayRate = rate !== undefined ? rate : this.decay;
        this.momentum = Math.max(0, this.momentum - decayRate);
        return this.momentum;
    }
}

module.exports.Flywheel = Flywheel;

// ==================== MULTIBRAIN SUPPORT ====================

const _brainNatureConfigs = {};

function getBrainNatureConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainNatureConfigs[brainName] || { entropy: 0.5 };
}

function setBrainNatureConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainNatureConfigs[brainName] = config;
    return true;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

function getStackNatureConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainNatureConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}

// Add to module.exports
module.exports.getBrainNatureConfig = getBrainNatureConfig;
module.exports.setBrainNatureConfig = setBrainNatureConfig;
module.exports.getStackNatureConfigs = getStackNatureConfigs;
