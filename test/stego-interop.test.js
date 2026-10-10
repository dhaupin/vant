#!/usr/bin/env node
/**
 * Stego interop pins (pass 178, labs/STEGO-INTEROP-AUDIT.md §5).
 *
 * THE GOAL: Vant SVG stego and Stegoframe read each other. Implementation:
 *   - encrypt: 12-byte GCM IV on writes; width sniff on decrypt keeps
 *     legacy 16-byte-IV stones decodable forever (no migration script).
 *   - decodeSvg: lenient reader — opening tag with OR without attributes,
 *     payload bare or inside <metadata> (both wire styles).
 *   - encodeSvg: shared ns URI http://steganography.dev/brn,
 *     <desc data-f="1.0"/> marker, legacy <metadata> wrap kept.
 *
 * Exit code is the verdict, per house test conventions.
 */
'use strict';
const assert = require('assert');
const crypto = require('crypto');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log('  ✓ ' + name); }
    catch (e) { failed++; console.log('  ✗ ' + name + (e && e.message ? ' — ' + e.message : '')); }
}

const stego = require('../lib/stego');
const Encrypt = require('../lib/encrypt');

const PW = 'pin-stone-pw';
const TEMPLATE = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>';

/** Build a wire-record by hand (mirrors Stegoframe's codec, 12-byte GCM IV). */
function sfRecord(msg, password) {
    const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const ci = crypto.createCipheriv('aes-256-gcm', key, iv);
    let e = ci.update(msg, 'utf8', 'hex'); e += ci.final('hex');
    return 'BRN:ENC:' + salt.toString('hex') + ':' + iv.toString('hex') + ':'
        + ci.getAuthTag().toString('hex') + ':' + e;
}

/** Legacy Vant record (16-byte IV — every stone written before pass 178). */
function legacyRecord(msg, password) {
    const salt = crypto.randomBytes(16), iv = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const ci = crypto.createCipheriv('aes-256-gcm', key, iv);
    let e = ci.update(msg, 'utf8', 'hex'); e += ci.final('hex');
    return 'BRN:ENC:' + salt.toString('hex') + ':' + iv.toString('hex') + ':'
        + ci.getAuthTag().toString('hex') + ':' + e;
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

console.log('\n▓ STEGO INTEROP PINS (Vant ↔ Stegoframe)\n');

test('primitive: new writes emit the modern 12-byte GCM IV (shared packet shape)', () => {
    const rec = Encrypt.encrypt('pin', PW);
    assert.strictEqual(rec.split(':')[1].length, 24, 'IV must be 24 hex chars (12 bytes)');
});

test('primitive: encrypt decrypts BOTH widths (12B modern, 16B legacy)', () => {
    assert.strictEqual(Encrypt.decrypt(Encrypt.encrypt('modern', PW), PW), 'modern');
    // synthesize a legacy record via raw crypto (the only way it exists now)
    assert.strictEqual(Encrypt.decrypt(legacyRecord('legacy', PW).replace('BRN:ENC:', ''), PW), 'legacy');
});

test('primitive: unsupported IV width fails with an honest message', () => {
    const bad = Encrypt.encrypt('x', PW).split(':');
    bad[1] = 'aabb'; // 1-byte IV — neither shape
    const r = Encrypt.decrypt(bad.join(':'), PW);
    assert.ok(r.error && /IV length/.test(r.error), 'expected IV-length complaint: ' + JSON.stringify(r));
});

test('vant reads a Stegoframe stone (12B IV, attributed open tag, bare wrap)', () => {
    const sfSvg = '<svg xmlns="http://www.w3.org/2000/svg"><desc data-f="1.0"/>'
        + '<brn:secret xmlns:brn="http://steganography.dev/brn">' + b64(sfRecord('sf message', PW)) + '</brn:secret></svg>';
    const d = stego.decodeSvg(sfSvg, PW);
    assert.ok(!d.error && d.message === 'sf message', 'SF stone unreadable: ' + JSON.stringify(d));
});

test('vant reads a LEGACY stone (16B IV, bare tag, metadata wrap) — no migration', () => {
    const legacySvg = TEMPLATE.replace('</svg>',
        '<metadata><brn:secret>' + b64(legacyRecord('legacy stone', PW)) + '</brn:secret></metadata></svg>');
    const d = stego.decodeSvg(legacySvg, PW);
    assert.ok(!d.error && d.message === 'legacy stone', 'legacy stone unreadable: ' + JSON.stringify(d));
});

test('vant writes are Stegoframe-decodable: modern record + shared markers', () => {
    const svg = stego.encodeSvg('cross system', TEMPLATE, PW);
    assert.ok(svg.includes('xmlns:brn="http://steganography.dev/brn"'), 'shared ns URI required');
    assert.ok(svg.includes('<desc data-f="1.0"/>'), 'format marker required');
    assert.ok(svg.includes('<brn:secret>'), 'bare Vant-write open tag (SF reader accepts)');
    // Stegoframe's extraction logic, on Vant's output:
    const elem = svg.match(/<brn:secret[^>]*>([^<]+)<\/brn:secret>/);
    assert.ok(elem, 'SF-style extract must find the element');
    const packet = Buffer.from(elem[1], 'base64').toString('utf8');
    assert.ok(packet.startsWith('BRN:ENC:'), 'packet shape: ' + packet.slice(0, 12));
    const parts = packet.slice(8).split(':');
    assert.strictEqual(parts[1].length, 24, 'modern write = 12-byte IV (SF-compatible)');
    // and Vant's own reader still unwinds it:
    const d = stego.decodeSvg(svg, PW);
    assert.ok(!d.error && d.message === 'cross system');
});

test('re-encode cleans BOTH wire styles from an incoming stone (no double payloads)', () => {
    const sfSvg = '<svg><brn:secret xmlns:brn="http://steganography.dev/brn">'
        + b64(sfRecord('junk', PW)) + '</brn:secret></svg>';
    const hold = stego.encodeSvg('fresh', sfSvg, PW);
    assert.strictEqual((hold.match(/<brn:secret/g) || []).length, 1, 'one payload only after re-encode');
    const d = stego.decodeSvg(hold, PW);
    assert.ok(!d.error && d.message === 'fresh');
});

test('plaintext packet still refused (encryption required contract intact)', () => {
    const plain = '<svg><brn:secret>' + b64('BRN:plaintext') + '</brn:secret></svg>';
    const d = stego.decodeSvg(plain, PW);
    assert.ok(d && d.error, 'plaintext must not decode');
});

console.log('\n  Stego interop pins: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
process.exit(0);
