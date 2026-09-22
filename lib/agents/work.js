/**
 * Vant Agents — work-item lifecycle (P3 #32 split)
 *
 * Delegation + work tracking: delegate (sync, recursion-guarded, pipeline-
 * executed), the async stream queue (delegateAsync/pollWork/completeWork),
 * delegator sign-off (approve/reject/signOff), and work-item bookkeeping
 * (setDeadline/retry/escalate/setPriority). Bodies moved VERBATIM from the
 * agents.js monolith (requires deepened one level).
 *
 * Known quirk preserved by design: work items live in the SHARED _messages
 * Map (same Map carries event listeners + conversation buffers). That is the
 * documented P2 #26 finding — fail-safe in practice, zero external callers;
 * de-multiplexing was deliberately out of the split's scope so this commit
 * stays a pure move. Note delegateAsync returns `workId: result.id` (stream
 * id) while setDeadline/retry/escalate/setPriority look their items up in
 * _messages — the stream.complete() roundtrip is what actually updates those
 * records; the Map lookups only hit for work created through paths that
 * stored one. Not changed here (verbatim move); flagged for a future work-item
 * ownership slice.
 */

const internal = require('./internal');

const runtime = require('../vant');
const stream = require('../stream');
const guard = require('../recursion');  // Unified recursion guard
const pipeline = require('../pipeline');

const { _agents, _messages, _emit } = internal;

/**
 * Delegate task to agent
 */
async function delegate(agentId, task) {
    const agent = _agents.get(agentId);
    if (!agent) {
        return { error: 'Agent not found: ' + agentId };
    }

    // SECURITY: Check delegation depth using unified recursion guard
    const depthCheck = guard.check('delegate:' + agentId);
    if (!depthCheck.allowed) {
        _emit('agent:delegate:blocked', { agentId, depth: depthCheck.depth, max: depthCheck.max });
        return { error: 'Delegation depth exceeded', code: 'E_DELEGATE_DEPTH', depth: depthCheck.depth, max: depthCheck.max };
    }

    // SECURITY: Check team permissions if teams enabled
    if (agent.team) {
        try {
            const teams = require('../teams');
            // Map operation to permission
            const permMap = {
                'brainSave': 'canWrite',
                'brainLoad': 'canRead',
                'brainDelete': 'canDelete',
                'execute': 'canExecute',
                'deploy': 'canDeploy'
            };
            const requiredPerm = permMap[task.operation];
            if (requiredPerm && !teams.can(agentId, requiredPerm)) {
                guard.release('delegate:' + agentId);
                return { error: 'Permission denied', code: 'E_TEAM_PERM', required: requiredPerm };
            }
        } catch (e) { /* teams not available */ }
    }

    agent.state = 'working';
    agent.task = task;

    // SECURITY: Run through unified pipeline
    const isWrite = task.operation === 'act' || (task.mcp?.tool &&
        (task.mcp.tool.startsWith('brain_save') || task.mcp.tool.startsWith('storage_write')));
    const mode = isWrite ? pipeline.PRIVATE : pipeline.PUBLIC;

    // EVENT: delegating
    _emit('agent:delegating', { agentId, task: task.operation || 'mcp', timestamp: Date.now() });

    // Execute in agent context through pipeline
    let result;
    try {
        result = await pipeline.run(
            { name: 'agents:execute', task, mode: isWrite ? 'write' : 'read' },
            async () => {
                if (task.mcp?.tool && agent.mcp) {
                    return await agent.mcp.execute(task.mcp.tool, task.mcp.args || {});
                } else {
                    return await runtime.act(task.operation, task.options);
                }
            },
            { mode }
        );
    } finally {
        // Release delegation depth using unified guard
        guard.release('delegate:' + agentId);
    }

    agent.state = 'idle';

    // EVENT: delegated
    _emit('agent:delegated', { agentId, task: task.operation || 'mcp', timestamp: Date.now() });

    // Trust: Record successful delegation (positive interaction)
    const trust = internal._getTrust();
    if (trust && trust.record) {
        trust.record(agentId, 'delegate', {
            positive: true,
            value: 0.02,
            note: `Completed: ${task.operation || 'mcp'}`
        });
    }

    return { agentId, result };
}

/**
 * Delegate task to async queue (non-blocking)
 */
async function delegateAsync(agentId, task) {
    const agent = _agents.get(agentId);
    if (!agent) {
        return { error: 'Agent not found: ' + agentId };
    }

    // Enqueue to agent's stream
    const result = await stream.enqueue(agentId, {
        ...task,
        delegatedBy: agent?.name || 'unknown'
    });

    // (P3 #35 find, pre-existing in the monolith) stream.enqueue runs the
    // sandbox→vaf→qos gate and returns {error:'sandbox_denied', capability}
    // on refusal — the monolith IGNORED that shape and reported status:'queued'
    // with workId:undefined anyway, so denied work silently vanished while the
    // caller believed it was queued. Propagate the gate verdict.
    if (result?.error) {
        agent.state = 'idle';
        return { agentId, error: result.error, capability: result.capability, code: 'E_GATE_DENIED' };
    }

    // Update agent state
    agent.state = 'delegated';

    return {
        agentId,
        workId: result.id,
        status: 'queued'
    };
}

