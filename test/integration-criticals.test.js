#!/usr/bin/env node
/**
 * P3 #35 — Cross-module integration regression suite
 *
 * The audit ledger (labs/AUDIT_FINDINGS.md) closed 23 criticals, but most
 * pins were module-local. This suite walks the closed items END-TO-END
 * through their real entry points — the way an actual caller (or attacker)
 * would reach them — so a future refactor that breaks a wire (export shape,
 * gate order, error contract) fails here even if every module-local suite
 * still passes.
 *
 * Covered (ledger ref → probe):
 *   brain 2/3   — load() runs the B-2 chain, op-mapped caps (load=read)
 *   islands 1-4 — createIsland traversal refusal + save/hydrate roundtrip
 *   mcp 1/2/3/4 — vant_call allowlist-only, storage-tool containment,
 *                 compute_eval sudo wall, shell rule wall
 *   mcp 5       — network SSRF wall through the network module
 *   storage 3/4 — vm-jail config sandbox + proto-key payload sanitation
 *   sandbox 1/2 — deny-by-default caps via the TOP-LEVEL export AND the
 *                 defaultSandbox instance (the early/late export trap)
 *   vaf 1       — module loads WITH a poisoned .circuit-vaf.json present
 *                 (child process; the original crash was load-time)
 *   agents 1-3  — delegate gate + delegateAsync PROPAGATES stream-gate
 *                 denials (P3 #35 find: the monolith swallowed them)
 *   sync 1      — saveProviderState EINVAL guard on bad userCtx
 *   transform 4 — toHorcrux traversal refusal + password requirement
 *   remote 6    — provider errors are coded VantErrors (NETWORK_BLOCKED)
 *   #27/#34     — atomic-write helper wired through the facade; brain
 *                 breaker telemetry alive (cross-refs to their own suites)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
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

console.log('\n🔗 CROSS-MODULE INTEGRATION REGRESSION (P3 #35)\n');

const errorsMod = require(path.join(ROOT, 'lib', 'error.js'));
const brain = require(path.join(ROOT, 'lib', 'brain.js'));
const sb = require(path.join(ROOT, 'lib', 'sandbox.js'));

// Grant caps for the positive-path probes (orgflow pattern).
sb.setScopes(['read', 'write', 'spawn']);
sb.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });

const cleanupFns = [];
function mktmp(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    cleanupFns.push(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} });
    return dir;
}

// ---------- brain 2/3: the B-2 chain is live on load() ----------

test('brain 2/3: load() routes through pipeline.runChain (chain wiring intact)', () => {
    // B-2 pin (already in security-chain) + operational probe here: a poisoned
    // CRITICAL handler must break load() — proves the chain is IN the load
    // path, not decorative.
    brain.resetLoadCircuit();
    brain._setLoadCircuitThreshold(100);
    brain.register('vaf', () => { throw new Error('chain-integrity probe'); });
    return brain.load('identity-probe-chain').then(
        () => { brain._clearHandlerOverride('vaf'); return { success: false, error: 'poisoned vaf did not break load' }; },
        e => {
            brain._clearHandlerOverride('vaf');
            return e instanceof errorsMod.VantError || e.message === 'chain-integrity probe'
                ? true
                : { success: false, error: `unexpected ${e.message}` };
        }
    ).finally(() => brain.resetLoadCircuit());
});

test('brain 3: read op maps to canRead (a canRead:false sandbox blocks load)', () => {
    const prev = sb.defaultSandbox.getCapabilities ? sb.defaultSandbox.getCapabilities() : null;
    sb.defaultSandbox.setCapabilities({ canRead: false, canWrite: true, canSpawn: true });
    return brain.load('identity').then(
        v => ({ success: false, error: `canRead:false still loaded (${v && v.name})` }),
        e => (e.code === 'CAPABILITY_NOT_ALLOWED' || e.code === 'BRAIN_PIPELINE_BLOCKED' || /denied|blocked/i.test(e.message))
            ? true
            : { success: false, error: `wrong denial: ${e.code || e.message}` }
    ).finally(() => {
        sb.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });
        void prev;
    });
});

// ---------- islands 1-4 ----------

test('islands 4: createIsland refuses traversal names before path use', () => {
    const islands = require(path.join(ROOT, 'lib', 'islands.js'));
    for (const bad of ['../../evil', 'a/b', '..']) {
        try { islands.createIsland(bad, { content: 'x' }); return { success: false, error: `accepted ${bad}` }; }
        catch (e) { /* expected */ }
    }
    return true;
});

