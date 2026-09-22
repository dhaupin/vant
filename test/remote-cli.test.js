#!/usr/bin/env node
/**
 * Remote CLI tests (prd-storage — Slice R3)
 *
 * bin/remote.js + bin/vant.js router wiring. Offline checks only:
 * - router: command maps to an existing file, help mentions the command
 * - CLI smoke: help, unknown option, unconfigured refusal (exit 1, clear error)
 * - gate-probe safety: --push never performs a transfer when unconfigured
 * - --status secret hygiene: never prints key material from env
 * Real-network transfer paths are exercised only via --test/--push with
 * live credentials (operator action, documented in the help text).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const results = { passed: 0, failed: 0 };
const failures = [];

function test(name, fn) {
    try {
        const ok = fn();
        if (ok === true || (ok && ok.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            const msg = (ok && ok.error) || 'failed';
            failures.push(`${name}: ${msg}`);
            console.log(`  ✗ ${name}: ${msg}`);
        }
    } catch (e) {
        results.failed++;
        failures.push(`${name}: ${e.message}`);
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

const VANT = path.resolve(__dirname, '..', 'bin', 'vant.js');
const S3CLI = path.resolve(__dirname, '..', 'bin', 's3.js');

function envWithoutRemote() {
    const env = { ...process.env };
    for (const k of Object.keys(env)) {
        if (k.startsWith('VANT_REMOTE_')) delete env[k];
    }
    return env;
}

function runCli(args, envExtra = {}) {
    return execFileSync('node', [S3CLI, ...args], {
        encoding: 'utf8',
        env: { ...process.env, ...envExtra },
        timeout: 20000
    });
}

console.log('\n🛰️  REMOTE CLI TESTS (prd-storage Slice R3)\n');

test('router: vant.js maps s3 → s3.js (and the original remote CLI stays intact)', () => {
    const src = fs.readFileSync(VANT, 'utf8');
    if (!/\bs3:\s*'s3\.js'/.test(src)) return { success: false, error: 's3 router entry missing' };
    if (!fs.existsSync(S3CLI)) return { success: false, error: 'bin/s3.js missing' };
    if (!src.includes('vant s3')) return { success: false, error: 'help line missing' };
    // the pre-existing SSH/remote-host CLI must remain wired
    if (!/\bremote:\s*'remote\.js'/.test(src)) return { success: false, error: 'original remote router entry lost' };
    if (!fs.existsSync(path.resolve(__dirname, '..', 'bin', 'remote.js'))) return { success: false, error: 'bin/remote.js missing' };
    return true;
});

test('CLI smoke: --help prints usage and exits 0', () => {
    const out = runCli(['--help']);
    if (!out.includes('vant s3 --status')) return { success: false, error: 'help text incomplete' };
    if (!out.includes('VANT_REMOTE_BUCKET')) return { success: false, error: 'env docs missing' };
    return true;
});

test('CLI smoke: no args exits 0 with help; unknown option exits 1', () => {
    const out = runCli([]);
    if (!out.includes('Usage')) return { success: false, error: 'bare invocation should print help' };
    let code = 0, err = '';
    try {
        execFileSync('node', [S3CLI, '--frobnicate'], { encoding: 'utf8', timeout: 20000 });
    } catch (e) {
        code = e.status; err = (e.stdout || '') + (e.stderr || '');
    }
    if (code !== 1) return { success: false, error: 'unknown option must exit 1' };
    if (!err.includes('Unknown option')) return { success: false, error: 'unknown-option message wrong' };
    return true;
});

test('CLI smoke: unconfigured --status refuses with clear error (exit 1)', () => {
    let code = 0, err = '';
    try {
        execFileSync('node', [S3CLI, '--status'], {
            encoding: 'utf8', env: envWithoutRemote(), timeout: 20000
        });
    } catch (e) {
        code = e.status; err = (e.stdout || '') + (e.stderr || '');
    }
    if (code !== 1) return { success: false, error: 'unconfigured --status must exit 1' };
    if (!err.includes('not configured')) return { success: false, error: 'refusal message wrong' };
    return true;
});

test('CLI smoke: --push/--pull refuse before any transfer when unconfigured', () => {
    for (const flag of ['--push', '--pull']) {
        let code = 0, err = '';
        try {
            execFileSync('node', [S3CLI, flag], {
                encoding: 'utf8', env: envWithoutRemote(), timeout: 20000
            });
        } catch (e) {
            code = e.status; err = (e.stdout || '') + (e.stderr || '');
        }
        if (code !== 1) return { success: false, error: flag + ' must refuse unconfigured' };
        if (!err.includes('not configured')) return { success: false, error: flag + ' refusal message wrong' };
    }
    return true;
});

test('CLI smoke: --status never echoes secret env values', () => {
    const key = 'VANT_TEST_SECRET_' + Date.now();
    let out = '';
    try {
        execFileSync('node', [S3CLI, '--status'], {
            encoding: 'utf8',
            env: {
                ...process.env,
                VANT_REMOTE_PROVIDER: 'minio',
                VANT_REMOTE_BUCKET: 'smoke-bucket',
                VANT_REMOTE_KEY: 'AKID-smoke',
                ['VANT_REMOTE_SECRET']: 'SUPERSECRET-' + key
            },
            timeout: 20000
        });
    } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    if (out.includes('SUPERSECRET-' + key)) return { success: false, error: 'secret echoed by --status' };
    return true;
});

(async () => {
    console.log(`\n  ${results.passed} passed, ${results.failed} failed`);
    if (results.failed > 0) {
        console.log('\n  FAILURES:');
        failures.forEach(f => console.log('   - ' + f));
    }
    process.exit(results.failed > 0 ? 1 : 0);
})();
