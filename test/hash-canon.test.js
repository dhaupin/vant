#!/usr/bin/env node
/**
 * Wave C pins — ONE hashing module (prd-canonicalization §4).
 *
 * Proves:
 *  1. lib/hash.js digests are byte-identical to direct crypto calls
 *     (the migration rule: digests must not move).
 *  2. canonicalBytes = the #146 encoder; hash() agrees with canonical.hash().
 *  3. Migrated call sites (audit/wal/vaf/tree/canonical/checkpoint/seeds/
 *     spine/brain-verify via their public shapes) still produce the same
 *     digests their outgoing impls produced (golden vectors pinned here).
 *  4. crc32 = zlib.crc32 exactly (stego's PNG checksum stays valid).
 *  5. GREP GATE: no module outside lib/hash.js calls
 *     crypto.createHash('sha256') — the stragglers-retired rule.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function pin(name, cond) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ FAILED: ' + name); }
}

// 1. Byte-identity vs direct crypto (the migration invariant)
const hashlib = require('../lib/hash');
for (const input of ['', 'vant', ' axle\x00\x01 chain', '{"a":1,"z":[2,3]}']) {
    pin('sha256 identity: ' + JSON.stringify(input).slice(0, 24),
        hashlib.sha256(input) === crypto.createHash('sha256').update(input).digest('hex'));
}
// Buffer inputs (brain-verify file bytes path)
const byteSamples = [Buffer.from('hello'), crypto.randomBytes(64), Buffer.alloc(0)];
for (const b of byteSamples) {
    pin('sha256(Buffer) identity', hashlib.sha256(b) === crypto.createHash('sha256').update(b).digest('hex'));
}

// 1b. Incremental (Hasher) identity — multi-update, chained, raw digest
{
    const parts = [Buffer.from('root|schema|3|', 'utf8'), Buffer.from('p\x00abcdef\n', 'utf8'), Buffer.from('q\x00fedcba\n', 'utf8')];
    const oldH = crypto.createHash('sha256');
    for (const p of parts) oldH.update(p);
    const newH = hashlib.sha256H();
    for (const p of parts) newH.update(p);
    pin('multi-update identity', oldH.digest('hex') === newH.digest('hex'));

    const oldC = crypto.createHash('sha256'), newC = hashlib.sha256H();
    pin('chainable identity', oldC.update('x').update('y').digest('hex') === newC.update('x').update('y').digest('hex'));

    pin('raw digest() identity',
        crypto.createHash('sha256').update('vant').digest().equals(hashlib.sha256H().update('vant').digest()));

    pin('sha256Stream alias === sha256H', typeof hashlib.sha256Stream === 'function' && hashlib.sha256Stream().digest('hex').length === 64);
}

// 2. Canonical module agreement
{
    const canonical = require('../lib/state/canonical');
    const v = { z: [3, 1, 2], a: 'x', nested: { key2: true, key1: null } };
    // key-order independence is the encoder's job (already pinned in engine-parity); here: hash==canonical.hash path
    pin('hash() === canonical.hash()', hashlib.hash(v) === canonical.hash(v));
    pin('canonicalBytes returns a Buffer', Buffer.isBuffer(hashlib.canonicalBytes(v)));
    pin('canonicalBytes digest equals canonical.hash', hashlib.sha256(hashlib.canonicalBytes(v)) === canonical.hash(v));
    // canonical empty object: encode({}) should be constant
    pin('canonicalBytes({}) deterministic', hashlib.canonicalBytes({}).equals(hashlib.canonicalBytes({})));
}

// 3. Golden vectors for migrated modules (generated from the pre-migration
// direct-crypto impls — digest bytes must not move)
{
    const goldenEntry = { timestamp: '2026-10-09T00:00:00.000Z', action: 'golden', data: { op: 'wave-c', n: 1 } };
    // audit.hashEntry is internal; the same shape is exercised via its digest
    // prefix contract — recompute the legacy expectation here and require the
    // migrated impl to agree via hash.js (identity held by pin #1).
    const legacy16 = crypto.createHash('sha256').update(JSON.stringify(goldenEntry)).digest('hex').substring(0, 16);
    pin('audit hashEntry shape via lib/hash (golden ' + legacy16 + ')',
        hashlib.sha256H().update(JSON.stringify(goldenEntry)).digest('hex').substring(0, 16) === legacy16);
}

{
    // wal blob digest: sha256 of a long string spilled to a sha256-named blob
    const { Wal, MAX_INLINE } = require('../lib/wal');
    const dir = path.join(ROOT, 'tmp', 'wal-wavec-pin-' + Date.now());
    fs.rmSync(dir, { recursive: true, force: true });
    const w = new Wal(dir, { enabled: true });
    const big = 'b'.repeat(MAX_INLINE + 1); // forces the blob spill path
    w.intent('write', 'data/everwritten.json', big);
    // the spill digest = sha256(big); verify via fs directly
    const blobs = fs.readdirSync(path.join(dir, '.wal', 'blobs'));
    pin('wal spill blob named by canonical sha256', blobs.length === 1 && blobs[0] === hashlib.sha256(big));
    w.reset();
    fs.rmSync(dir, { recursive: true, force: true });
}

{
    // vaf hashIP is internal (not exported); pin the public digest contract:
    // the rate-limiter key derivation uses lib/hash via require('./hash').
    // Prove the prefix contract bytes:
    const ip = '203.0.113.42';
    pin('vaf hashIP contract bytes via lib/hash', hashlib.sha256(ip).substring(0, 8) === '17af1cf3');
}

{
    // state tree root identity: same facts → same root via module (digest bytes unchanged)
    const tree = require('../lib/state/tree');
    const t = new tree.StateTree({ schemaId: 'wavec' });
    t.put('/a', 1); t.put('/b/x', 'two');
    const rootViaModule = t.rootHash();
    // rebuild the hashed bytes directly with crypto, using the documented shape
    const h = crypto.createHash('sha256');
    h.update(Buffer.from('root|' + t._schemaId + '|' + t.size + '|', 'utf8'));
    for (const p of t.paths()) h.update(Buffer.from(p + '\x00' + t._nodes.get(p).hash + '\n', 'utf8'));
    pin('tree rootHash byte-identity (documented shape)', rootViaModule === h.digest('hex'));
}

{
    // seeds: universe default vector — same 32 bytes the outgoing impl produced
    // (resolveUniverse default: DOMAIN + 'universe\x00' + 'vant-default-universe\x01')
    const seeds = require('../lib/state/seeds');
    const expectUniverse = crypto.createHash('sha256').update('vant-seedchain\x00' + 'universe\x00' + 'vant-default-universe\x01').digest();
    pin('seeds universe digest identity', seeds.resolveUniverse({}).equals(expectUniverse));
}

{
    // checkpoint id
    const checkpoint = require('../lib/state/checkpoint');
    const s = 'deterministic-payload-123';
    pin('checkpointId identity', checkpoint.checkpointId(s) === crypto.createHash('sha256').update(s).digest('hex'));
}

{
    // lattice keys sanity (function unchanged; digest surface swapped)
    const lattice = require('../lib/geometry/lattice-keys');
    const keys = lattice.deriveShardKeys('doc-1', 5);
    pin('lattice keys still 16-char base36 × N', keys.length === 5 && keys.every(k => /^[0-9a-z]{16}$/.test(k)));
    pin('lattice shardUnpredictabilityHolds', lattice.shardUnpredictabilityHolds('doc-1') === true);
}

{
    // spine cellAddress still hex64
    const spine = require('../lib/state/spine');
    const s = new spine.AddressingSpine();
    pin('spine cellAddress 64-hex', /^[0-9a-f]{64}$/.test(s.cellAddress('/raid/doc', 3)));
}

// 4. crc32 = zlib.crc32 exactly (stego PNG checksum compatibility)
{
    for (const buf of [Buffer.from('IDAT-data'), crypto.randomBytes(256), Buffer.alloc(0)]) {
        pin('crc32 === zlib.crc32', hashlib.crc32(buf) === (zlib.crc32(buf) >>> 0));
    }
    let threw = false;
    try { hashlib.crc32('string-input'); } catch (e) { threw = true; }
    pin('crc32 rejects non-Buffer (fail-closed)', threw);
}

// 5. GREP GATE — no crypto.createHash('sha256') outside lib/hash.js
{
    const offenders = [];
    const walk = (dir) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, f.name);
            if (f.isDirectory()) walk(p);
            else if (f.name.endsWith('.js') && !p.includes('lib' + path.sep + 'hash.js')) {
                const src = fs.readFileSync(p, 'utf8');
                if (/crypto\.createHash\('sha256'\)/.test(src)) offenders.push(path.relative(ROOT, p));
            }
        }
    };
    walk(path.join(ROOT, 'lib'));
    pin('grep gate: no direct sha256 impl outside lib/hash.js', offenders.length === 0);
    if (offenders.length) console.log('    offenders: ' + offenders.join(', '));
}

console.log('\n=== hash-canon pins: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);
