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

const encrypt = require('./encrypt');

// (Wave A stage 2, pass 193) Private EventEmitter base RETIRED: spark /
// start / stop now ride the shared bus (`nature:spark` / `nature:start` /
// `nature:stop`); chaos arrives via wireSharedBus() listening for
// `habitat:chaos`. The instance .on() surface had exactly two consumers
// (vant.js spark→dream, backup.js spark→heat backup) — both migrated.
class Nature {
    constructor(options = {}) {

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
     * Wire to habitat - listen for chaos events.
     *
     * (Wave A stage 2, pass 193) The canonical path: habitat.feed() emits
     * `habitat:chaos` on the SHARED bus (lib/event.js); this delegates to
     * wireSharedBus(). A habitat argument is obsolete — the coupling used
     * to be instance-to-instance; now the bus is the only channel.
     */
    wire(_habitat) {
        return this.wireSharedBus();
    }

    /**
     * Wire to the SHARED bus — the canonical chaos path since habitat.feed()
     * emits `habitat:chaos` there (Wave A stage 2). Safe to call multiple
     * times; returns this so it composes with vant.js boot wiring.
     */
    wireSharedBus() {
        let bus = null;
        try { bus = require('./event'); } catch (e) { return this; }
        if (!bus || this._busWired) return this;
        bus.on('habitat:chaos', (event) => {
            this.accumulate(event.chaos || 1);
        });
        this._busWired = true;
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
        // (Wave 3, #189/R4 — gate completes the census) Same Category H gate
        // as habitat.js feedCosmicEntropy()/getMobileEntropy(): the cosmic
        // fetcher is only reachable when the operator turns entropy.cosmic
        // ON in brain config. Default is OFF — the spark tunnel rides
        // crypto.randomBytes instead, never the network-ish fetcher nobody
        // asked for. habitat.js:503,1176 and nature.js:100 were the exact
        // callers the wave named; this is the third and last one to gate.
        const _config = (() => { try { return require('./config'); } catch (e) { return null; } })();
        if (!_config || !_config.get('entropy.cosmic')) {
            return this.accumulate(0.5); // local-randomness chaos, no fetch
        }
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
        const sparkPayload = {
            momentum: this.flywheel.get(),
            sessions: this.sessions,
            totalChaos: this.totalChaos,
            timestamp: this.lastSpark
        };
        // (Wave A stage 2, pass 193) The private 'spark' instance emit is
        // RETIRED: spark rides ONLY the shared bus as `nature:spark` —
        // emergent-consciousness events are exactly the kind the
        // observability sink exists to see. Live consumers migrated to the
        // bus: vant.js (spark→dream) and backup.js (spark→entropy backup).
        try { require('./event').emit('nature:spark', sparkPayload); } catch (e) { /* bus never blocks */ }
    }

    /**
     * Run the nature (background)
     */
    start() {
        this.running = true;
        try { require('./event').emit('nature:start', { threshold: this.threshold, timestamp: Date.now() }); } catch (e) {}
        return this;
    }

    /**
     * (Wave A stage 2, pass 193) Module helper: construct a Nature wired to
     * the shared bus — the canonical construction path vant.js/boot use.
     */
    static sharedBusWired(options) {
        const inst = new Nature(options);
        inst.wireSharedBus();
        return inst;
    }

    /**
     * Stop the nature
     */
    stop() {
        this.running = false;
        try { require('./event').emit('nature:stop', { timestamp: Date.now() }); } catch (e) {}
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
            // (pass 85) workspace: null - the flywheel is process-global
            // state; it must not fragment into per-workspace memory rows.
            await this.persistence.state('_flywheel', state, { ttl: 100 * 365 * 24 * 60 * 60 * 1000, workspace: null }); // 100 years
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
                // (pass 85) workspace: null - see state() above.
                const state = await this.persistence.recall('_flywheel', { workspace: null });
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
