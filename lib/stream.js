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
let _escrow = null;

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

function _getEscrow() {
    if (!_escrow) {
        try { _escrow = require('./escrow'); } catch (e) {}
    }
    return _escrow;
}

// In-memory cache (brain-synced)
const _queues = new Map();
const _work = new Map();
const _leases = new Map();  // Lease tracking: workId → { agent, expires }
const _watchers = new Map();  // Event listeners

// ==================== LEASE ====================
// Prevent flooded queues - release stuck work after timeout

function lease(workId, agentId, ttlMs = 60000) {
    _leases.set(workId, { agentId, expires: Date.now() + ttlMs });
}

function release(workId) {
    const l = _leases.get(workId);
    _leases.delete(workId);
    return l;
}

function checkLease(workId) {
    const l = _leases.get(workId);
    if (!l) return null;
    if (Date.now() > l.expires) {
        _leases.delete(workId);
        return { stale: true, agentId: l.agentId };
    }
    return l;
}

// Clean expired leases periodically (async)
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [workId, l] of _leases) {
            if (now > l.expires) {
                const queue = _queues.get(l.agentId);
                if (queue) queue.push({ id: workId, status: 'pending', error: 'lease_expired' });
                _leases.delete(workId);
            }
        }
    }, 10000).unref();
}

// Pipeline: sandbox → vaf → qos → escrow → method handler
async function _gate(operation, streamName, data = {}) {
    const sb = _getSandbox();
    const v = _getVaf();
    const q = _getQoS();
    const esc = _getEscrow();
    
    // 1. Sandbox capability check
    if (sb?.can) {
        const canOp = { enqueue: 'canWrite', poll: 'canRead', complete: 'canWrite', fail: 'canWrite' };
        const cap = canOp[operation] || 'canRead';
        const allowed = await sb.can(cap, { stream: streamName, operation });
        // Handle both: true or { allowed: true, reason: '...' }
        if (allowed === false || (allowed?.allowed === false)) {
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
    
    // 4. Escrow operation approval
    if (esc?.needsApproval) {
        if (esc.needsApproval(operation)) {
            // Force approval for high-value ops (complete, fail)
            if (operation === 'complete' || operation === 'fail') {
                const approved = await esc.approveOperation(operation, data);
                if (!approved?.approved) {
                    return { error: 'escrow_pending', approvalId: approved?.approvalId };
                }
            }
        }
        // Check quota per stream
        const quota = await esc.checkQuota(streamName, operation);
        if (!quota?.allowed) {
            return { error: 'quota_exceeded', limit: quota?.limit };
        }
    }
    
    return { allowed: true };
}

// ==================== EVENTS / WATCHERS ====================
// Stream state change listeners

function watch(event, callback) {
    if (!_watchers.has(event)) {
        _watchers.set(event, new Set());
    }
    _watchers.get(event).add(callback);
}

function unwatch(event, callback) {
    const ws = _watchers.get(event);
    if (ws) ws.delete(callback);
}

function emit(event, data) {
    const ws = _watchers.get(event);
    if (ws) {
        for (const cb of ws) cb(data);
    }
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
    const id = 'w_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
    
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
        // brain.write(category, key, content)
        await brain.write('stream', streamName, JSON.stringify(queue));
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

// ==================== CREATE ====================

async function create(streamName, options = {}) {
    if (_queues.has(streamName)) {
        return { error: 'Stream exists: ' + streamName };
    }
    _queues.set(streamName, []);
    emit('created', { stream: streamName, options });
    return { stream: streamName, created: true };
}

// ==================== DELETE ====================

async function deleteStream(streamName) {
    const q = _queues.get(streamName);
    if (!q) {
        return { error: 'Stream not found: ' + streamName };
    }
    _queues.delete(streamName);
    _work.delete(streamName);
    await brain.write('stream', streamName, null);  // clear brain
    emit('deleted', { stream: streamName });
    return { stream: streamName, deleted: true };
}

function remove(workId) {
    const q = _queues.get(workId);
    if (q) q.splice(q.findIndex(w => w.id === workId), 1);
    _work.delete(workId);
}

// ==================== PEEK ====================

function peek(streamName) {
    const queue = _queues.get(streamName) || [];
    return queue.find(w => w.status === 'pending') || null;
}

// ==================== STATS ====================

function stats() {
    const streams = {};
    for (const [name, queue] of _queues) {
        streams[name] = {
            total: queue.length,
            pending: queue.filter(w => w.status === 'pending').length,
            working: queue.filter(w => w.status === 'working').length,
            completed: queue.filter(w => w.status === 'completed').length,
            failed: queue.filter(w => w.status === 'failed').length
        };
    }
    return {
        streams,
        leases: _leases.size,
        watchers: _watchers.size
    };
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
    load,
    // new exports
    create,
    deleteStream,
    peek,
    stats,
    lease,
    release,
    checkLease,
    watch,
    unwatch,
    emit
};
