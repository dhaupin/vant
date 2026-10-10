'use strict';

/**
 * Canonical Serialization Contract (#146)
 * ========================================
 *
 * One canonical encoder, used by every write in the state spine. Without
 * this, "same state" hashes differently after a disk round-trip and every
 * dedup/anchor/diff idea built on top silently poisons.
 *
 * Rules (issue #146 thesis):
 *   1. keys sorted lexicographically at every nesting level
 *   2. numbers: integers as integers; floats via a decimal-string contract
 *      (`Number.toFixed` is NOT it — shortest-roundtrip repr is)
 *   3. strings length-prefixed UTF-8, arrays in order, dicts sorted-key
 *   4. every node's hash input is prefixed with its (path, schemaId) —
 *      schema changes change hashes; runtime object identity NEVER appears
 *
 * Wire format (fully self-describing, decode is a real parser):
 *   'z' null          't' true          'F' false
 *   's' <u32 len> <utf8 bytes>          string
 *   'n' <u32 len> <decimal string>      number (int or float, shortest form)
 *   'A' <u32 count> <elements...>       array
 *   'D' <u32 count> <key value ...>     dict (keys already sorted by encode)
 *
 * Engine-parity series (state core, 2/4).
 */

const crypto = require('crypto');

/** Schema-ids derived from code identity (file path), never runtime ids. */
const SCHEMA_IDS = {
    VALUE: 'lib/state/canonical.js@1',          // any JSON-compatible value
    NODE: 'lib/state/canonical.js@1/node',      // a tree node record
    DELTA: 'lib/state/canonical.js@1/delta',    // provenance-stamped delta record
    ANCHOR: 'lib/state/canonical.js@1/anchor'   // anchor ledger entry
};

const TAG_NULL = 0x7A;  // z
const TAG_TRUE = 0x74;  // t
const TAG_FALSE = 0x46; // F
const TAG_STR = 0x73;   // s
const TAG_NUM = 0x6E;   // n
const TAG_ARR = 0x41;   // A
const TAG_DICT = 0x44;  // D

function _vantErr(msg, code) {
    return new (require('../error').VantError)(msg, { code, retryable: false });
}

function _encodeFloat(n) {
    // -0 must equal 0 (Object.is contract would otherwise split hashes)
    if (Object.is(n, -0)) n = 0;
    if (!Number.isFinite(n)) {
        throw _vantErr('canonical.encode: non-finite number ' + String(n) +
            ' — state values must be finite', 'E_CANONICAL_TYPE');
    }
    return n.toString(10);
}

function _pushLen(chunks, len) {
    if (len > 0xFFFFFFFF) throw _vantErr('canonical.encode: value too large', 'E_CANONICAL_TYPE');
    const b = Buffer.alloc(4);
    b.writeUInt32BE(len);
    chunks.push(b);
}

/**
 * Canonical encode a JSON-compatible value to bytes. Deterministic across
 * processes: same logical value → same bytes, regardless of key insertion
 * order, object identity, or float representation source.
 */
function encode(value) {
    const chunks = [];
    _encodeInto(value, chunks);
    return Buffer.concat(chunks);
}

function _encodeInto(value, chunks) {
    if (value === null) { chunks.push(Buffer.from([TAG_NULL])); return; }
    const t = typeof value;
    if (t === 'string') {
        const b = Buffer.from(value, 'utf8');
        chunks.push(Buffer.from([TAG_STR]));
        _pushLen(chunks, b.length);
        chunks.push(b);
        return;
    }
    if (t === 'number') {
        const s = Buffer.from(_encodeFloat(value), 'utf8');
        chunks.push(Buffer.from([TAG_NUM]));
        _pushLen(chunks, s.length);
        chunks.push(s);
        return;
    }
    if (t === 'boolean') { chunks.push(Buffer.from([value ? TAG_TRUE : TAG_FALSE])); return; }
    if (t === 'object') {
        if (Array.isArray(value)) {
            chunks.push(Buffer.from([TAG_ARR]));
            _pushLen(chunks, value.length);
            for (const item of value) _encodeInto(item, chunks);
            return;
        }
        // Plain objects only — class instances (Date, Map, Buffer...) are not
        // part of the state contract; their runtime identity would poison
        // hashes. Reject loudly rather than silently coercing.
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) {
            throw _vantErr('canonical.encode: non-plain object of type ' +
                (value.constructor && value.constructor.name) +
                ' — state values must be JSON-compatible plain data', 'E_CANONICAL_TYPE');
        }
        const keys = Object.keys(value).sort();
        chunks.push(Buffer.from([TAG_DICT]));
        _pushLen(chunks, keys.length);
        for (const k of keys) {
            _encodeInto(k, chunks);
            _encodeInto(value[k], chunks);
        }
        return;
    }
    // undefined, function, symbol, bigint
    throw _vantErr('canonical.encode: unsupported value type ' + t, 'E_CANONICAL_TYPE');
}

