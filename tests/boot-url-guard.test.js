#!/usr/bin/env node
/**
 * BOOT URL-GUARD pins (round 9+, bin/boot.js) — the remote-horcrux fetch guard.
 *
 * `bin/boot.js` fetches a remote stego image, so its URL validation is an SSRF
 * surface. Two flaws lived here:
 *   1. `validateUrl` blocked internal hosts with a PARTIAL list (no 169.254
 *      metadata, no 172.16/12 beyond 172.16, no IPv6 loopback/ULA/link-local,
 *      no .internal).
 *   2. the HTTPS gate in `boot()` allowed plaintext http when the WHOLE URL
 *      string contained 'localhost' — so `http://internal-svc:8080/localhost`
 *      (and `http://evil.example.com/localhost`) slipped the gate to a remote
 *      host while looking loopback.
 *
 * DISCRIMINATING: pre-fix, `isLoopbackUrl` does not exist (the require fails)
 * and the metadata / IPv6 / 172.17 hosts are admitted. Post-fix every pin
 * passes. Run: node tests/boot-url-guard.test.js
 */
'use strict';

const assert = require('assert');
const boot = require('../bin/boot');

const results = { passed: 0, failed: 0 };
const order = [];
function ok(name, fn) { order.push({ name, fn }); }

const refuses = (url) => {
    try { boot.validateUrl(url); return false; } catch (e) { return true; }
};

async function main() {
    console.log('\n\ud83e\udd65 BOOT URL-GUARD PINS (round 9+, bin/boot.js)\n');
    for (const { name, fn } of order) {
        try { fn(); results.passed++; console.log('  \u2713 ' + name); }
        catch (e) { results.failed++; console.log('  \u2717 ' + name + ': ' + (e && e.message ? e.message.split('\n')[0] : e)); }
    }
    console.log(`\nPassed:  ${results.passed}`);
    console.log(`Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
}

// ------------------------------------------------------------------
// 1. internal hosts the old partial list admitted
// ------------------------------------------------------------------

ok('B0 cloud-metadata + full RFC1918 + IPv6 internal hosts are refused', () => {
    assert.strictEqual(typeof boot.validateUrl, 'function', 'bin/boot must export validateUrl');
    for (const u of [
        'http://169.254.169.254/latest/meta-data/iam/security-credentials/', // cloud metadata
        'http://172.17.0.1:2375/containers/json',                            // docker bridge (old list only caught 172.16.)
        'http://172.31.255.9/x',
        'http://0.0.0.0/x',
        'http://[::1]/x',                                                    // IPv6 loopback
        'http://[fd00::1]/x',                                                // IPv6 ULA
        'http://[fe80::1]/x',                                                // IPv6 link-local
        'http://10.1.2.3/x',
        'http://192.168.1.1/x',
        'http://127.0.0.1/x',
        'http://localhost/x',
        'http://metadata.google.internal/x',
        'http://foo.local/x',
    ]) {
        assert.ok(refuses(u), 'validateUrl admitted an internal host: ' + u);
    }
});

ok('B1 a real public host is admitted', () => {
    const v = boot.validateUrl('https://example.com/horcrux.png');
    assert.strictEqual(v.isLocal, false, 'a public URL is remote');
    assert.strictEqual(v.url, 'https://example.com/horcrux.png', 'the URL is passed through');
});

ok('B2 a non-http(s) scheme is refused', () => {
    assert.ok(refuses('ftp://example.com/x.png'), 'ftp must be refused');
    assert.ok(refuses('file:///etc/passwd'), 'file: must be refused');
});

// ------------------------------------------------------------------
// 2. the substring-bypass: loopback must be read from the PARSED hostname
// ------------------------------------------------------------------

ok('B3 isLoopbackUrl reads the hostname, never a substring of the URL', () => {
    assert.strictEqual(typeof boot.isLoopbackUrl, 'function', 'the guard must expose isLoopbackUrl');
    // real loopback
    assert.strictEqual(boot.isLoopbackUrl('http://127.0.0.1:3789/x'), true, '127.0.0.1 is loopback');
    assert.strictEqual(boot.isLoopbackUrl('http://[::1]:3789/x'), true, '[::1] is loopback');
    assert.strictEqual(boot.isLoopbackUrl('http://localhost:3789/x'), true, 'localhost is loopback');
    // the bypass: a remote host whose PATH contains 'localhost' is NOT loopback
    assert.strictEqual(boot.isLoopbackUrl('http://evil.example.com/localhost'), false,
        'a remote host with localhost in its path is NOT loopback (substring bypass)');
    assert.strictEqual(boot.isLoopbackUrl('http://internal-svc:8080/localhost'), false,
        'a remote host with localhost in its path is NOT loopback');
});

ok('B4 a plaintext remote URL carrying "localhost" is not a loopback carve-out', () => {
    // This is the exact decision the boot() HTTPS gate makes: http + not
    // loopback => refused. Pre-fix, `url.includes('localhost')` was true, so
    // the gate PASSED and the plaintext remote fetch went through.
    assert.strictEqual(boot.isLoopbackUrl('http://internal-svc:8080/localhost'), false,
        'the plaintext-remote-with-localhost URL must not pass the loopback carve-out');
});

main();
