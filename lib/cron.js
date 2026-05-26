/**
 * Cron (v0.8.6)
 * Task scheduling - fires on triggers/events
 * Includes: schedule, run, JobWorker
 */

const EventEmitter = require('events');
const vaf = require('./vaf');
const qos = require('./qos');

const _scheduler = new EventEmitter();
const _tasks = new Map();

// QoS rate limiter for task scheduling (max 100 tasks/minute)
const _rateLimit = new qos.RateLimiter({ windowMs: 60000, max: 100 });

// ==================== JOB WORKER ====================
/**
 * JobWorker - Background job processing with queue
 */
class JobWorker extends EventEmitter {
    constructor(options = {}) {
        super();
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

            try {
                await job.handler(job.payload);
                job.status = 'completed';
                this.emit('job:completed', job);
            } catch (e) {
                job.status = 'failed';
                job.error = e.message;
                this.emit('job:failed', job);
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

    isOperationAllowed(op) {
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
        throw new Error('Rate limit exceeded for task scheduling');
    }
    
    // Validate interval (if provided)
    if (interval !== undefined) {
        if (typeof interval !== 'number' || interval < 1000 || interval > 86400000) {
            throw new Error('interval must be 1000-86400000ms (1 day max)');
        }
    }
    
    if (!id || !handler) {
        throw new Error('id and handler required');
    }
    
    const task = {
        id,
        interval,
        handler,
        schedule: interval ? setInterval(handler, interval) : null,
        nextRun: Date.now() + (interval || 0),
        runs: 0,
        enabled: true
    };
    
    _tasks.set(id, task);
    return { id, scheduled: !!task.schedule };
}

/**
 * Cancel task
 */
function cancel(id) {
    const task = _tasks.get(id);
    if (!task) return false;
    if (task.schedule) clearInterval(task.schedule);
    _tasks.delete(id);
    return true;
}

/**
 * Run task now
 */
function run(id) {
    const task = _tasks.get(id);
    if (!task || !task.enabled) return { error: 'Task not found or disabled' };
    
    try {
        const result = task.handler();
        task.runs++;
        task.nextRun = Date.now();
        _scheduler.emit('run', { id, result });
        return { id, result, runs: task.runs };
    } catch (e) {
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
 * Events
 */
function on(event, handler) { _scheduler.on(event, handler); }
function emit(event, data) { _scheduler.emit(event, data); }

/**
 * Clean up
 */
function stop() {
    for (const [id] of _tasks) cancel(id);
}

module.exports = {
    schedule, cancel, run, status, list, enable, on, emit, stop,
    scheduleCompute,  // NEW: schedule compute code intervals
    once: _scheduler.once.bind(_scheduler),
    off: _scheduler.off.bind(_scheduler),
    JobWorker,
    getLayerStatus: () => ({ name: 'Cron', type: 'scheduler', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, tasks: _tasks.size })
};
