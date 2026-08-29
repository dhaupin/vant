/**
 * Vant Stego (v0.8.6)
 * WITH EVENT EMISSIONS - encode/decode operations emit globally
 * Steganography for encoding/decoding messages in images
 *
 * Uses LSB (Least Significant Bit) encoding in RGB channels
 * Optional AES-256-GCM encryption for secure transmission
 *
 * Usage:
 *   const stego = require('./stego');
 *   stego.encode('message', 'input.png', 'output.png');
 *   const msg = stego.decode('output.png');
 */

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

const fs = require('fs');
const path = require('path');
const Encrypt = require('./encrypt');
const errors = require('./error');

// Lazy-load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

function _checkRead() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canRead) {
        try {
            if (!sandbox.canRead()) {
                throw new errors.Error('Read permission required for stego operations', { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

function _checkWrite() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canWrite) {
        try {
            if (!sandbox.canWrite()) {
                throw new errors.Error('Write permission required for stego operations', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

/**
 * Extract pixels from image buffer
 * Supports PNG format
 */
function extractPixels(buffer) {
    // PNG signature check
    if (buffer.toString('ascii', 0, 8) !== '\x89PNG\r\n\x1a\n') {
        throw new errors.Error('Not a valid PNG file', { code: errors.CODES.STORAGE_FORMAT_INVALID, retryable: false });
    }

    // Parse IHDR chunk
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);

    // Simple pixel extraction
    return { width, height, buffer };
}

/**
 * Hide data in pixel buffer using LSB
 */
function hideData(data, pixelBuffer) {
    const dataBytes = Buffer.from(data, 'utf8');
    const dataLen = dataBytes.length;

    // Encode length in first 4 bytes
    const lenBytes = Buffer.alloc(4);
    lenBytes.writeUInt32BE(dataLen, 0);

    // Replace pixels with data
    for (let i = 0; i < dataLen + 4; i++) {
        const byte = i < 4 ? lenBytes[i] : dataBytes[i - 4];

        for (let bit = 0; bit < 8; bit++) {
            const pixelIdx = 54 + i * 8 + bit;
            if (pixelIdx >= pixelBuffer.length) break;

            const bitValue = (byte >> bit) & 1;
            pixelBuffer[pixelIdx] = (pixelBuffer[pixelIdx] & 0xFE) | bitValue;
        }
    }

    return pixelBuffer;
}

/**
 * Extract data from pixel buffer
 */
function extractData(pixelBuffer) {
    let len = 0;
    for (let i = 0; i < 4; i++) {
        const byte = pixelBuffer[54 + i * 8] & 1;
        len |= byte << i;
    }

    const dataBytes = Buffer.alloc(len);
    for (let i = 0; i < len; i++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
            const pixelIdx = 54 + (i + 4) * 8 + bit;
            if (pixelIdx >= pixelBuffer.length) break;

            const bitValue = pixelBuffer[pixelIdx] & 1;
            byte |= bitValue << bit;
        }
        dataBytes[i] = byte;
    }

    return dataBytes.toString('utf8');
}

/**
 * Encode message in image
 */
function encode(message, inputPath, outputPath, options = {}) {
    // VAF: Validate paths
    const vaf = require('./vaf');
    if (inputPath) {
        const inCheck = vaf.checkPathTraversal(inputPath);
        if (inCheck.blocked) {
            throw new errors.VantError('Path blocked', { code: errors.CODES.SECURITY_PATH_TRAVERSAL });
        }
    }
    if (outputPath) {
        const outCheck = vaf.checkPathTraversal(outputPath);
        if (outCheck.blocked) {
            throw new errors.VantError('Path blocked', { code: errors.CODES.SECURITY_PATH_TRAVERSAL });
        }
    }

    if (!fs.existsSync(inputPath)) {
        throw new errors.Error('Input image not found: ' + inputPath, { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
    }

    let data = message;

    if (options.password && options.encrypt !== false) {
        const encrypted = Encrypt.encode(message, options.password);
        data = 'ENC:' + encrypted;
    }

    data = 'BRN:' + data;

    const buffer = fs.readFileSync(inputPath);
    const pixels = extractPixels(buffer);
    const modified = hideData(data, Buffer.from(pixels.buffer));

    fs.writeFileSync(outputPath, Buffer.from(modified));

    // EVENT: encoded
    _emit('stego:encoded', { inputPath, outputPath, hasPassword: !!options.password, timestamp: Date.now() });

    return outputPath;
}

/**
 * Decode message from image
 */
function decode(imagePath, options = {}) {
    // VAF: Validate path
    const vaf = require('./vaf');
    if (imagePath) {
        const pathCheck = vaf.checkPathTraversal(imagePath);
        if (pathCheck.blocked) {
            throw new errors.VantError('Path blocked', { code: errors.CODES.SECURITY_PATH_TRAVERSAL });
        }
    }

    if (!fs.existsSync(imagePath)) {
        throw new errors.Error('Image not found: ' + imagePath, { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
    }

    const buffer = fs.readFileSync(imagePath);
    const pixels = extractPixels(Buffer.from(buffer.buffer));
    let data = extractData(Buffer.from(pixels.buffer));

    if (!data.startsWith('BRN:')) {
        throw new errors.Error('No hidden data found in image', { code: errors.CODES.STORAGE_DATA_NOT_FOUND, retryable: false });
    }

    data = data.slice(3);

    if (options.password && data.startsWith('ENC:') && options.decrypt !== false) {
        data = data.slice(4);
        data = Encrypt.decode(data, options.password);
    }

    if (options.decompress !== false) {
        data = Encrypt.decompress(data) || data;
    }

    // EVENT: decoded
    _emit('stego:decoded', { imagePath, length: data.length, timestamp: Date.now() });

    return data;
}

/**
 * Check if image has hidden data
 */
function hasData(imagePath) {
    if (!fs.existsSync(imagePath)) return false;

    try {
        const buffer = fs.readFileSync(imagePath);
        const pixels = extractPixels(Buffer.from(buffer.buffer));
        const data = extractData(Buffer.from(pixels.buffer));
        return data.startsWith('BRN:');
    } catch {
        return false;
    }
}

/**
 * Encode message to buffer
 */
function encodeToBuffer(message, password) {
    let data = 'BRN:' + message;
    if (password) {
        data = 'BRN:ENC:' + Encrypt.encode(message, password);
    }
    return Buffer.from(data, 'utf8');
}

/**
 * Decode message from buffer
 */
function decodeFromBuffer(buffer, password) {
    const data = buffer.toString('utf8');
    if (!data.startsWith('BRN:')) return null;

    let msg = data.slice(4);
    if (msg.startsWith('ENC:')) {
        msg = msg.slice(4);
        msg = Encrypt.decode(msg, pwd);
    }
    return { message: msg, password: pwd, bootstrap: meta.bootstrap, flags: meta.flags, extra: meta.extra };
}

/**
 * Generate manifest
 */
function generateManifest(options = {}) {
    return { version: '1.0', type: 'vant-horcrux', created: Date.now(), ...options };
}

/**
 * Create bootstrap string
 */
function createBootstrap(manifest, password) {
    const json = JSON.stringify(manifest);
    return password ? Encrypt.encode(json, password) : json;
}

/**
 * Parse bootstrap string
 */
function parseBootstrap(bootstrapStr, password) {
    const json = password ? Encrypt.decode(bootstrapStr, password) : bootstrapStr;
    return JSON.parse(json);
}

/**
 * Validate manifest
 */
function validateManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') {
        return { valid: false, error: 'Invalid manifest format' };
    }
    if (!manifest.version) {
        return { valid: false, error: 'Missing version' };
    }
    if (!manifest.type || manifest.type !== 'bootstrap') {
        return { valid: false, error: 'Invalid type' };
    }
    return { valid: true };
}

/**
 * Get image capacity
 */
function getCapacity(imagePath) {
    if (!fs.existsSync(imagePath)) {
        throw new errors.Error('Image not found: ' + imagePath, { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
    }
    const buffer = fs.readFileSync(imagePath);
    const pixels = extractPixels(Buffer.from(buffer.buffer));
    return Math.floor((pixels.width * pixels.height * 3) / 8);
}

/**
 * Encode brain chunked
 */
function encodeBrainChunked(imagePaths, options = {}) {
    return imagePaths.map(imagePath => ({ imagePath, capacity: getCapacity(imagePath) }));
}

/**
 * Decode brain chunked
 */
function decodeBrainChunked(imagePaths, options = {}) {
    const results = { messages: [], complete: false };
    for (const imagePath of imagePaths) {
        try {
            results.messages.push(decode(imagePath, options));
        } catch {
            // Continue
        }
    }
    return results;
}

function getGalleryIndex() {
    return { version: '0.8.6', type: 'gallery' };
}

/**
 * Encode message INTO SVG as hidden metadata
 * Embeds in <metadata><brn:secret> tag (stega namespace)
 *
 * @param message - secret message
 * @param svgContent - SVG string
 * @param password - optional encryption
 */
function encodeSvg(message, svgContent, password) {
    let data = 'BRN:' + message;
    if (password) {
        data = 'BRN:ENC:' + Encrypt.encode(message, password);
    }
    const b64 = Buffer.from(data, 'utf8').toString('base64');

    let svg = svgContent;

    // Clean existing
    svg = svg.replace(/<brn:secret>.*?<\/brn:secret>/gs, '');
    svg = svg.replace(/\s*<\/metadata>/g, '').replace(/<metadata>\s*/g, '');

    // Add namespace
    if (!svg.includes('xmlns:brn=')) {
        svg = svg.replace(/<svg[ >]/, '<svg xmlns:brn="urn:vant" ');
    }

    // Embed
    const meta = '<metadata><brn:secret>' + b64 + '</brn:secret></metadata>';
    svg = svg.replace('</svg>', meta + '\n</svg>');

    return svg;
}

/**
 * Decode secret message FROM SVG
 * Auto-detects password from filename if not provided
 *
 * Filename schema: p_[password]-b_[bootstrap]_[flags]_<extra>.[ext]
 *   p_       = password prefix
 *   -b_      = bootstrap (optional file to load next)
 *   -[flags]  = single char flags: e=encrypted, n=nested, d=diff
 *   _<extra>  = optional notes
 *
 * @param svgContent - SVG string
 * @param password - optional (or options object with filename)
 * @param options.filename - filename for extraction
 */
function decodeSvg(svgContent, password, options = {}) {
    let filename = typeof password === 'string' ? password : null;
    if (typeof password === 'object' && password) {
        filename = password.filename || null;
    }

    let meta = { password: null, bootstrap: null, flags: [], extra: null, raw: filename };

    // Parse rich filename: p_PASSWORD-b_BOOTSTRAP_FLAGS_EXTRA.ext
    // Examples: p_hello.svg, p_hello-b_ocean.svg, p_key-b_art-n_e_note.svg
    if (filename && filename.includes('_')) {
        const parts = filename.replace(/\.[^.]+$/, '').split(/[-_]/);

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];

            // p_PASSWORD
            if (part === 'p' && parts[i + 1]) {
                meta.password = parts[i + 1];
                i++; // skip next
            }
            // b_BOOTSTRAP
            else if (part === 'b' && parts[i + 1]) {
                meta.bootstrap = parts[i + 1];
                i++;
            }
            // flags: single chars after bootstrap
            else if (part.length === 1 && /[endcv]/i.test(part)) {
                meta.flags.push({ flag: part, enabled: true });
            }
            // anything else = extra
            else if (part && !meta.password && !meta.bootstrap) {
                meta.extra = part;
            }
        }
    }

    // Fallback to simple pattern
    if (!meta.password && filename) {
        const simple = /(?:password|secret|neuron|public)_is_(.+)\.[^.]+\./i.exec(filename);
        if (simple) meta.password = simple[1];
    }

    // Now decode with extracted password OR direct password argument
    const pwd = meta.password || (typeof password === 'string' ? password : null);

    const match = svgContent.match(/<brn:secret>([A-Za-z0-9+\/=]+)<\/brn:secret>/);
    if (!match) return null;

    const buf = Buffer.from(match[1], 'base64');
    const data = buf.toString('utf8');

    if (!data.startsWith('BRN:')) return null;

    let msg = data.slice(4);
    if (msg.startsWith('ENC:')) {
        // Encrypted data - require password
        if (!pwd) {
            return { error: 'Password required for encrypted data' };
        }
        msg = msg.slice(4);
        try {
            msg = Encrypt.decode(msg, pwd);
        } catch (e) {
            return { error: 'Decryption failed: ' + e.message };
        }
    } else {
        // No ENC: prefix - plaintext is NOT allowed anymore
        // All data must be encrypted
        return { error: 'Invalid format: encrypted data required' };
    }

    return { message: msg, password: pwd, bootstrap: meta.bootstrap, flags: meta.flags, extra: meta.extra };
}

module.exports = {
    version: '0.8.6',
    encode,
    decode,
    hasData,
    encodeToBuffer,
    decodeFromBuffer,
    encodeSvg,
    decodeSvg,
    generateManifest,
    createBootstrap,
    parseBootstrap,
    validateManifest,
    getCapacity,
    encodeBrainChunked,
    decodeBrainChunked,
    getGalleryIndex,
    getIndex: () => ({ version: "1.0" }),
    encodeBrain: encode,
    decodeBrain: decode,
    getLayerStatus: () => ({ name: 'Stego', type: 'stego', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true })
};