/**
 * Poll agent's queue for work
 */
async function pollWork(agentId) {
    const work = await stream.poll(agentId);
    if (work) {
        const agent = _agents.get(agentId);
        if (agent) {
            agent.state = 'working';
            agent.task = work.task;
        }
        return work;
    }
    // Return error object instead of undefined
    return { error: 'No work in queue', code: 'E_NO_WORK' };
}

/**
 * Complete delegated work
 */
async function completeWork(workId, result) {
    const workItem = await stream.complete(workId, result);

    // Update agent state
    if (workItem?.stream) {
        const agent = _agents.get(workItem.stream);
        if (agent) {
            agent.state = 'idle';
            agent.task = null;
        }
    }

    return workItem;
}

/**
 * Approve work result (delegator sign-off)
 * @param {string} workId - Work ID to approve
 * @param {object} feedback - Optional feedback
 */
async function approve(workId, feedback = {}) {
    const workItem = await stream.complete(workId, {
        status: 'approved',
        approvedAt: Date.now(),
        approvedBy: runtime.getState().id,
        feedback
    });

    // Mark agent as idle again
    if (workItem?.stream) {
        const agent = _agents.get(workItem.stream);
        if (agent) {
            agent.state = 'approved';
        }
    }

    return { approved: true, workId, feedback };
}

/**
 * Reject work result (delegator sign-off)
 * @param {string} workId - Work ID to reject
 * @param {string} reason - Rejection reason
 */
async function reject(workId, reason) {
    const workItem = await stream.complete(workId, {
        status: 'rejected',
        rejectedAt: Date.now(),
        rejectedBy: runtime.getState().id,
        reason
    });

    // Return to working state
    if (workItem?.stream) {
        const agent = _agents.get(workItem.stream);
        if (agent) {
            agent.state = 'rejected';
            agent.feedback = reason;
        }
    }

    return { rejected: true, workId, reason };
}

/**
 * Sign-off on work (delegator approval)
 * @param {string} workId - Work ID
 * @param {boolean} approved - true=approve, false=reject
 * @param {object} notes - Notes/feedback
 */
async function signOff(workId, approved = true, notes = {}) {
    if (approved) {
        return approve(workId, notes);
    } else {
        return reject(workId, notes.reason || 'Rejected by delegator');
    }
}

/**
 * Set deadline on work (auto-timeout)
 */
function setDeadline(workId, ms, onTimeout = 'fail') {
    const workItem = _messages.get(workId);
    if (!workItem) return { error: 'Work not found' };

    const deadline = Date.now() + ms;
    workItem.deadline = deadline;
    workItem.onTimeout = onTimeout;

    // Schedule auto-handle
    setTimeout(async () => {
        if (onTimeout === 'fail') {
            await reject(workId, 'Deadline exceeded');
        } else if (onTimeout === 'escalate') {
            await escalate(workId, 'deadline exceeded');
        }
    }, ms);

    return { deadline, workId };
}

/**
 * Retry failed work
 */
async function retry(workId, options = {}) {
    const { maxRetries = 3, delay = 1000 } = options;

    const workItem = _messages.get(workId);
    if (!workItem) return { error: 'Work not found' };

    const retries = (workItem.retries || 0) + 1;
    if (retries > maxRetries) {
        return { error: 'Max retries exceeded' };
    }

    workItem.retries = retries;
    workItem.retryAt = Date.now() + delay;

    // Queue retry
    setTimeout(async () => {
        workItem.state = 'retrying';
        // Re-delegate to same agent
        if (workItem.agentId) {
            await delegate(workItem.agentId, workItem.task);
        }
    }, delay);

    return { retried: true, workId, retries, maxRetries };
}

/**
 * Escalate to human (notify)
 */
async function escalate(workId, reason) {
    const workItem = _messages.get(workId);
    if (!workItem) return { error: 'Work not found' };

    workItem.escalated = true;
    workItem.escalatedAt = Date.now();
    workItem.escalationReason = reason;

    // Notify via msg system
    try {
        const msg = require('../msg');
        msg.send('@human', {
            type: 'escalation',
            workId,
            reason,
            agentId: runtime.getState().id,
            timestamp: Date.now()
        });
    } catch (e) {
        console.log('[agents] Escalation notification failed:', e.message);
    }

    return { escalated: true, workId, reason };
}

/**
 * Set priority on work (1-10, 10=highest)
 */
function setPriority(workId, priority = 5) {
    const workItem = _messages.get(workId);
    if (!workItem) return { error: 'Work not found' };

    workItem.priority = Math.min(10, Math.max(1, priority));
    return { priority: workItem.priority, workId };
}

module.exports = {
    delegate,
    delegateAsync,
    pollWork,
    completeWork,
    approve,
    reject,
    signOff,
    setDeadline,
    retry,
    escalate,
    setPriority
};
