/**
 * Vant Stream Module
 * 
 * Async work queue with brain persistence for agent delegation
 * Protected by sandbox, vaf, qos pipeline like brain
 * 
 * Usage:
 *   const stream = require('./stream');
 *   stream.enqueue('agent_name', task);
 *   stream.poll('agent_name');
 *   stream.complete(id, result);
 */

const brain = require('./brain');

// Lazy load security components
let _sandbox = null;
let _vaf = null;
let _qos = null;

function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

function _getVaf() {
    if (!_vaf) {
        try { _vaf = require('./vaf'); } catch (e) {}
    }
    return _vaf;
}

function _getQoS() {
    if (!_qos) {
        try { _qos = require('./qos'); } catch (e) {}
    }
    return _qos;
}

// In-memory cache (brain-synced)
const _queues = new Map();
const _work = new Map();

// Pipeline: sandbox → vaf → qos → method handler
async function _gate(operation, streamName, data = {}) {
    const sb = _getSandbox();
    const v = _getVaf();
    const q = _getQoS();
    
    // 1. Sandbox capability check
    if (sb?.can) {
        const canOp = { enqueue: 'canWrite', poll: 'canRead', complete: 'canExecute', fail: 'canExecute' };
        const cap = canOp[operation] || 'canRead';
        const allowed = await sb.can(cap, { stream: streamName, operation });
        if (!allowed?.allowed) {
            return { error: allowed?.reason || 'sandbox_denied', capability: cap };
        }
    }
    
    // 2. VAF input validation
    if (v?.validate) {
        const valid = await v.validate(operation, data);
        if (!valid?.valid) {
            return { error: valid?.reason || 'validation_failed', details: valid };
        }
    }
    
    // 3. QoS rate limiting
    if (q?.check) {
        const limited = await q.check('stream', { stream: streamName });
        if (!limited?.allowed) {
            return { error: 'rate_limited', retryAfter: limited?.retryAfter };
        }
    }
    
    return { allowed: true };
}

// ==================== ENQUEUE ====================

async function enqueue(streamName, task) {
    // Gate: sandbox → vaf → qos
    const gated = await _gate('enqueue', streamName, { task });
    if (gated?.error) {
        return gated;
    }
    
    // Get or create stream
    if (!_queues.has(streamName)) {
        _queues.set(streamName, []);
    }
    
    const queue = _queues.get(streamName);
    const id = 'w_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    
    const workItem = {
        id,
        stream: streamName,
        task,           // The task payload
        status: 'pending',
        created: Date.now(),
        started: null,
        completed: null,
        result: null
    };
    
    queue.push(workItem);
    _work.set(id, workItem);
    
    // Persist to brain
    await _persist(streamName);
    
    return { id, stream: streamName, status: 'pending' };
}

// ==================== POLL ====================

async function poll(streamName, options = {}) {
    // Gate: sandbox → vaf → qos
    const gated = await _gate('poll', streamName);
    if (gated?.error) {
        return gated;
    }
    
    const { timeout = 0 } = options;  // 0 = blocking, ms = wait
    
    const queue = _queues.get(streamName) || [];
    
    // Find pending work
    for (const item of queue) {
        if (item.status === 'pending') {
            item.status = 'working';
            item.started = Date.now();
            _work.set(item.id, item);
            await _persist(streamName);
            return item;
        }
    }
    
    // No work available
    return null;
}

// ==================== COMPLETE ====================

async function complete(workId, result) {
    // Gate: sandbox → vaf → qos
    const item = _work.get(workId);
    const gated = await _gate('complete', item?.stream || 'unknown', { workId, result });
    if (gated?.error) {
        return gated;
    }
    
    // (item already retrieved above)
    if (!item) {
        return { error: 'Work not found: ' + workId };
    }
    
    item.status = 'completed';
    item.completed = Date.now();
    item.result = result;
    
    // Persist
    await _persist(item.stream);
    
    return { id: workId, status: 'completed', result };
}

// ==================== FAIL ====================

async function fail(workId, error) {
    // Gate: sandbox → vaf → qos
    const item = _work.get(workId);
    const gated = await _gate('fail', item?.stream || 'unknown', { workId, error });
    if (gated?.error) {
        return gated;
    }
    
    if (!item) {
        return { error: 'Work not found: ' + workId };
    }
    
    item.status = 'failed';
    item.completed = Date.now();
    item.error = error;
    
    await _persist(item.stream);
    
    return { id: workId, status: 'failed', error };
}

// ==================== LIST ====================

function list(streamName, options = {}) {
    const { status = null } = options;
    
    const queue = _queues.get(streamName) || [];
    
    if (status) {
        return queue.filter(q => q.status === status);
    }
    return queue;
}

// ==================== INFO ====================

function info(streamName) {
    const queue = _queues.get(streamName) || [];
    
    return {
        stream: streamName,
        total: queue.length,
        pending: queue.filter(q => q.status === 'pending').length,
        working: queue.filter(q => q.status === 'working').length,
        completed: queue.filter(q => q.status === 'completed').length,
        failed: queue.filter(q => q.status === 'failed').length
    };
}

// ==================== PERSIST ====================

async function _persist(streamName) {
    // Save stream state to brain for durability
    const queue = _queues.get(streamName);
    if (queue) {
        brain.writeBrain(`stream_${streamName}`, JSON.stringify(queue));
    }
}

// ==================== LOAD ====================

async function load(streamName) {
    try {
        const b = await brain.loadBrain(`stream_${streamName}`);
        if (b?.content) {
            const queue = JSON.parse(b.content);
            _queues.set(streamName, queue);
            
            // Rebuild work index
            for (const item of queue) {
                _work.set(item.id, item);
            }
        }
    } catch (e) {
        // First time - no stream yet
    }
}

// ==================== INIT ====================

async function init() {
    // Load all streams from brain
    const corpus = brain.loadCorpus();
    for (const b of corpus) {
        if (b.name.startsWith('stream_')) {
            const streamName = b.name.replace('stream_', '');
            await load(streamName);
        }
    }
}

// Exports
module.exports = {
    init,
    enqueue,
    poll,
    complete,
    fail,
    list,
    info,
    load
};
