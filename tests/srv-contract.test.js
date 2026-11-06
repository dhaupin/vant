#!/usr/bin/env node
/**
 * SRV-CONTRACT pins (wave B, vant#338): the rust-srv / julia-srv wire
 * interface is a SUPPORTED INTERFACE. The /health bodies carry the
 * negotiation marker contract:1, both headers declare the supported
 * contract, the contract doc pins endpoints + threat model, and the
 * shared runtime tolerates the additive marker (its healthy() probe
 * checks ok/lang only).
 *
 * Static-source pins: the real sidecars need a language toolchain
 * (cargo / julia), which is env-flavored; the CONTRACT VALUE being
 * graded is the wire shape, and the wire shape lives in these files.
 * Stashing the fixes flips the finding-shaped pins (verified).
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };

function test(name, fn) {
    try {
        fn();
        results.passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
    return true;
}

function read(p) {
    return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

const RUST = 'lib/connectors/rust-srv/src/main.rs';
const JULIA = 'lib/connectors/julia-srv.jl';
const DOC = 'lib/connectors/SRV-CONTRACT.md';
const RUNTIME = 'lib/sidecar.js';

console.log('\n=== SRV-CONTRACT Tests (vant#338) ===\n');

test('each sidecar /health carries the contract:1 negotiation marker', () => {
    const rust = read(RUST);
    const julia = read(JULIA);
    assert(rust.includes('\\"lang\\":\\"rust\\",\\"contract\\":1'), 'rust-srv lost the contract:1 marker');
    assert(julia.includes('\\"lang\\":\\"julia\\",\\"contract\\":1'), 'julia-srv lost the contract:1 marker');
    assert(rust.includes('SRV-CONTRACT.md') && julia.includes('SRV-CONTRACT.md'),
        'a sidecar header no longer names the contract doc');
    return true;
});

test('the contract doc exists and pins the full endpoint set + shapes', () => {
    const doc = read(DOC);
    assert(doc.includes('GET /health') && doc.includes('POST /eval') && doc.includes('POST /stop'),
        'contract doc lost an endpoint');
    assert(doc.includes('"contract":1'), 'contract doc lost the version marker');
    assert(doc.includes('Loopback-only') && doc.includes('ARGV[1]'),
        'contract doc lost the loopback/token threat-model posture');
    assert(doc.includes('bad token') && doc.includes('missing code'),
        'contract doc lost the error shapes');
    return true;
});

test('both sidecars implement stop as a self-termination the token can reach (exit 0)', () => {
    assert(read(RUST).includes('std::process::exit(0)'), 'rust-srv stop path changed');
    assert(read(JULIA).includes('exit(0)'), 'julia stop path changed');
    return true;
});

test('the shared runtime probe stays additive-safe: healthy() checks ok+lang, never the whole body', () => {
    const runtime = read(RUNTIME);
    assert(runtime.includes('body.ok === true && body.lang === spec.lang'),
        'sidecar.healthy() was tightened to a full-body comparison — the contract marker would break it');
    assert(runtime.includes('SRV-CONTRACT.md'), 'runtime header lost the contract pointer');
    return true;
});

console.log(`\nPassed:  ${results.passed}`);
console.log(`Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
