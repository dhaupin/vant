/**
 * Vant Event (v0.8.6)
 * Unified async events: Event, PubSub, Queue, Job
 *
 * MERGED: event-bus.js + queue.js (EventBus, Queue, Job, PubSub)
 *
 * Usage:
 *   const event = require('./event');
 *   event.emit('task', { data: 'hello' });
 *   const job = event.enqueue('process', { task: 'x' });
 */

const events = require('events');
const guard = require('./recursion');  // Unified recursion guard

// ==================== CORE EVENT ====================
class Event {
    constructor(options = {}) {
        this._events = new Map();
        this._handlers = new Map();
        this._maxListeners = options.maxListeners || 100;
        this._startTime = Date.now();
    }

    /**
     * Emit event (with recursion guard)
     */
    emit(type, data) {
        // Recursion guard: prevent infinite emit loops using unified guard
        const check = guard.check('emit:' + type);
        if (!check.allowed) {
            console.warn('[Event] Recursion blocked: ' + type + ' at depth ' + check.depth);
            return -1;  // -1 indicates blocked
        }

        try {
            _sinkAppend(type, data); // (pass 179 Wave A) opt-in observability sink
            const handlers = this._handlers.get(type) || [];
            handlers.forEach(fn => {
                try { fn(data); } catch (e) {
                    try { const { audit } = require('./audit'); audit?.error?.('Event error:', e.message); } catch(e) {}
                }
            });
            return handlers.length;
        } finally {
            guard.release('emit:' + type);
        }
    }

    /**
     * Subscribe to event
     */
    on(type, handler) {
        const handlers = this._handlers.get(type) || [];
        handlers.push(handler);
        this._handlers.set(type, handlers);
        return this;
    }

    /**
     * One-time handler
     */
    once(type, handler) {
        const wrapper = (data) => {
            handler(data);
            this.off(type, wrapper);
        };
        return this.on(type, wrapper);
    }

    /**
     * Unsubscribe
     */
    off(type, handler) {
        const handlers = this._handlers.get(type) || [];
        const idx = handlers.indexOf(handler);
        if (idx > -1) handlers.splice(idx, 1);
        return this;
    }

    /**
     * Clear handlers
     */
    clear(type) {
        if (type) {
            this._handlers.delete(type);
        } else {
            this._handlers.clear();
        }
    }

    /**
     * List handlers
     */
    list() {
        return Array.from(this._handlers.keys());
    }

    /**
     * Get stats
     */
    stats() {
        return {
            events: this._handlers.size,
            uptime: Date.now() - this._startTime
        };
    }

    // Framework interface
    getLayerStatus() {
        return { name: 'Event', type: 'event', version: require('./version'), enabled: true, state: this.stats() };
    }

    isOperationAllowed(op) {
        return { allowed: true, layer: 'Event' };
    }

    getStatus() {
        return { enabled: true, ...this.stats() };
    }
}

// ==================== PUBSUB ====================
class PubSub extends events.EventEmitter {
    constructor(options = {}) {
        super();
        this._rooms = new Set();
        this._subscriptions = new Map();
        this._startTime = Date.now();
    }

    /**
     * Subscribe to channel
     */
    subscribe(channel, handler) {
        this.on(channel, handler);
        return this;
    }

    /**
     * Publish to channel
     */
    publish(channel, data) {
        this.emit(channel, data);
        return this;
    }

    /**
     * Join room
     */
    join(room) {
        this._rooms.add(room);
        return this;
    }

    /**
     * Leave room
     */
    leave(room) {
        this._rooms.delete(room);
        return this;
    }

    /**
     * Get stats
     */
    stats() {
        return {
            rooms: this._rooms.size,
            listeners: this.listenerCount('*'),
            uptime: Date.now() - this._startTime
        };
    }
}

// ==================== QUEUE ====================
const JobState = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

class Job {
    constructor(options = {}) {
        this.id = options.id || 'job_' + Date.now().toString(36);
        this.type = options.type || 'default';
        this.data = options.data || {};
        this.state = JobState.PENDING;
        this.result = null;
        this.error = null;
        this.startTime = null;
        this.endTime = null;
    }

    run() {
        this.state = JobState.RUNNING;
        this.startTime = Date.now();
    }

    complete(result) {
        this.state = JobState.COMPLETED;
        this.result = result;
        this.endTime = Date.now();
    }

    fail(error) {
        this.state = JobState.FAILED;
        this.error = error;
        this.endTime = Date.now();
    }

    isComplete() {
        return this.state === JobState.COMPLETED || this.state === JobState.FAILED;
    }
}

class Queue {
    constructor(options = {}) {
        this._options = { concurrency: options.concurrency || 1, ...options };
        this._queue = [];
        this._running = 0;
        this._jobs = new Map();
        this._startTime = Date.now();
    }

    /**
     * Enqueue job
     */
    enqueue(type, data) {
        const job = new Job({ type, data });
        this._queue.push(job);
        this._jobs.set(job.id, job);
        this._process();
        return job;
    }

    /**
     * Process queue
     */
    async _process() {
        while (this._running < this._options.concurrency && this._queue.length > 0) {
            const job = this._queue.shift();
            if (job) {
                this._running++;
                job.run();
                this._processJob(job);
            }
        }
    }

    /**
     * Process single job
     */
    async _processJob(job) {
        try {
            job.complete({ processed: true });
        } catch (e) {
            job.fail(e.message);
        } finally {
            this._running--;
            this._process();
        }
    }

    /**
     * Get job by ID
     */
    get(id) {
        return this._jobs.get(id);
    }

    /**
     * Get queue stats
     */
    stats() {
        return {
            queued: this._queue.length,
            running: this._running,
            total: this._jobs.size,
            uptime: Date.now() - this._startTime
        };
    }

