/**
 * Cron (v0.8.6)
 * Task scheduling - fires on triggers/events
 * WITH EVENT EMISSIONS - job lifecycle emits globally
 * Includes: schedule, run, JobWorker
 */

// Local event emitter already exists - we need to bridge to global event system
const EventEmitter = require('events');
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
            
            // EVENT: job:started (global)
            _emit('job:started', { name: job.name, payload: job.payload, timestamp: Date.now() });

            try {
                await job.handler(job.payload);
                job.status = 'completed';
                this.emit('job:completed', job);
                
                // EVENT: job:completed (global)
                _emit('job:completed', { name: job.name, timestamp: Date.now() });
            } catch (e) {
                job.status = 'failed';
                job.error = e.message;
                this.emit('job:failed', job);
                
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
        throw new errors.Error('Rate limit exceeded for task scheduling', { code: errors.CODES.RATE_LIMIT_EXCEEDED, retryable: true });
    }
    
    // Validate interval (if provided)
    if (interval !== undefined) {
        if (typeof interval !== 'number' || interval < 1000 || interval > 86400000) {
            throw new errors.Error('interval must be 1000-86400000ms (1 day max)', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
        }
    }
    
    if (!id || !handler) {
        throw new errors.Error('id and handler required', { code: errors.CODES.VAF_INPUT_INVALID, retryable: false });
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
    
    // EVENT: task:scheduled (global)
    _emit('task:scheduled', { id, interval, timestamp: Date.now() });
    
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
    
    // EVENT: task:running (global)
    _emit('task:running', { id, runs: task.runs + 1, timestamp: Date.now() });
    
    try {
        const result = task.handler();
        task.runs++;
        task.nextRun = Date.now();
        _scheduler.emit('run', { id, result });
        
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
                    const vec = await embed.embed(text);
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
    scheduleEmbed,    // NEW: schedule vectorization
    once: _scheduler.once.bind(_scheduler),
    off: _scheduler.off.bind(_scheduler),
    JobWorker,
    getLayerStatus: () => ({ name: 'Cron', type: 'scheduler', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, tasks: _tasks.size })
};
