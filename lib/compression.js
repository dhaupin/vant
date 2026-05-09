/**
 * Compress (v0.8.6)
 * Unified compression, serialization, entropy, vpatch
 *
 * Merged: compression + serializer + entropy patch
 */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// ==================== COMPRESSION ====================
function compress(data, algorithm = 'gzip') {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
    return algorithm === 'gzip' ? zlib.gzipSync(buf) : zlib.deflateSync(buf);
}

function decompress(data, algorithm = 'gzip') {
    return algorithm === 'gzip' ? zlib.gunzipSync(data) : zlib.inflateSync(data);
}

function compressLevel(data, level = 6) {
    return zlib.deflateSync(Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data)), { level });
}

// ==================== SERIALIZATION ====================
function serialize(data) {
    return JSON.stringify(data);
}

function deserialize(text) {
    try { return JSON.parse(text); } catch { return null; }
}

// ==================== ENTROPY/PATCH ====================
const LATENT_DIR = 'models/latent';
const DEFAULT_WINDOW_SIZE = 8;
const DEFAULT_THRESHOLD = 0.85;

function calculateShannonEntropy(buffer) {
    if (!buffer || buffer.length === 0) return 0;
    const freq = {};
    for (const byte of buffer) freq[byte] = (freq[byte] || 0) + 1;
    let entropy = 0;
    for (const k in freq) {
        const p = freq[k] / buffer.length;
        entropy -= p * Math.log2(p);
    }
    return entropy / Math.LOG2E;
}

function generateVpatch(buffer, options = {}) {
    const windowSize = options.windowSize || DEFAULT_WINDOW_SIZE;
    const threshold = options.threshold || DEFAULT_THRESHOLD;
    const windows = [];
    for (let i = 0; i < buffer.length; i += windowSize) {
        const win = buffer.slice(i, i + windowSize);
        const ent = calculateShannonEntropy(win);
        windows.push({ offset: i, entropy: ent, data: ent > threshold ? win.toString('base64') : null });
    }
    const patches = windows.filter(w => w.data);
    return { format: 'vpatch.1', windowSize, threshold, patches, originalSize: buffer.length };
}

function hydrateVpatch(vpatch) {
    const buffer = Buffer.alloc(vpatch.originalSize);
    for (const p of vpatch.patches) {
        const data = Buffer.from(p.data, 'base64');
        data.copy(buffer, p.offset);
    }
    return buffer;
}

// ==================== FRAMEWORK ====================
function getLayerStatus() {
    return { name: 'Compress', type: 'unified', enabled: true };
}

function isOperationAllowed(op) { return { allowed: true, layer: 'Compress' }; }
function getStatus() { return { enabled: true }; }

module.exports = {
    compress, decompress, compressLevel,
    serialize, deserialize,
    calculateShannonEntropy, generateVpatch, hydrateVpatch,
    getLayerStatus, isOperationAllowed, getStatus
};