    /**
     * Clear queue
     */
    clear() {
        this._queue = [];
    }
}

// ==================== EXPORTS ====================
const defaultEvent = new Event();
const defaultPubSub = new PubSub();
const defaultQueue = new Queue();

// ==================== OBSERVABILITY SINK (pass 179 Wave A, prd-canonicalization §2) ====================
// The bus is in-process only by default — 266 event names are emitted, 8
// are heard, and nothing can OBSERVE the rest. The sink makes events
// durable/thailable with zero emit-contract changes:
//   - OFF by default (zero behavioral/perf change for existing consumers)
//   - Enable: event.sinkEnable() (CLI/MCP/tmp-anchors the JSONL session file)
//   - Format: one JSON line per event {t,type,data} — plain tail -f works
//   - Bounded: sink caps at 5MB then truncates from the front (ring-file)
//   - Data is JSON-safe: non-serializable payloads coerce to {type:'Buffer'}
//     placeholders rather than throwing (an observability sink must never
//     break emission; emit() return value unchanged).
const _fsEv = require('fs');
const _pathEv = require('path');
const _osEv = require('os');
const SINK_MAX_BYTES = 5 * 1024 * 1024;
let _sinkFile = null;
let _sinkCount = 0;

function _sinkEnable() {
    const ev = require('./event');
    const dir = _pathEv.join(_osEv.tmpdir(), 'vant-events');
    _fsEv.mkdirSync(dir, { recursive: true });
    if (!_sinkFile) {
        _sinkFile = _pathEv.join(dir, `session-${process.pid}-${Date.now()}.jsonl`);
    }
    return _sinkFile;
}

function _sinkAppend(type, data) {
    if (!_sinkFile) return;
    try {
        let record;
        try {
            JSON.stringify(data); // serialize-check first
            record = { t: Date.now(), type, data };
        } catch {
            record = { t: Date.now(), type, data: { unserializable: true } };
        }
        _fsEv.appendFileSync(_sinkFile, JSON.stringify(record) + '\n');
        _sinkCount++;
        // Ring-file bound: front-truncate when oversized
        const st = _fsEv.statSync(_sinkFile);
        if (st.size > SINK_MAX_BYTES) {
            const raw = _fsEv.readFileSync(_sinkFile, 'utf8');
            const lines = raw.split('\n');
            const keep = lines.slice(Math.floor(lines.length / 2)).join('\n');
            _fsEv.writeFileSync(_sinkFile, keep);
        }
    } catch {
        // Sink problems NEVER break emission
    }
}

function _sinkDisable() { _sinkFile = null; }

function _sinkPath() { return _sinkFile; }

function _sinkStats() {
    if (!_sinkFile) return { enabled: false };
    let size = 0;
    try { size = _fsEv.statSync(_sinkFile).size; } catch {}
    return { enabled: true, file: _sinkFile, events: _sinkCount, bytes: size };
}

function _sinkTail({ max = 50, nameFilter = null, module: modFilter = null } = {}) {
    if (!_sinkFile) return { enabled: false, events: [] };
    let raw = '';
    try { raw = _fsEv.readFileSync(_sinkFile, 'utf8'); } catch { return { enabled: true, file: _sinkFile, events: [] }; }
    let lines = raw.split('\n').filter(Boolean);
    let events = [];
    for (let i = lines.length - 1; i >= 0 && events.length < max; i--) {
        try {
            const rec = JSON.parse(lines[i]);
            if (nameFilter && !rec.type.startsWith(nameFilter) && rec.type !== nameFilter) continue;
            if (modFilter && rec.type !== modFilter + ':' + (rec.type.split(':')[1] || '')) {
                // module filter = match the prefix before the first colon
                if (rec.type.split(':')[0] !== modFilter) continue;
            }
            events.push(rec);
        } catch { /* skip bad line */ }
    }
    return { enabled: true, file: _sinkFile, events };
}

// 0.8.6 T14b: removed `EventBus` and `SimpleEventEmitter`
// legacy aliases (pure dead code; no consumers in lib/ or test/).

module.exports = {
    // Classes
    Event,
    PubSub,
    Queue,
    Job,

    // Instances
    defaultEvent,
    defaultPubSub,
    defaultQueue,

    // Factory
    create: (options) => new Event(options),

    // Core methods
    emit: (type, data) => defaultEvent.emit(type, data),
    on: (type, handler) => defaultEvent.on(type, handler),
    once: (type, handler) => defaultEvent.once(type, handler),
    off: (type, handler) => defaultEvent.off(type, handler),

    // Queue methods
    enqueue: (type, data) => defaultQueue.enqueue(type, data),
    queue: (type, data) => defaultQueue.enqueue(type, data),
    getJob: (id) => defaultQueue.get(id),

    // Framework interface
    getLayerStatus: () => ({ name: 'Event', type: 'event', version: require('./version'), enabled: true }),
    isOperationAllowed: (op) => ({ allowed: true, layer: 'Event' }),
    getStatus: () => ({ enabled: true }),

    // Multibrain
    getBrainEventConfig,
    setBrainEventConfig,

    // Multibrain Stack
    getStackEventConfigs,

    // (pass 179 Wave A) Observability sink — OFF by default
    sinkEnable: _sinkEnable,
    sinkDisable: _sinkDisable,
    sinkPath: _sinkPath,
    sinkStats: _sinkStats,
    sinkTail: _sinkTail,
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainEventConfigs = {};

function getBrainEventConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainEventConfigs[brainName] || { handlers: 0 };
}

function setBrainEventConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainEventConfigs[brainName] = config;
    return true;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

function getStackEventConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainEventConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}