/**
 * Decode canonical bytes back to a plain value. Roundtrip law:
 * encode(decode(encode(x))) === encode(x) for every encodable x.
 */
function decode(buf) {
    if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
    const r = { buf, off: 0 };
    const v = _decodeValue(r);
    if (r.off !== r.buf.length) {
        throw _vantErr('canonical.decode: ' + (r.buf.length - r.off) +
            ' trailing bytes after top-level value', 'E_CANONICAL_DECODE');
    }
    return v;
}

function _readLen(r) {
    if (r.off + 4 > r.buf.length) {
        throw _vantErr('canonical.decode: truncated length prefix', 'E_CANONICAL_DECODE');
    }
    const v = r.buf.readUInt32BE(r.off);
    r.off += 4;
    return v;
}

function _decodeValue(r) {
    if (r.off >= r.buf.length) {
        throw _vantErr('canonical.decode: truncated (missing tag)', 'E_CANONICAL_DECODE');
    }
    const tag = r.buf[r.off++];
    switch (tag) {
        case TAG_NULL: return null;
        case TAG_TRUE: return true;
        case TAG_FALSE: return false;
        case TAG_STR: {
            const len = _readLen(r);
            if (r.off + len > r.buf.length) {
                throw _vantErr('canonical.decode: truncated string', 'E_CANONICAL_DECODE');
            }
            const s = r.buf.slice(r.off, r.off + len).toString('utf8');
            r.off += len;
            return s;
        }
        case TAG_NUM: {
            const len = _readLen(r);
            if (r.off + len > r.buf.length) {
                throw _vantErr('canonical.decode: truncated number', 'E_CANONICAL_DECODE');
            }
            const s = r.buf.slice(r.off, r.off + len).toString('utf8');
            r.off += len;
            const n = Number(s);
            if (Number.isNaN(n) && s !== 'NaN') {
                throw _vantErr('canonical.decode: bad number ' + JSON.stringify(s), 'E_CANONICAL_DECODE');
            }
            return n;
        }
        case TAG_ARR: {
            const n = _readLen(r);
            const arr = new Array(n);
            for (let i = 0; i < n; i++) arr[i] = _decodeValue(r);
            return arr;
        }
        case TAG_DICT: {
            const n = _readLen(r);
            const obj = {};
            for (let i = 0; i < n; i++) {
                const k = _decodeValue(r);
                if (typeof k !== 'string') {
                    throw _vantErr('canonical.decode: dict key not a string', 'E_CANONICAL_DECODE');
                }
                obj[k] = _decodeValue(r);
            }
            return obj;
        }
        default:
            throw _vantErr('canonical.decode: unknown tag 0x' + tag.toString(16), 'E_CANONICAL_DECODE');
    }
}

/**
 * Canonical hash of a value (hex). Deterministic across processes.
 * (Wave C) digest via lib/hash.js — identical bytes, canonical surface.
 */
function hash(value) {
    return require('../hash').sha256H().update(encode(value)).digest('hex');
}

/**
 * Node hash input: prefixed with (path, schemaId) per rule 4.
 * Two nodes with equal values but different paths/schemaIds differ;
 * schema-id changes change hashes; runtime object ids never appear.
 */
function nodeHash(path, schemaId, value) {
    const h = require('../hash').sha256H();
    h.update(Buffer.from('n|' + path + '|' + schemaId + '|', 'utf8'));
    h.update(encode(value));
    return h.digest('hex');
}

module.exports = {
    SCHEMA_IDS,
    encode,
    decode,
    hash,
    nodeHash
};
