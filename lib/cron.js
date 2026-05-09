/**
 * Cron (v0.8.6)
 * Task scheduling - fires on triggers/events
 */

const EventEmitter = require('events');
const vaf = require('./vaf');
const qos = require('./qos');

const _scheduler = new EventEmitter();
const _tasks = new Map();

// QoS rate limiter for task scheduling (max 100 tasks/minute)
const _rateLimit = new qos.RateLimiter({ windowMs: 60000, max: 100 });

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
    once: _scheduler.once.bind(_scheduler),
    off: _scheduler.off.bind(_scheduler),
    getLayerStatus: () => ({ name: 'Cron', type: 'scheduler', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, tasks: _tasks.size })
};
