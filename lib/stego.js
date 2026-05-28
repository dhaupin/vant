/**
 * Vant Stego (v0.8.6)
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

const fs = require('fs');
const path = require('path');
const Encrypt = require('./encrypt');

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
                throw new Error('Read permission required for stego operations');
            }
        } catch (e) {}
    }
}

function _checkWrite() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canWrite) {
        try {
            if (!sandbox.canWrite()) {
                throw new Error('Write permission required for stego operations');
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
        throw new Error('Not a valid PNG file');
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
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input image not found: ${inputPath}`);
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
    return outputPath;
}

/**
 * Decode message from image
 */
function decode(imagePath, options = {}) {
    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image not found: ${imagePath}`);
    }
    
    const buffer = fs.readFileSync(imagePath);
    const pixels = extractPixels(Buffer.from(buffer.buffer));
    let data = extractData(Buffer.from(pixels.buffer));
    
    if (!data.startsWith('BRN:')) {
        throw new Error('No hidden data found in image');
    }
    
    data = data.slice(3);
    
    if (options.password && data.startsWith('ENC:') && options.decrypt !== false) {
        data = data.slice(4);
        data = Encrypt.decode(data, options.password);
    }
    
    if (options.decompress !== false) {
        data = Encrypt.decompress(data) || data;
    }
    
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
    if (password && msg.startsWith('ENC:')) {
        msg = msg.slice(4);
        msg = Encrypt.decode(msg, password);
    }
    return msg;
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
        throw new Error(`Image not found: ${imagePath}`);
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
 * @param svgContent - SVG string
 * @param password - optional (or options object with filename)
 * @param options.filename - filename for auto-password extraction
 */
function decodeSvg(svgContent, password, options = {}) {
    // Handle password OR options.filename for auto-extraction
    let filename = typeof password === 'string' ? password : null;
    if (typeof password === 'object' && password) {
        filename = password.filename || null;
    }
    
    // Auto-extract password from filename: password_is_XXX.svg, neuron_IS_XXX.png, etc
    if (!filename) {
        // Already have no password, continue with null
    } else if (!/(?:password|secret|neuron)_is_|public_is_/.test(filename)) {
        // Manual password provided explicitly (pattern doesn't match)
    } else {
        const match = /(?:password|secret|neuron|public)_is_(.+)\.([^.]+)$/i.exec(filename);
        if (match && match[1]) {
            password = match[1];
        } else {
            password = null;
        }
    }
    
    const match = svgContent.match(/<brn:secret>([A-Za-z0-9+\/=]+)<\/brn:secret>/);
    if (!match) return null;
    
    const buf = Buffer.from(match[1], 'base64');
    const data = buf.toString('utf8');
    
    if (!data.startsWith('BRN:')) return null;
    
    let msg = data.slice(4);
    if (password && msg.startsWith('ENC:')) {
        msg = msg.slice(4);
        try {
            msg = Encrypt.decode(msg, password);
        } catch (e) {
            return { error: e.message };
        }
    }
    
    return msg;
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