/**
 * Cron (v0.8.6)
 * Task scheduling - fires on triggers/events
 * WITH EVENT EMISSIONS - job lifecycle emits globally
 * Includes: schedule, run, JobWorker
 */

// (Wave A stage 2, pass 193) Private EventEmitter retired: the module
// `_scheduler` emitter (and its on/emit/once/off surface) is GONE — every
// task-lifecycle event rides ONLY the shared bus via _emit() above. The
// module's on/emit exports previously bridged this private emitter; they
// now flow to the shared bus instead (same signatures, one emitter).
const vaf = require('./vaf');
const qos = require('./qos');
const errors = require('./error');

// ==================== GLOBAL EVENT BRIDGE ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

const _tasks = new Map();

// QoS rate limiter for task scheduling (max 100 tasks/minute)
const _rateLimit = new qos.RateLimiter({ windowMs: 60000, max: 100 });

// ==================== JOB WORKER ====================
/**
 * JobWorker - Background job processing with queue
 */
class JobWorker {
    constructor(options = {}) {
        this.options = {
            concurrency: options.concurrency || 1,
            ...options
        };
        this._jobs = [];
        this._running = 0;
        this._startTime = Date.now();
    }

    /**
     * Add job to queue
     */
    add(name, handler, payload = {}) {
        this._jobs.push({ name, handler, payload, status: 'pending', addedAt: Date.now() });
        this._process();
        return this;
    }

    /**
     * Process jobs
     */
    async _process() {
        while (this._running < this.options.concurrency && this._jobs.some(j => j.status === 'pending')) {
            const job = this._jobs.find(j => j.status === 'pending');
            if (!job) break;

            job.status = 'running';
            this._running++;

            // EVENT: job:started (global)
            _emit('job:started', { name: job.name, payload: job.payload, timestamp: Date.now() });

            try {
                await job.handler(job.payload);
                job.status = 'completed';
                // EVENT: job:completed (global)
                _emit('job:completed', { name: job.name, payload: job.payload, timestamp: Date.now() });
            } catch (e) {
                job.status = 'failed';
                job.error = e.message;
                // EVENT: job:failed (global)
                _emit('job:failed', { name: job.name, error: e.message, timestamp: Date.now() });
            }

            this._running--;
        }
    }

    /**
     * Get job stats
     */
    stats() {
        return {
            total: this._jobs.length,
            pending: this._jobs.filter(j => j.status === 'pending').length,
            running: this._running,
            completed: this._jobs.filter(j => j.status === 'completed').length,
            failed: this._jobs.filter(j => j.status === 'failed').length,
            uptime: Date.now() - this._startTime
        };
    }

    getLayerStatus() {
        return { name: 'JobWorker', type: 'cron', enabled: true, state: this.stats() };
    }

    isOperationAllowed(_op) {
        return { allowed: true, layer: 'JobWorker' };
    }
}

/**
 * Schedule task
 */
