#!/usr/bin/env node
/**
 * Succession `log` provenance tests (vant #373)
 *
 * `vant succession log` used to destroy the previous brain's provenance:
 *   config.succession.previous = config.succession.previous || {}
 *   config.succession.previous.commit = commit
 * A populated block had its `commit` overwritten (with the literal
 * "unknown" whenever the install sits outside a git tree -- the normal
 * case for a restored brain); a null/absent block was fabricated into a
 * commit-only object. The config's `version` was also never advanced, so
 * a second `log` reported the wrong ledger `from`.
 *
 * These pins run the REAL bin/succession.js against a throwaway install
 * (bin + lib symlinked, models/ seeded), in a forced non-git context so
 * getGitCommit() returns "unknown".
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  \u2713 ${name}`);
        } else {
            results.failed++;
            console.log(`  \u2717 ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  \u2717 ${name}: ${e.message}`);
    }
}

// Build a throwaway install whose bin/ and lib/ are the REAL ones (symlinked),
// with models/ seeded from `seedConfig`. Run `succession log` there in a forced
// non-git context; return the resulting _succession.json (or an error).
function runLog(seedConfig, args) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'succ-prov-'));
    try {
        fs.symlinkSync(path.join(ROOT, 'lib'), path.join(dir, 'lib'));
        fs.symlinkSync(path.join(ROOT, 'bin'), path.join(dir, 'bin'));
        fs.mkdirSync(path.join(dir, 'models', 'public', 'vant'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'models', 'private', 'vant'), { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'models', 'state.json'),
            JSON.stringify({ stack: ['vant'], currentBrain: 'vant' })
        );
        const cfgPath = path.join(dir, 'models', 'public', 'vant', '_succession.json');
        fs.writeFileSync(cfgPath, JSON.stringify(seedConfig, null, 2));

        const r = cp.spawnSync('node', ['bin/succession.js', 'log', ...args], {
            cwd: dir,
            encoding: 'utf8',
            timeout: 30000,
            // A bogus GIT_DIR forces `git rev-parse HEAD` to fail -> "unknown",
            // reproducing the restored-brain (non-git) condition deterministically.
            env: { ...process.env, GIT_DIR: path.join(dir, 'no-such-git-dir') }
        });
        if (r.status !== 0) {
            return { error: `cli exit ${r.status}: ${(r.stderr || '').slice(-200)}` };
        }
        return { config: JSON.parse(fs.readFileSync(cfgPath, 'utf8')) };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const RICH_PREVIOUS = {
    version: '0.9.0',
    commit: 'abc1234',
    date: '2026-10-01',
    label: 'the prior generation'
};

function seed(previous) {
    return {
        version: '1.0.0',
        succession: {
            previous,
            registry: { type: 'git-ref', path: 'refs/heads/main', ledger: 'models/private/vant/.ledger.json' },
            trust: { default: 'high', levels: {} }
        }
    };
}

console.log('\n\u{1F451} SUCCESSION LOG PROVENANCE TESTS (#373)\n');

test('a populated previous block survives `log` (not collapsed to one key)', () => {
    const out = runLog(seed(RICH_PREVIOUS), ['1.1.0', 'new gen']);
    if (out.error) return { error: out.error };
    const prev = out.config.succession.previous;
    if (!prev || typeof prev !== 'object') return { error: 'previous was destroyed: ' + JSON.stringify(prev) };
    if (Object.keys(prev).length < 4) return { error: 'previous collapsed to ' + JSON.stringify(prev) };
    if (prev.version !== '0.9.0') return { error: 'previous.version lost: ' + prev.version };
    if (prev.date !== '2026-10-01') return { error: 'previous.date lost: ' + prev.date };
    if (prev.label !== 'the prior generation') return { error: 'previous.label lost: ' + prev.label };
    return true;
});

test('previous.commit is NOT overwritten with the literal "unknown" outside git', () => {
    const out = runLog(seed(RICH_PREVIOUS), ['1.1.0', 'new gen']);
    if (out.error) return { error: out.error };
    const commit = out.config.succession.previous.commit;
    if (commit === 'unknown') return { error: 'previous.commit clobbered to "unknown" (the #373 bug)' };
    if (commit !== 'abc1234') return { error: 'previous.commit changed unexpectedly: ' + commit };
    return true;
});

test('a null previous is NOT fabricated into { commit: "unknown" }', () => {
    const out = runLog(seed(null), ['1.1.0', 'new gen']);
    if (out.error) return { error: out.error };
    const prev = out.config.succession.previous;
    if (prev === null) return true;
    if (prev && prev.commit === 'unknown') return { error: 'fabricated { commit: "unknown" } from null' };
    if (prev && Object.keys(prev).length === 1 && prev.commit) return { error: 'fabricated a commit-only previous: ' + JSON.stringify(prev) };
    return true;
});

test('the config version advances so the ledger `from` is correct on the next log', () => {
    const out = runLog(seed(RICH_PREVIOUS), ['1.1.0', 'new gen']);
    if (out.error) return { error: out.error };
    if (out.config.version !== '1.1.0') {
        return { error: `config.version not advanced (got ${out.config.version}, want 1.1.0)` };
    }
    return true;
});

console.log(`\n  ${results.passed} passed, ${results.failed} failed\n`);
process.exit(results.failed > 0 ? 1 : 0);