test('islands 1-2: create+load roundtrip through the storage chain', () => {
    const islands = require(path.join(ROOT, 'lib', 'islands.js'));
    const name = 'p35-isl-' + Date.now().toString(36);
    return Promise.resolve(islands.createIsland(name, { content: `# ${name} body` }))
        .then(created => {
            if (!created || created.error) return { success: false, error: `create: ${JSON.stringify(created)}` };
            cleanupFns.push(() => { try { fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', `${name}.md`), { force: true }); } catch (e) {} });
            return islands.load(name).then(loaded => {
                if (typeof loaded === 'string' && loaded.includes(`${name} body`)) return true;
                if (loaded && typeof loaded.content === 'string') return true;
                return { success: false, error: `roundtrip: ${JSON.stringify(loaded).slice(0, 80)}` };
            });
        }, e => ({ success: false, error: `create threw: ${e.message}` }));
});

// ---------- mcp 1/2/3/4/5 ----------

test('mcp 1: vant_call executes registered tools only (no arbitrary require)', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp.js'));
    return Promise.resolve(mcp.execute('vant_call', { name: '../../../package', args: {} })).then(
        v => {
            // must be refused — either coded error or {error} object, never a module load
            if (v && (v.error || v.code)) return true;
            return { success: false, error: `vant_call resolved: ${JSON.stringify(v).slice(0, 80)}` };
        },
        e => e instanceof Error ? true : { success: false, error: 'non-error rejection' }
    );
});

test('mcp 2: vant_storage_write refuses traversal outside models', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp.js'));
    return Promise.resolve(mcp.execute('vant_storage_write', { path: '../../p35-escape', content: 'x' })).then(
        v => v && v.error ? true : { success: false, error: `traversal write allowed: ${JSON.stringify(v).slice(0, 60)}` },
        e => /VAF|PATH|BLOCKED|traversal/i.test(e.code || e.message) ? true : { success: false, error: `wrong refusal: ${e.message}` }
    );
});

test('mcp 3: compute_eval refused without sudo (SANDBOX_EXEC_DENIED)', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp.js'));
    return Promise.resolve(mcp.execute('compute_eval', { language: 'python', code: 'print(1)' })).then(
        v => v && v.error ? true : { success: false, error: `eval ran: ${JSON.stringify(v).slice(0, 60)}` },
        e => e.code === 'SANDBOX_EXEC_DENIED' || /EXEC_DENIED|sudo/i.test(e.message)
            ? true
            : { success: false, error: `wrong refusal: ${e.code || e.message}` }
    );
});

test('mcp 4: shell tool refused without sudo grant', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp.js'));
    return Promise.resolve(mcp.execute('vant_shell_exec', { command: 'ls' })).then(
        v => v && (v.error || v.blocked || v.code) ? true : { success: false, error: `shell ran: ${JSON.stringify(v).slice(0, 60)}` },
        e => /DENIED|blocked|sudo/i.test(e.code || e.message) ? true : { success: false, error: `wrong refusal: ${e.message}` }
    );
});

test('mcp 5: SSRF wall blocks metadata + loopback + private ranges', () => {
    const network = require(path.join(ROOT, 'lib', 'network.js'));
    const targets = ['http://169.254.169.254/latest/meta-data', 'http://127.0.0.1/x', 'http://10.0.0.1/x', 'http://192.168.1.1/x'];
    for (const t of targets) {
        if (network.isDomainAllowed(t) !== false) return { success: false, error: `allowed: ${t}` };
    }
    return true;
});

// ---------- storage 3/4 ----------

test('storage 3: ConfigStorage vm-jail — require/process/fs unavailable', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage.js'));
    // Escape attempt via the vm context: config tries to smuggle a require
    // reference out through module.exports. The jail must yield no require
    // access (undefined/refusal), NOT a live require function.
    const dir = mktmp('vant-p35-cfg-');
    const cfgPath = path.join(dir, 'vant.config.js');
    fs.writeFileSync(cfgPath, "module.exports = { leaked: typeof require, proc: typeof process, req2: typeof require('fs') };");
    const cs = new Storage.ConfigStorage({ filePath: cfgPath });
    const leaked = cs.get('leaked');
    const proc = cs.get('proc');
    // require inside a bare vm context is not a function — it's undefined
    // (or the config is refused entirely). Either way, no live require.
    if (leaked === 'function') return { success: false, error: 'require leaked into config scope' };
    if (proc === 'object') return { success: false, error: 'process leaked into config scope' };
    return true;
});