function schedule(options = {}) {
    const { id, interval, handler } = options;

    // VAF validation
    vaf.check(id, { name: 'task id', minLength: 1, maxLength: 100 });

    // QoS rate limiting
    if (!_rateLimit.check(id)) {
        throw new errors.VantError('Rate limit exceeded for task scheduling', { code: errors.CODES.RATE_LIMIT_EXCEEDED, retryable: true });
    }

    // Validate interval (if provided)
    if (interval !== undefined) {
        if (typeof interval !== 'number' || interval < 1000 || interval > 86400000) {
            throw new errors.VantError('interval must be 1000-86400000ms (1 day max)', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
        }
    }

    if (!id || !handler) {
        throw new errors.VantError('id and handler required', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
    }

    // 0.8.6: timers registered with boot's lifecycle (was bare setInterval)
    const _bootMod = (() => { try { return require('./boot'); } catch (e) { return null; } })();
    let schedule = null;
    if (interval) {
        const timerName = 'cron.' + id;
        if (_bootMod && _bootMod.registerTimer) {
            _bootMod.registerTimer(timerName, handler, interval);
            schedule = timerName; // marker; real handle lives in boot registry
        } else {
            schedule = setInterval(handler, interval);
        }
    }

    const task = {
        id,
        interval,
        handler,
        schedule,
        nextRun: Date.now() + (interval || 0),
        runs: 0,
        enabled: true
    };

    _tasks.set(id, task);

    // EVENT: task:scheduled (global)
    _emit('task:scheduled', { id, interval, timestamp: Date.now() });

    return { id, scheduled: !!task.schedule };
}

/**
 * (R4-F1, #194) add(spec, cmd) — the CLI verb bin/cron.js advertised.
 * Accepts interval-style specs only (the lib's own grammar: "60s", "10m",
 * "2h", or a plain ms integer). Cron expressions are still NOT parsed
 * (operations/cron.md is the contract; bin/clean.js's local parseCronToMs
 * bounds its common fixed patterns the same way). The command string runs
 * through child_process per fire.
 */
function add(spec, cmd) {
    vaf.check(spec, { name: 'cron spec', type: 'string', minLength: 1, maxLength: 40 });
    vaf.check(cmd, { name: 'cron command', type: 'string', minLength: 1, maxLength: 400 });
    const ms = _specToMs(spec);
    if (!ms) {
        throw new errors.VantError(
            'cron spec must be an interval: "<N>s", "<N>m", "<N>h", or ms integer (cron expressions are not parsed — see docs/operations/cron.md)',
            { code: errors.CODES.VAF_INPUT_INVALID, retryable: false }
        );
    }
    const id = 'cli.' + cmd.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40).toLowerCase() + '.' + Date.now().toString(36);
    const { execFileSync } = require('child_process');
    return schedule({ id, interval: ms, handler: () => {
        try {
            const out = execFileSync(cmd.split(' ')[0], cmd.split(' ').slice(1).filter(Boolean), { encoding: 'utf8', timeout: 60000 });
            return { out: String(out).slice(0, 400) };
        } catch (e) {
            return { error: e.message.slice(0, 200) };
        }
    }});
}

/** Interval-spec resolver for add(): returns ms or null. */
function _specToMs(spec) {
    const s = String(spec).trim();
    const m = s.match(/^(\d+)([smh])$/);
    if (m) {
        const n = parseInt(m[1], 10);
        if (n < 1) return null;
        return m[2] === 's' ? n * 1000 : m[2] === 'm' ? n * 60000 : n * 3600000;
    }
    if (/^\d+$/.test(s)) {
        const n = parseInt(s, 10);
        return n >= 1000 && n <= 86400000 ? n : null;
    }
    return null;
}

/** (R4-F1) remove(id) — the CLI verb bin/cron.js advertised. */
function remove(id) {
    vaf.check(id, { name: 'cron task id', type: 'string', minLength: 1, maxLength: 100 });
    const existed = cancel(id);
    _emit('task:removed', { id, existed, timestamp: Date.now() });
    return existed;
}

/**
 * Cancel task
 */
function cancel(id) {
    const task = _tasks.get(id);
    if (!task) return false;
    if (task.schedule) {
        // 0.8.6: schedule may be a boot-registry timer name (string)
        if (typeof task.schedule === 'string') {
            const _bootMod = (() => { try { return require('./boot'); } catch (e) { return null; } })();
            if (_bootMod && _bootMod.unregisterTimer) _bootMod.unregisterTimer(task.schedule);
        } else {
            clearInterval(task.schedule);
        }
    }
    _tasks.delete(id);
    return true;
}

/**
 * Run task now
 */
function run(id) {
    const task = _tasks.get(id);
    if (!task || !task.enabled) return { error: 'Task not found or disabled' };

    // EVENT: task:running (global)
    _emit('task:running', { id, runs: task.runs + 1, timestamp: Date.now() });

    try {
        const result = task.handler();
        task.runs++;
        task.nextRun = Date.now();
        // EVENT: task:run (ONE وجه emitter — the private _scheduler is retired)
        _emit('task:run', { id, result });

        // EVENT: task:completed (global)
        _emit('task:completed', { id, runs: task.runs, timestamp: Date.now() });

        return { id, result, runs: task.runs };
    } catch (e) {
        // EVENT: task:failed (global)
        _emit('task:failed', { id, error: e.message, timestamp: Date.now() });

        return { id, error: e.message };
    }
}

/**
 * Get task status
 */
function status(id) {
    const task = _tasks.get(id);
    if (!task) return null;
    return { id, enabled: task.enabled, runs: task.runs, nextRun: task.nextRun, interval: task.interval };
}

/**
 * List tasks
 */
function list() {
    return Array.from(_tasks.values()).map(t => ({ id: t.id, enabled: t.enabled, runs: t.runs }));
}

/**
 * Enable/disable
 */
function enable(id, value = true) {
    const task = _tasks.get(id);
    if (!task) return false;
    task.enabled = value;
    return true;
}

/**
 * NEW: Schedule compute code to run on interval
 * Uses compute.js polyglot FFI for execution
 * Security: Goes through QOS + sandbox checks
 *
 * Usage:
 *   cron.scheduleCompute('add-stats', 'stats += 1', { interval: 60000 })
 *   cron.scheduleCompute('ping-service', 'curl -s https://api.example.com/ping', { interval: 300000, lang: 'bash' })
 */
function scheduleCompute(id, code, options = {}) {
    const { interval = 60000, lang = 'node', enabled = true } = options;

    // Wrap code with compute execution
    const wrappedHandler = async () => {
        const compute = require('./compute');
        try {
            return await compute.eval(code, { lang });
        } catch (e) {
            return { error: e.message };
        }
    };

    // schedule() uses destructured options!
    return schedule({ id, handler: wrappedHandler, interval, enabled });
}

/**
 * NEW: Schedule embed tasks to run on interval
 * Useful for batch vectorizing cache on schedules
 *
 * Usage:
 *   cron.scheduleEmbed('vectorize-cache', { interval: 300000 })
 */
function scheduleEmbed(id, options = {}) {
    const { interval = 60000, enabled = true } = options;

    const wrappedHandler = async () => {
        const embed = require('./embed');
        const storage = require('./storage');

        try {
            // Vectorize recent storage entries
            const recent = await storage.recent?.(100) || [];
            const results = [];
            for (const item of recent) {
                const text = item?.content || item?.title || '';
                if (text) {
                                        await embed.generate(text);
                    results.push({ id: item.id, vectorized: true });
                }
            }
            return { vectorized: results.length };
        } catch (e) {
            return { error: e.message };
        }
    };

    return schedule({ id, handler: wrappedHandler, interval, enabled });
}

/**
 * Events
 */
function on(event, handler) { _eventLocal().on(event, handler); }
function emit(event, data) { _eventLocal().emit(event, data); }

function _eventLocal() {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return { on() {}, emit() {}, once() {}, off() {} }; }
    }
    return _event;
}

