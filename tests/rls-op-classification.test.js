#!/usr/bin/env node
/**
 * RLS op-word classification pins (round-9 audit, R9-1 + R9-2 + R9-3)
 *
 * Three verdict surfaces classified an operation WORD with a small hardcoded
 * list and fell back to the LOOSER class — the fail-open direction, the
 * opposite of the house's "unknown = write" law (lib/guests.js
 * classifyTool). Each is pinned here BOTH WAYS: the exact word that
 * printed the wrong verdict pre-fix (must now refuse) and the known-good
 * words that must keep their verdict.
 *
 *   R9-1 lib/rls.js isOperationAllowed(op, resource)
 *     pre-fix: `['write','create','update','delete','commit'].includes(op)
 *               ? 'write' : 'read'`
 *     -> every UNLISTED word (grant, set, mint, record, assign, spawn,
 *        revoke, issue, a typo) resolved to the LOOSER `read` policy, so
 *        `vant rls allow grant <res>` printed ALLOWED while the identical
 *        write verb `delete` printed DENIED.
 *     post-fix: an explicit READ canon, everything else WRITE.
 *
 *   R9-2 lib/system.js isOperationAllowed(op) + bin/system.js
 *     pre-fix: the stub returned `{ allowed: true }` for ANY string, and
 *        the CLI truthy-tested that OBJECT (`allowed ? 'ALLOWED' : ...`),
 *        so `vant system allow totally-bogus-op` printed ALLOWED, exit 0.
 *     post-fix: known words only; unknown/empty refuse; the CLI reads the
 *        `.allowed` field and sets the exit code.
 *
 * ISOLATION: scratch brain (VANT_BRAIN) so the habitat decision never
 * touches a real brain's state; run-all gives every suite its own process.
 *
 * Run: node tests/rls-op-classification.test.js
 */

const SCRATCH_BRAIN = require('./scratch-brain').scratchBrain('rls-ops-test-' + Date.now().toString(36));
process.env.VANT_GATE_QUIET = '1';

const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };

async function test(name, fn) {
    try {
        const ok = await fn();
        if (ok === false) throw new Error('assertion failed');
        results.passed++;
        console.log(`  \u2713 ${name}`);
    } catch (e) {
        results.failed++;
        console.log(`  \u2717 ${name}: ${e.message}`);
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

function cli(args) {
    const r = spawnSync('node', ['bin/vant.js', ...args], {
        cwd: ROOT, encoding: 'utf8', timeout: 30000,
        env: { ...process.env, VANT_BRAIN: SCRATCH_BRAIN, VANT_GATE_QUIET: '1' }
    });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

async function main() {
    console.log('\n\ud83d\udd10 RLS OP-WORD CLASSIFICATION PINS (round-8 audit)\n');
    console.log('  (scratch brain: ' + SCRATCH_BRAIN + ')');

    const rls = require(path.join(ROOT, 'lib', 'rls'));
    const system = require(path.join(ROOT, 'lib', 'system'));

    // ---------- R9-1: lib/rls.js op -> mode (fail-closed) ----------
    console.log('\n  R9-1 rls.isOperationAllowed (unknown = write):');

    // The word that FAILED PRE-FIX: `grant` is a write verb but was not in
    // the old 5-word list, so it resolved to `read` and was ALLOWED for an
    // anonymous context on a default-policy resource.
    await test('R9-1 write verb "grant" is DENIED anonymously (was ALLOWED pre-fix)', async () => {
        const allowed = await rls.isOperationAllowed('grant', '_brain:identity', {});
        assert(allowed === false, 'grant should classify write -> denied, got ' + allowed);
    });

    await test('R9-1 every unlisted write verb is DENIED anonymously', async () => {
        for (const op of ['set', 'mint', 'record', 'assign', 'spawn', 'revoke', 'issue', 'create', 'update', 'delete', 'commit']) {
            const allowed = await rls.isOperationAllowed(op, '_brain:identity', {});
            assert(allowed === false, `${op} should classify write -> denied, got ${allowed}`);
        }
    });

    await test('R9-1 a typo/unknown word is DENIED (fail-closed, not read)', async () => {
        for (const op of ['raed', 'wrtie', 'totally-bogus', '']) {
            const allowed = await rls.isOperationAllowed(op, '_brain:identity', {});
            assert(allowed === false, `unknown op ${JSON.stringify(op)} should be denied, got ${allowed}`);
        }
    });

    // Negative control: the READ canon must keep allowing real reads.
    await test('R9-1 read canon stays ALLOWED anonymously (no over-tightening)', async () => {
        for (const op of ['read', 'get', 'list', 'status', 'info', 'inspect', 'health', 'whoami']) {
            const allowed = await rls.isOperationAllowed(op, '_brain:identity', {});
            assert(allowed === true, `${op} should classify read -> allowed, got ${allowed}`);
        }
    });

    await test('R9-1 explicit write words still DENIED (regression guard)', async () => {
        for (const op of ['write', 'delete', 'update', 'commit']) {
            const allowed = await rls.isOperationAllowed(op, '_brain:identity', {});
            assert(allowed === false, `${op} should be denied, got ${allowed}`);
        }
    });

    // ---------- R9-2: lib/system.js verdict shape ----------
    console.log('\n  R9-2 system.isOperationAllowed (unknown refused):');

    await test('R9-2 unknown word is REFUSED (was {allowed:true} pre-fix)', async () => {
        const v = system.isOperationAllowed('totally-bogus-op');
        assert(v && v.allowed === false, 'bogus word should be refused, got ' + JSON.stringify(v));
    });

    await test('R9-2 empty word is REFUSED', async () => {
        const v = system.isOperationAllowed('');
        assert(v && v.allowed === false, 'empty word should be refused, got ' + JSON.stringify(v));
    });

    await test('R9-2 known read/write words stay allowed (no over-tightening)', async () => {
        for (const op of ['read', 'get', 'list', 'status', 'write', 'create', 'delete']) {
            const v = system.isOperationAllowed(op);
            assert(v && v.allowed === true, `${op} should be allowed, got ${JSON.stringify(v)}`);
        }
    });

    // ---------- CLI-level: the operator-visible verdict ----------
    console.log('\n  CLI verdict surfaces (exit code + word):');

    await test('R9-2 `vant system allow <bogus>` prints DENIED and exits 1', async () => {
        const r = cli(['system', 'allow', 'totally-bogus-op']);
        assert(r.code === 1, 'expected exit 1, got ' + r.code);
        assert(/\bDENIED\b/.test(r.out), 'expected DENIED, got: ' + r.out.trim());
    });

    await test('R9-2 `vant system allow read` prints ALLOWED and exits 0 (control)', async () => {
        const r = cli(['system', 'allow', 'read']);
        assert(r.code === 0, 'expected exit 0, got ' + r.code);
        assert(/\bALLOWED\b/.test(r.out), 'expected ALLOWED, got: ' + r.out.trim());
    });

    await test('R9-1 `vant rls allow grant <res>` prints DENIED and exits 1', async () => {
        const r = cli(['rls', 'allow', 'grant', '_brain:identity']);
        assert(r.code === 1, 'expected exit 1, got ' + r.code);
        assert(/\bDENIED\b/.test(r.out), 'expected DENIED, got: ' + r.out.trim());
    });

    await test('R9-1 `vant rls allow read <res>` prints ALLOWED and exits 0 (control)', async () => {
        const r = cli(['rls', 'allow', 'read', '_brain:identity']);
        assert(r.code === 0, 'expected exit 0, got ' + r.code);
        assert(/\bALLOWED\b/.test(r.out), 'expected ALLOWED, got: ' + r.out.trim());
    });

    // ---------- R9-3: bin/habitat.js mode-word coercion ----------
    // pre-fix: `mode === 'write' ? 'write' : 'read'` coerced any non-'write'
    // word (a write verb like `delete`, or `garbage`) to the LOOSER read
    // policy, so the verdict printed ALLOWED. post-fix: mode must be
    // read|write or it is a usage error (exit 1); the coercion is gone.
    console.log('\n  R9-3 habitat CLI mode-word validation:');

    await test('R9-3 `vant habitat can delete <res> <user>` is a usage error, not ALLOWED', async () => {
        const r = cli(['habitat', 'can', 'delete', '_brain:identity', 'nobody']);
        assert(r.code === 1, 'expected exit 1, got ' + r.code);
        assert(!/\bALLOWED\b/.test(r.out), 'must not print ALLOWED, got: ' + r.out.trim());
    });

    await test('R9-3 `vant habitat can garbage <res> <user>` is a usage error', async () => {
        const r = cli(['habitat', 'can', 'garbage', '_brain:identity', 'nobody']);
        assert(r.code === 1, 'expected exit 1, got ' + r.code);
        assert(!/\bALLOWED\b/.test(r.out), 'must not print ALLOWED, got: ' + r.out.trim());
    });

    await test('R9-3 `vant habitat can read <res> <user>` still answers ALLOWED (control)', async () => {
        const r = cli(['habitat', 'can', 'read', '_brain:identity', 'nobody']);
        assert(r.code === 0, 'expected exit 0, got ' + r.code);
        assert(/\bALLOWED\b/.test(r.out), 'expected ALLOWED, got: ' + r.out.trim());
    });

    await test('R9-3 `vant habitat can write <res> <user>` still answers DENIED (control)', async () => {
        const r = cli(['habitat', 'can', 'write', '_brain:identity', 'nobody']);
        assert(r.code === 1, 'expected exit 1, got ' + r.code);
        assert(/\bDENIED\b/.test(r.out), 'expected DENIED, got: ' + r.out.trim());
    });

    console.log(`\n  ${results.passed} passed, ${results.failed} failed\n`);
    process.exit(results.failed === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