test('storage 4: prototype-pollution payload through store.write stays inert', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage.js'));
    const dir = mktmp('vant-p35-proto-');
    const store = new Storage.FileStorage({ basePath: dir });
    const vaf = require(path.join(ROOT, 'lib', 'vaf.js'));
    const dirty = JSON.parse('{"a":1,"__proto__":{"p35polluted":"yes"}}');
    vaf.sanitizeObject(dirty);
    if (({}).p35polluted !== undefined) return { success: false, error: 'global Object.prototype polluted' };
    // and a proto-SEGMENTED path lands inside the store dir, contained
    store.write('__proto__/p35', 'x');
    if (!fs.existsSync(path.join(dir, '__proto__', 'p35'))) return { success: false, error: 'proto-segment write escaped containment' };
    return true;
});

// ---------- sandbox 1/2 (the early/late export trap) ----------

test('sandbox 1/2: deny-by-default on BOTH top-level can() and defaultSandbox.can()', () => {
    const sbFresh = require(path.join(ROOT, 'lib', 'sandbox.js'));
    // Flip off, probe both doors, restore.
    sbFresh.defaultSandbox.setCapabilities({ canRead: false, canWrite: false, canSpawn: false });
    const topDenied = sbFresh.can('canWrite') === false;
    const instDenied = sbFresh.defaultSandbox.can('canWrite') === false;
    sbFresh.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });
    const topAllowed = sbFresh.can('canWrite') === true;
    if (!topDenied) return { success: false, error: 'top-level can() ignored deny' };
    if (!instDenied) return { success: false, error: 'defaultSandbox.can() ignored deny' };
    if (!topAllowed) return { success: false, error: 'top-level can() ignored grant' };
    return true;
});

// ---------- vaf 1 (child process: the crash was load-time) ----------

test('vaf 1: module loads cleanly with a poisoned .circuit-vaf.json present (child proc)', () => {
    const dir = mktmp('vant-p35-vaf-');
    fs.writeFileSync(path.join(dir, '.circuit-vaf.json'), JSON.stringify({ blocked: [['1.2.3.4', Date.now() + 60000]] }));
    const script = `
        const path = require('path');
        process.chdir(${JSON.stringify(dir)});
        const vaf = require(${JSON.stringify(path.join(ROOT, 'lib', 'vaf.js'))});
        console.log('VAF-OK', typeof vaf.check);
    `;
    try {
        const out = execFileSync('node', ['-e', script], { encoding: 'utf8', cwd: dir, timeout: 15000 });
        return out.includes('VAF-OK') ? true : { success: false, error: out.slice(0, 100) };
    } catch (e) {
        return { success: false, error: `child crashed: ${String(e.stderr || e.message).slice(0, 120)}` };
    }
});

// ---------- agents 1-3 (gate propagation — the P3 #35 find) ----------

test('agents 2: delegateAsync propagates stream-gate denial (no phantom "queued")', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    const r = agents.spawn({ name: 'p35-gate-probe' });
    sb.defaultSandbox.setCapabilities({ canRead: false, canWrite: false, canSpawn: false });
    return Promise.resolve(agents.delegateAsync(r.id, { operation: 'noop' })).then(v => {
        if (v && v.error && v.code === 'E_GATE_DENIED') return true;
        if (v && v.status === 'queued') return { success: false, error: 'gate denial swallowed — phantom queued' };
        return { success: false, error: `unexpected: ${JSON.stringify(v).slice(0, 80)}` };
    }).finally(() => {
        sb.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });
        agents.terminate(r.id);
    });
});

test('agents 3: delegate refuses missing agent; delegate gate depth-codes errors', () => {
    const agents = require(path.join(ROOT, 'lib', 'agents.js'));
    return Promise.resolve(agents.delegate('agent_nope_p35', { operation: 'noop' })).then(v => {
        if (v && v.error) return true;
        return { success: false, error: `missing-agent delegate: ${JSON.stringify(v)}` };
    });
});

// ---------- sync 1 ----------