/**
 * Clean up
 */
function stop() {
    for (const [id] of _tasks) cancel(id);
}

module.exports = {
    schedule, cancel, run, status, list, enable, on, emit, stop,
    add, remove,  // (R4-F1, #194) the CLI-verb pair bin/cron.js calls
    scheduleCompute,  // NEW: schedule compute code intervals
    scheduleEmbed,    // NEW: schedule vectorization
    once: (event, handler) => _eventLocal().once(event, handler),
    off: (event, handler) => _eventLocal().off(event, handler),
    JobWorker,
    getLayerStatus: () => ({ name: 'Cron', type: 'scheduler', version: require('./version'), enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, tasks: _tasks.size }),

    // Multibrain Stack
    getStackCronJobs,

    // Context Heartbeat
    startContextHeartbeat,
    stopContextHeartbeat,
    gatherState,
    restoreState,
};

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get cron jobs from all brains in the stack
 * @returns {Object} Combined cron jobs
 */
function getStackCronJobs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const jobs = list();
            results.byBrain[brainName] = { jobs: jobs || [] };
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

// ==================== CONTEXT HEARTBEAT ====================

/**
 * Start context heartbeat (keep prompt cache warm)
 * @param {Object} opts - Options
 * @param {number} opts.interval - Interval in ms (default: 4 min)
 * @returns {Object} Scheduled task
 */
function startContextHeartbeat(opts = {}) {
    const interval = opts.interval || (4 * 60 * 1000); // 4 min default

    const handler = async () => {
        try {
            const context = require('./context');
            await context.ping();
            _emit('context:heartbeat', { timestamp: Date.now() });
        } catch (e) {
            _emit('context:error', { error: e.message });
        }
    };

    return schedule({
        id: 'context-heartbeat',
        handler,
        interval,
        enabled: true
    });
}

/**
 * Stop context heartbeat
 * @returns {Object} Result
 */
function stopContextHeartbeat() {
    const task = _tasks.get('context-heartbeat');
    if (task?.schedule) {
        // 0.8.6: schedule may be a boot-registry timer name (string)
        if (typeof task.schedule === 'string') {
            const _bootMod = (() => { try { return require('./boot'); } catch (e) { return null; } })();
            if (_bootMod && _bootMod.unregisterTimer) _bootMod.unregisterTimer(task.schedule);
        } else {
            clearInterval(task.schedule);
        }
        _tasks.delete('context-heartbeat');
        _emit('context:heartbeat:stopped', { timestamp: Date.now() });
    }
    return { stopped: true };
}

// ==================== HORCRUX GATHER/RESTORE ====================
function gatherState() {
    return {
        jobs: _tasks ? Array.from(_tasks.entries()) : [],
        count: _tasks ? _tasks.size : 0,
        gatheredAt: Date.now()
    };
}
function restoreState(data) {
    if (data && data.jobs && _tasks) {
        _tasks.clear();
        data.jobs.forEach(([k,v]) => _tasks.set(k,v));
    }
    return { restored: true, jobs: _tasks ? _tasks.size : 0 };
}
