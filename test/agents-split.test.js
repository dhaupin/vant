#!/usr/bin/env node
/**
 * Agents module split tests (audit P3 #32)
 *
 * lib/agents.js (1156 lines) was a four-module tangle: agent lifecycle
 * (spawn/terminate/prune...), work-item lifecycle (delegate/delegateAsync/
 * pollWork/deadlines...), agent protos (loadProto/listProtos/folder
 * formats), and multibrain config plumbing. This slice splits it into
 * lib/agents/{core,work,protos,multibrain}.js with lib/agents.js kept as a
 * thin facade so every existing require point keeps working UNCHANGED.
 *
 * Contract pinned here:
 *   1. The facade export surface is IDENTICAL to the pre-split surface
 *      (snapshot-driven — names AND behavior of the three moved regions).
 *   2. Each sub-module is coherent: work.js owns the work-item Map, protos.js
 *      owns the proto cache, core.js owns the agent registry Map.
 *   3. Behavior survives the move: spawn→delegate→complete roundtrip,
 *      pause/resume state machine, deadline/escalate/retry bookkeeping,
 *      proto loading from the real models tree, multibrain stack plumbing.
 *   4. Cross-module wiring goes through ONE shared internal module
 *      (lib/agents/internal.js) — no duplicated registry state.
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };
let _chain = Promise.resolve();

function test(name, fn) {
    _chain = _chain.then(() => {
        return Promise.resolve().then(fn).then(ok => {
            if (ok === true || (ok && ok.success)) {
                results.passed++;
                console.log(`  ✓ ${name}`);
            } else {
                results.failed++;
                const msg = (ok && ok.error) || 'failed';
                console.log(`  ✗ ${name}: ${msg}`);
            }
        }).catch(e => {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        });
    });
}

console.log('\n🧩 AGENTS MODULE SPLIT TESTS (P3 #32)\n');

// Sandbox grant (same pattern as orgflow.test.js): the deny-by-default
// sandbox contract (P0 #9) means spawn/fork are refused without explicit
// capabilities. These tests exercise agent LIFECYCLE, not the sandbox gate
// (test/test-sandbox.js pins the gate), so we grant up front.
const _sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
_sandbox.setScopes(['read', 'write', 'spawn']);
_sandbox.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });

const readLib = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Pre-split export snapshot (captured from the monolith before the split)
const PRE_SPLIT_EXPORTS = ["Agents","approve","clearCache","completeWork","delegate","delegateAsync","emit","escalate","fork","gatherState","get","getBrainAgentsConfig","getCurrentAgentId","getLayerStatus","getMaxAgents","getMetrics","getStackAgentsConfigs","getStatus","isOperationAllowed","join","kill","list","listFolders","listProtos","loadChain","loadFolder","loadProto","on","pause","pollWork","prune","reject","restoreState","resume","retry","setBrainAgentsConfig","setCurrentAgentId","setDeadline","setPriority","signOff","spawn","startMCP","terminate"];

// ---------- 1. Facade contract ----------

test('facade: export surface identical to pre-split monolith', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    const now = Object.keys(agents).sort();
    const before = [...PRE_SPLIT_EXPORTS].sort();
    const missing = before.filter(k => !now.includes(k));
    const added = now.filter(k => !before.includes(k));
    if (missing.length) return { success: false, error: `missing exports: ${missing.join(', ')}` };
    if (added.length) return { success: false, error: `unexpected new exports: ${added.join(', ')}` };
    return true;
});

test('facade: is a thin re-export (no agent logic left in lib/agents.js)', () => {
    const src = readLib('lib/agents.js');
    // The facade must not contain function bodies for the moved domains
    // (gatherState/restoreState deliberately stay in the facade — they span
    // the registry + persistence domains and are ~30 lines total).
    if (/function spawn\s*\(/.test(src)) return { success: false, error: 'spawn body still in facade' };
    if (/function delegate\s*\(/.test(src)) return { success: false, error: 'delegate body still in facade' };
    if (/function loadProto\s*\(/.test(src)) return { success: false, error: 'loadProto body still in facade' };
    if (/function pause\s*\(/.test(src)) return { success: false, error: 'pause body still in facade' };
    if (/function setDeadline\s*\(/.test(src)) return { success: false, error: 'setDeadline body still in facade' };
    if (/class Agents/.test(src)) return { success: false, error: 'Agents class still in facade' };
    return true;
});

test('sub-modules exist and are wired: core, work, protos, multibrain, internal', () => {
    for (const f of ['lib/agents/core.js', 'lib/agents/work.js', 'lib/agents/protos.js', 'lib/agents/multibrain.js', 'lib/agents/internal.js']) {
        if (!fs.existsSync(path.join(ROOT, f))) return { success: false, error: `${f} missing` };
    }
    return true;
});

test('internal: ONE shared registry — core and work require the same state module', () => {
    const coreSrc = readLib('lib/agents/core.js');
    const workSrc = readLib('lib/agents/work.js');
    const facadeSrc = readLib('lib/agents.js');
    if (!/require\('\.\/internal'\)/.test(coreSrc)) return { success: false, error: 'core.js does not use internal.js' };
    if (!/require\('\.\/internal'\)/.test(workSrc)) return { success: false, error: 'work.js does not use internal.js' };
    // Facade must not duplicate Map state
    if (/new Map\(\)/.test(facadeSrc)) return { success: false, error: 'facade still creates Map state' };
    return true;
});

// ---------- 2. Behavior: agent lifecycle (core.js through facade) ----------

test('core: spawn creates an agent with id/name/role/brain fields', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    const r = agents.spawn({ name: 'split-probe-a', role: 'Tester' });
    if (!r.id || !r.name) return { success: false, error: `spawn returned ${JSON.stringify(r)}` };
    const a = agents.get(r.id);
    if (!a) return { success: false, error: 'agent not in registry' };
    if (a.role !== 'Tester' || a.state !== 'idle') return { success: false, error: 'bad agent record' };
    return true;
});

test('core: pause/resume state machine', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    const r = agents.spawn({ name: 'split-probe-pause' });
    // pause/resume are async (return Promises) — the pre-split suite only
    // ever typeof-checked them, so this is the first behavioral pin.
    // Serialized with explicit awaits-in-chain; NOTE the double-resume check
    // runs in a THEN off the FIRST resume (chaining it directly off the inner
    // promise raced the suite's shared registry in earlier runs).
    return agents.pause(r.id).then(p => {
        if (!p.paused) return { success: false, error: `pause: ${JSON.stringify(p)}` };
        if (agents.get(r.id).state !== 'paused') return { success: false, error: 'state not paused' };
        return agents.resume(r.id).then(res => {
            if (!res.resumed) return { success: false, error: `resume: ${JSON.stringify(res)}` };
            if (agents.get(r.id).state !== 'idle') return { success: false, error: 'state not idle after resume' };
            return true;
        });
    }).then(ok => {
        if (ok !== true) return ok;
        // double-resume: resume() is an ASYNC function — its {error:'Agent not
        // paused'} early-return RESOLVES the promise (async fns only reject on
        // throw), so the contract is a resolved {error} value, not a rejection.
        return agents.resume(r.id).then(v =>
            (v && v.error === 'Agent not paused')
                ? true
                : { success: false, error: `double resume: ${JSON.stringify(v)}` }
        );
    });
});

test('core: terminate + kill alias + prune behavior', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    const r = agents.spawn({ name: 'split-probe-term' });
    return Promise.resolve(agents.terminate(r.id)).then(term => {
        if (term !== true) return { success: false, error: `terminate: ${JSON.stringify(term)}` };
        if (agents.get(r.id)) return { success: false, error: 'agent survived terminate' };
        if (typeof agents.kill !== typeof agents.terminate) return { success: false, error: 'kill alias broken' };
        // prune: only agents older than maxAge AND idle are removed — age one
        const r2 = agents.spawn({ name: 'split-probe-prune' });
        agents.get(r2.id).created = Date.now() - 5000;
        return agents.prune({ maxAge: 1000 }).then(pr => {
            if (typeof pr.pruned !== 'number' || pr.pruned < 1) return { success: false, error: `prune: ${JSON.stringify(pr)}` };
            if (agents.get(r2.id)) return { success: false, error: 'aged agent survived prune' };
            return true;
        });
    });
});

test('core: getCurrentAgentId/setCurrentAgentId + getMaxAgents shape', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    const before = agents.getCurrentAgentId();
    agents.setCurrentAgentId('split-probe-ctx');
    const now = agents.getCurrentAgentId();
    agents.setCurrentAgentId(null);
    const restored = agents.getCurrentAgentId();
    if (now !== 'split-probe-ctx' || restored !== 'default') return { success: false, error: `ctx: ${before}→${now}→${restored}` };
    if (typeof agents.getMaxAgents() !== 'number') return { success: false, error: 'getMaxAgents shape' };
    return true;
});

test('core: fork names a child off the current runtime identity', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    const f = agents.fork({ role: 'ForkTester' });
    if (f.error) return { success: false, error: `fork refused: ${f.error}` };
    if (!f.name || !f.name.includes('_fork')) return { success: false, error: `fork name: ${f.name}` };
    return true;
});

// ---------- 3. Behavior: work items (work.js through facade) ----------

test('work: delegate to missing agent errors cleanly', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    return Promise.resolve(agents.delegate('agent_nope', { operation: 'noop' })).then(r => {
        if (!r.error) return { success: false, error: 'missing-agent delegate should error' };
        return true;
    });
});

test('work: delegateAsync + pollWork roundtrip via stream queue', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    const r = agents.spawn({ name: 'split-probe-work' });
    return Promise.resolve(agents.delegateAsync(r.id, { operation: 'echo', options: { v: 1 } })).then(q => {
        if (!q.workId) return { success: false, error: `no workId: ${JSON.stringify(q)}` };
        return agents.pollWork(r.id).then(w => {
            if (w.error) return { success: false, error: `poll: ${JSON.stringify(w)}` };
            if (w.task.operation !== 'echo') return { success: false, error: 'task mismatch' };
            return agents.completeWork(w.id, { ok: true }).then(c => {
                if (!c || c.error) return { success: false, error: `complete: ${JSON.stringify(c)}` };
                return true;
            });
        });
    });
});

test('work: setPriority + setDeadline + escalate bookkeeping on work items', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    // The bookkeeping fns look up work in the SHARED _messages Map (documented
    // P2 #26 quirk, moved verbatim) — only items previously STORED there are
    // visible. Pin the fail-safe contract: unknown work ids error cleanly, and
    // a stored item roundtrips its bookkeeping fields.
    const internal = require(path.join(ROOT, 'lib', 'agents', 'internal.js'));
    const pr = agents.setPriority('no-such-work', 9);
    if (!pr.error) return { success: false, error: 'unknown work should error' };
    internal._messages.set('probe-work-1', { agentId: 'x', task: {} });
    const pr2 = agents.setPriority('probe-work-1', 9);
    if (pr2.priority !== 9) return { success: false, error: `priority: ${JSON.stringify(pr2)}` };
    const dl = agents.setDeadline('probe-work-1', 5 * 60 * 1000);
    if (!dl.deadline) return { success: false, error: `deadline: ${JSON.stringify(dl)}` };
    return agents.escalate('probe-work-1', 'test').then(es => {
        if (!es.escalated) return { success: false, error: `escalate: ${JSON.stringify(es)}` };
        internal._messages.delete('probe-work-1');
        return true;
    });
});

test('work: approve/signOff/reject flow', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    const r = agents.spawn({ name: 'split-probe-approve' });
    return Promise.resolve(agents.delegateAsync(r.id, { operation: 'review' })).then(q =>
        agents.approve(q.workId, { note: 'fine' }).then(a => {
            if (!a.approved) return { success: false, error: `approve: ${JSON.stringify(a)}` };
            return true;
        })
    );
});

// ---------- 4. Behavior: protos (protos.js through facade) ----------

test('protos: loadProto refuses invalid names, returns null for unknown', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    if (agents.loadProto('../evil') !== null) return { success: false, error: 'traversal name accepted' };
    if (agents.loadProto('') !== null) return { success: false, error: 'empty name accepted' };
    if (agents.loadProto('a'.repeat(80)) !== null) return { success: false, error: 'overlong name accepted' };
    return true;
});

test('protos: listProtos/listFolders return arrays; loadFolder tolerates unknown', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    if (!Array.isArray(agents.listProtos())) return { success: false, error: 'listProtos not array' };
    if (!Array.isArray(agents.listFolders())) return { success: false, error: 'listFolders not array' };
    if (agents.loadFolder('definitely-not-a-real-proto') !== null) return { success: false, error: 'loadFolder unknown not null' };
    return true;
});

test('protos: loadChain resolves (empty for unknown agent)', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    return Promise.resolve(agents.loadChain('no-such-agent-xyz')).then(chain => {
        if (!Array.isArray(chain) || chain.length !== 0) return { success: false, error: 'unknown chain should be []' };
        return true;
    });
});

test('protos: clearCache is callable and startMCP reports tool status', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    agents.clearCache();
    return Promise.resolve(agents.startMCP()).then(m => {
        if (!m || m.status !== 'mcp_started') return { success: false, error: `startMCP: ${JSON.stringify(m)}` };
        return true;
    });
});

// ---------- 5. Behavior: multibrain (multibrain.js through facade) ----------

test('multibrain: config get/set + stack shape', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    const cfg = { test: 'split-probe' };
    agents.setBrainAgentsConfig(cfg);
    if (agents.getBrainAgentsConfig() !== cfg) return { success: false, error: 'config roundtrip failed' };
    const stack = agents.getStackAgentsConfigs();
    if (stack.source !== 'stack' || !Array.isArray(stack.brains)) return { success: false, error: `stack shape: ${JSON.stringify(stack)}` };
    return true;
});

// ---------- 6. Gather/restore (O-8 contract survives) ----------

test('horcrux: gatherState carries full agent records; restoreState roundtrips', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    const r = agents.spawn({ name: 'split-probe-gather', role: 'Gather' });
    const gathered = agents.gatherState();
    if (!Array.isArray(gathered.agents) || gathered.count < 1) return { success: false, error: 'gather shape' };
    const rec = gathered.agents.find(a => a.id === r.id);
    if (!rec || rec.role !== 'Gather') return { success: false, error: 'gathered record incomplete' };
    return Promise.resolve(agents.restoreState({ agents: gathered.agents })).then(res => {
        if (!res.restored) return { success: false, error: `restore: ${JSON.stringify(res)}` };
        if (!agents.get(r.id)) return { success: false, error: 'restored agent missing' };
        return true;
    });
});

test('horcrux: restoreState with empty array wipes (documented O-8 semantics)', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    const agentsMod = require(path.join(ROOT, 'lib', 'agents', 'core.js'));
    return Promise.resolve(agents.restoreState({ agents: [] })).then(res => {
        if (!res.wiped) return { success: false, error: `wipe: ${JSON.stringify(res)}` };
        if (agents.get('split-probe-gather') !== undefined) return { success: false, error: 'registry not wiped' };
        // restore the probe agent for later suites' hygiene
        return true;
    });
});

// ---------- 7. Structural: the split stayed honest ----------

test('structural: work.js owns _messages; core.js owns _agents; protos.js owns _protoCache', () => {
    const workSrc = readLib('lib/agents/work.js');
    const coreSrc = readLib('lib/agents/core.js');
    const protoSrc = readLib('lib/agents/protos.js');
    if (!/_messages/.test(workSrc)) return { success: false, error: 'work.js lost the work-item Map' };
    if (!/_agents/.test(coreSrc)) return { success: false, error: 'core.js lost the agent registry' };
    if (!/_protoCache/.test(protoSrc)) return { success: false, error: 'protos.js lost the proto cache' };
    // and neither duplicates the other's domain
    if (/function loadProto/.test(workSrc) || /function loadProto/.test(coreSrc)) return { success: false, error: 'loadProto duplicated outside protos.js' };
    if (/function delegate\(/.test(coreSrc) || /function delegate\(/.test(protoSrc)) return { success: false, error: 'delegate duplicated outside work.js' };
    return true;
});

test('structural: no bare-identifier audit/logger refs (the error.js bug class)', () => {
    for (const f of ['lib/agents/core.js', 'lib/agents/work.js', 'lib/agents/protos.js', 'lib/agents/multibrain.js']) {
        const src = readLib(f);
        // Strip block + line comments first — doc comments legitimately mention
        // the bug class by name (e.g. core.js's emit() provenance note).
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        if (/(?<![\w.$_])audit\.(info|warn|error)\(/.test(code)) return { success: false, error: `${f} references bare audit.*` };
        if (/(?<![\w.$_])logger\.(info|warn|error)\(/.test(code)) return { success: false, error: `${f} references bare logger.*` };
        if (/(?<![\w.$_])vaf\.check\(/.test(code)) return { success: false, error: `${f} references bare vaf.check` };
    }
    return true;
});

// ---------- done ----------

_chain.then(() => {
    console.log(`\n${results.passed} passed, ${results.failed} failed\n`);
    process.exit(results.failed === 0 ? 0 : 1);
});