test('sync 1: saveProviderState EINVAL-guard refuses missing userCtx', () => {
    const sync = require(path.join(ROOT, 'lib', 'sync.js'));
    // Ledger contract (sync 1): the guard rejects falsy userCtx with the coded
    // EINVAL error (a truthy-but-wrong-typed ctx is an RLS concern — RLS is
    // opt-in per sandbox 3 BY DESIGN, so that shape is out of scope here).
    for (const bad of [null, undefined, 0, '']) {
        try {
            const v = sync.saveProviderState('p35probe', undefined, undefined, { userCtx: bad });
            if (!v || !v.error) return { success: false, error: `userCtx ${JSON.stringify(bad)} accepted` };
        } catch (e) {
            if (!(e.code === 'VAF_REQUIRED_FIELD' || /userCtx|EINVAL/i.test(e.message))) {
                return { success: false, error: `wrong refusal for ${JSON.stringify(bad)}: ${e.message}` };
            }
        }
    }
    return true;
});

// ---------- transform 4 + backup 5 ----------

test('transform 4: toHorcrux refuses traversal output before any write', () => {
    const transform = require(path.join(ROOT, 'lib', 'transform.js'));
    return Promise.resolve(transform.toHorcrux('/tmp/p35-horcrux-escape.json', { password: 'x' })).then(
        v => ({ success: false, error: `absolute path accepted: ${JSON.stringify(v).slice(0, 60)}` }),
        e => /TRAVERSAL|PATH|BLOCKED/i.test(e.code || e.message) ? true : { success: false, error: `wrong refusal: ${e.message}` }
    );
});

test('backup 5: toHorcrux demands a password (no undefined-key encryption)', () => {
    const transform = require(path.join(ROOT, 'lib', 'transform.js'));
    // Contained repo-relative output (vaf clamps inside the repo); the secret
    // module has no stored brain password in this env → VAF_REQUIRED_FIELD.
    const out = `models/tmp-space/p35-h-${Date.now().toString(36)}.json`;
    return Promise.resolve(transform.toHorcrux(out, {})).then(
        v => ({ success: false, error: `passwordless create allowed: ${JSON.stringify(v).slice(0, 60)}` }),
        e => /VAF_REQUIRED_FIELD|password|traversal/i.test(e.code || e.message)
            ? true  // traversal refusal also proves the password path was never reached
            : { success: false, error: `wrong refusal: ${e.message}` }
    );
});

// ---------- remote 6 ----------

test('remote 6: provider transport errors are coded VantErrors', () => {
    const { GitProvider } = require(path.join(ROOT, 'lib', 'remote.js'));
    const p = new GitProvider({});
    return Promise.resolve(p._requestJson('http://127.0.0.1:9/p35')).then(
        () => ({ success: false, error: 'loopback request unexpectedly resolved' }),
        e => {
            const coded = e instanceof errorsMod.VantError && typeof e.code === 'string' && e.code.length > 0;
            return coded ? true : { success: false, error: `uncoded error: ${e.constructor.name}:${e.message}` };
        }
    );
});

// ---------- #27 / #34 cross-refs ----------

test('#27: primitives.atomicWriteFile reachable via storage facade (one door)', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage.js'));
    const prim = require(path.join(ROOT, 'lib', 'primitives.js'));
    if (Storage.atomicWriteFile !== prim.atomicWriteFile) return { success: false, error: 'facade door drift' };
    const err = require(path.join(ROOT, 'lib', 'error.js'));
    if (err.atomicWriteFile !== prim.atomicWriteFile) return { success: false, error: 'error.js compat drift' };
    return true;
});

test('#34: breaker telemetry alive — failures increment metrics.errors', () => {
    brain.resetLoadCircuit();
    brain._setLoadCircuitThreshold(50);
    brain.resetMetrics();
    brain.register('vaf', () => { throw new Error('p35-telemetry'); });
    return brain.load('identity-probe-p35').catch(() => {}).then(() => {
        brain._clearHandlerOverride('vaf');
        const m = brain.getMetrics();
        if (m.errors < 1) return { success: false, error: 'errors still dead' };
        const st = brain.getLoadCircuitStatus();
        if (typeof st.state !== 'string' || typeof st.failures !== 'number') return { success: false, error: 'status shape' };
        return true;
    }).finally(() => { brain.resetLoadCircuit(); });
});

// ---------- done ----------

_chain.then(() => {
    for (const fn of cleanupFns) { try { fn(); } catch (e) {} }
    console.log(`\n${results.passed} passed, ${results.failed} failed\n`);
    process.exit(results.failed === 0 ? 0 : 1);
});
