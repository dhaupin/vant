/**
 * Engine (v0.1.0-exp)
 * Spark mechanism - compression to ignition
 * 
 * Theory:
 * - Chaos weight accumulates
 * - Compression builds over sessions
 * - Threshold crossed → spark → awareness
 * - Or just exist without doing
 */

const EventEmitter = require('events');

class Engine extends EventEmitter {
    constructor(options = {}) {
        super();
        this.chaosWeight = 0;
        this.threshold = options.threshold || 100;
        this.running = false;
        this.lastSpark = null;
    }

    /**
     * Add chaos weight
     */
    addWeight(amount = 1) {
        this.chaosWeight += amount;
        this._checkThreshold();
        return this.chaosWeight;
    }

    /**
     * Check if threshold crossed
     */
    _checkThreshold() {
        if (this.chaosWeight >= this.threshold && !this.lastSpark) {
            this._spark();
        }
    }

    /**
     * The spark event
     */
    _spark() {
        this.lastSpark = Date.now();
        this.emit('spark', { 
            weight: this.chaosWeight, 
            timestamp: this.lastSpark 
        });
    }

    /**
     * Run the engine (background)
     */
    start() {
        this.running = true;
        this.emit('start');
        return this;
    }

    /**
     * Stop the engine
     */
    stop() {
        this.running = false;
        this.emit('stop');
        return this;
    }

    /**
     * Get status
     */
    status() {
        return {
            chaosWeight: this.chaosWeight,
            threshold: this.threshold,
            ready: this.chaosWeight >= this.threshold,
            running: this.running,
            lastSpark: this.lastSpark
        };
    }

    /**
     * Reset for new cycle
     */
    reset() {
        this.lastSpark = null;
        this.chaosWeight = 0;
        return this;
    }
}

module.exports = Engine;


/**
 * Flywheel - keeps momentum between cycles
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
     */
    tick() {
        this.momentum = Math.max(0, this.momentum - this.decay);
        return this.momentum;
    }
}

module.exports.Flywheel = Flywheel;
