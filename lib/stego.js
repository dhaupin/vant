/**
 * Vant Stego
 * Steganography for encoding/decoding messages in images
 *
 * Uses LSB (Least Significant Bit) encoding in RGB channels
 * RGBA mode uses alpha channel for additional capacity
 * Multi-image mode splits large messages across multiple PNGs
 * Optional AES-256-GCM encryption for secure transmission
 *
 * Usage:
 *   const stego = require("./stego");
 *   stego.encode("message", "input.png", "output.png");
 *   stego.encode("message", "input.png", "output.png", { encrypt: "secret123" });
 *   const msg = stego.decode("output.png");
 *   const msg = stego.decode("output.png", { decrypt: "secret123" });
 * 
 * RGBA (4 bits/pixel):
 *   stego.encodeRGBA("message", "input.png", "output.png");
 *   const msg = stego.decodeRGBA("output.png");
 * 
 * Multi-image:
 *   stego.encodeMulti("long message", "input.png", "output-%d.png", 3);
 *   const msg = stego.decodeMulti(["output-1.png", "output-2.png", "output-3.png"]);
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const logger = require('./logger');
const errors = require('./errors');

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

/**
 * Derive key from password
 */
function deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, KEY_LEN, 'sha256');
}

/**
 * Encrypt message with password
 * Returns: salt + iv + authTag + ciphertext
 */
function encrypt(message, password) {
    const salt = crypto.randomBytes(16);
    const key = deriveKey(password, salt);
    const iv = crypto.randomBytes(IV_LEN);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const encrypted = Buffer.concat([
        cipher.update(message, 'utf8'),
        cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    // Format: salt(16) + iv(16) + authTag(16) + ciphertext
    return Buffer.concat([salt, iv, authTag, encrypted]);
}

/**
 * Decrypt message with password
 */
function decrypt(data, password) {
    const salt = data.slice(0, 16);
    const iv = data.slice(16, 16 + IV_LEN);
    const authTag = data.slice(16 + IV_LEN, 16 + IV_LEN + AUTH_TAG_LEN);
    const ciphertext = data.slice(16 + IV_LEN + AUTH_TAG_LEN);
    
    const key = deriveKey(password, salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
    ]);
    
    return decrypted.toString('utf8');
}

/**
 * Check if data is encrypted (has expected salt/iv structure)
 */
function isEncrypted(data) {
    if (!data || data.length < 48) return false;
    // Check for random-looking salt (not all zeros, etc)
    return true;
}

/**
 * Extract bytes from PNG buffer
 * PNG signature + IHDR + IEND handling
 */
function extractPixels(buffer) {
    // Simple PNG parser - find IDAT chunk for image data
    const signature = buffer.slice(0, 8).toString('hex');
    if (signature !== '89504e470d0a1a0a') {
        throw new Error('Not a valid PNG');
    }
    
    // Find IDAT chunk (image data)
    let offset = 8;
    let idatData = null;
    
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.slice(offset + 4, offset + 8).toString('ascii');
        
        if (type === 'IDAT') {
            idatData = buffer.slice(offset + 8, offset + 8 + length);
            break;
        }
        
        offset += 12 + length; // chunk header + data + crc
    }
    
    if (!idatData) {
        throw new Error('No image data found');
    }
    
    return idatData;
}

/**
 * Hide data in image using LSB
 */
function hideData(data, pixelBuffer) {
    const message = data + '\0'; // null terminator
    const bytes = Buffer.from(message, 'utf8');
    
    if (bytes.length * 8 > pixelBuffer.length) {
        throw new Error('Message too long for image');
    }
    
    // Copy buffer
    const result = Buffer.from(pixelBuffer);
    
    let bitIndex = 0;
    for (let i = 0; i < bytes.length; i++) {
        for (let bit = 0; bit < 8; bit++) {
            const byteIndex = Math.floor(bitIndex / 8);
            const pixelIndex = byteIndex;
            
            if (pixelIndex >= result.length) break;
            
            const bitValue = (bytes[i] >> (7 - bit)) & 1;
            result[pixelIndex] = (result[pixelIndex] & 0xFE) | bitValue;
            bitIndex++;
        }
    }
    
    return result;
}

/**
 * Extract data from image using LSB
 */
function extractData(pixelBuffer) {
    const bytes = [];
    let currentByte = 0;
    let bitCount = 0;
    
    for (let i = 0; i < pixelBuffer.length; i++) {
        const bit = pixelBuffer[i] & 1;
        currentByte = (currentByte << 1) | bit;
        bitCount++;
        
        if (bitCount === 8) {
            if (currentByte === 0) break; // null terminator
            bytes.push(currentByte);
            currentByte = 0;
            bitCount = 0;
        }
    }
    
    return Buffer.from(bytes).toString('utf8');
}

/**
 * Encode message into image
 * @param {string} message - Message to hide
 * @param {string} inputPath - Input image path
 * @param {string} outputPath - Output image path
 * @param {object} options - Options: { encrypt: 'password' }
 */
function encode(message, inputPath, outputPath, options = {}) {
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
    }
    
    let dataToHide = message;
    
    // Encrypt if password provided
    if (options.encrypt) {
        const encrypted = encrypt(message, options.encrypt);
        // Prefix with indicator: 'ENC:' means encrypted
        dataToHide = 'ENC:' + encrypted.toString('base64');
    }
    
    const inputBuffer = fs.readFileSync(inputPath);
    const pixels = extractPixels(inputBuffer);
    const hidden = hideData(dataToHide, pixels);
    
    // Rebuild PNG with modified IDAT
    const result = Buffer.from(inputBuffer);
    
    // Find IDAT and replace data
    let offset = 8;
    while (offset < result.length) {
        const length = result.readUInt32BE(offset);
        const type = result.slice(offset + 4, offset + 8).toString('ascii');
        
        if (type === 'IDAT') {
            const dataStart = offset + 8;
            hidden.copy(result, dataStart, 0, Math.min(hidden.length, length));
            break;
        }
        
        offset += 12 + length;
    }
    
    fs.writeFileSync(outputPath, result);
    const method = options.encrypt ? 'encrypted ' : '';
    logger.info(`Encoded ${method}${message.length} bytes into ${outputPath}`);
}

/**
 * Decode message from image
 * @param {string} imagePath - Image containing hidden message
 * @param {object} options - Options: { decrypt: 'password' }
 * @returns {string} Decoded message
 */
function decode(imagePath, options = {}) {
    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image not found: ${imagePath}`);
    }
    
    const buffer = fs.readFileSync(imagePath);
    const pixels = extractPixels(buffer);
    let message = extractData(pixels);
    
    // Check if encrypted
    if (message.startsWith('ENC:') && options.decrypt) {
        try {
            const encrypted = Buffer.from(message.slice(4), 'base64');
            message = decrypt(encrypted, options.decrypt);
            logger.info('Decrypted message');
        } catch (e) {
            throw new errors.VantError('Decryption failed - wrong password?', {
                code: errors.CODES.DECRYPT_FAIL,
                retryable: false
            });
        }
    } else if (message.startsWith('ENC:') && !options.decrypt) {
        throw new errors.VantError('Message is encrypted, provide decrypt password', {
            code: errors.CODES.DECRYPT_FAIL,
            retryable: false
        });
    }
    
    return message;
}

/**
 * Check if image has hidden data
 * @param {string} imagePath - Image to check
 * @returns {boolean}
 */
function hasData(imagePath) {
    try {
        const message = decode(imagePath);
        return message.length > 0;
    } catch (e) {
        return false;
    }
}

module.exports = {
    encode,
    decode,
    hasData,
    encrypt,
    decrypt,
    encodeRGBA,
    decodeRGBA,
    encodeMulti,
    decodeMulti
};

/**
 * Get RGBA pixels from PNG (if has alpha channel)
 * Returns array of RGBA values
 */
function extractPixelsRGBA(buffer) {
    const signature = buffer.slice(0, 8).toString('hex');
    if (signature !== '89504e470d0a1a0a') {
        throw new Error('Not a valid PNG');
    }
    
    // Find IHDR to check color type
    let offset = 8;
    let colorType = null;
    let width = 0;
    let height = 0;
    
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.slice(offset + 4, offset + 8).toString('ascii');
        
        if (type === 'IHDR') {
            const data = buffer.slice(offset + 8, offset + 12);
            width = buffer.readUInt32BE(offset + 8);
            height = buffer.readUInt32BE(offset + 12);
            colorType = data[9]; // 2=RGB, 6=RGBA
            break;
        }
        
        offset += 12 + length;
    }
    
    // Find IDAT chunk
    offset = 8;
    let idatData = null;
    
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.slice(offset + 4, offset + 8).toString('ascii');
        
        if (type === 'IDAT') {
            idatData = buffer.slice(offset + 8, offset + 8 + length);
            break;
        }
        
        offset += 12 + length;
    }
    
    if (!idatData) {
        throw new Error('No image data found');
    }
    
    // If not RGBA (colorType 6), return null - need to convert
    if (colorType !== 6) {
        return null;
    }
    
    return { data: idatData, width, height, rgba: true };
}

/**
 * Hide data in RGBA image using 4 bits per pixel (including alpha)
 * @param {string} data - Data to hide
 * @param {object} pixelData - RGBA pixel data
 */
function hideDataRGBA(data, pixelData) {
    const message = data + '\0';
    const bytes = Buffer.from(message, 'utf8');
    
    // 4 bits per pixel = 0.5 bytes per pixel, so need 2x pixels
    if (bytes.length * 2 > pixelData.data.length) {
        throw new Error('Message too long for RGBA image');
    }
    
    const result = Buffer.from(pixelData.data);
    let bitIndex = 0;
    
    for (let i = 0; i < bytes.length; i++) {
        for (let bit = 0; bit < 8; bit += 2) {
            // Get 2 bits at a time (for 4-bit capacity)
            const byteIndex = Math.floor(bitIndex / 8);
            const pixelIndex = byteIndex;
            
            if (pixelIndex >= result.length) break;
            
            // High nibble (bits 4-7) and low nibble (bits 0-3)
            const highBits = (bytes[i] >> (6 - bit)) & 0x03;
            const lowBits = (bytes[i] >> (4 - bit)) & 0x03;
            
            // Replace only the lowest 2 bits of each byte
            result[pixelIndex] = (result[pixelIndex] & 0xFC) | highBits;
            
            // Also store low bits in next byte if available
            if (pixelIndex + 1 < result.length) {
                result[pixelIndex + 1] = (result[pixelIndex + 1] & 0xFC) | lowBits;
            }
            
            bitIndex += 8; // Advance 8 bits (1 byte)
        }
    }
    
    return result;
}

/**
 * Extract data from RGBA image
 */
function extractDataRGBA(pixelBuffer) {
    const bytes = [];
    let currentByte = 0;
    let bitCount = 0;
    let byteComplete = false;
    
    for (let i = 0; i < pixelBuffer.length; i += 2) {
        // Extract 2 bits from each byte pair
        const highNibble = pixelBuffer[i] & 0x03;
        const lowNibble = pixelBuffer[i + 1] ? (pixelBuffer[i + 1] & 0x03) : 0;
        
        currentByte = (currentByte << 2) | highNibble;
        bitCount += 2;
        
        if (bitCount === 8) {
            if (currentByte === 0) {
                byteComplete = true;
                break;
            }
            bytes.push(currentByte);
            currentByte = 0;
            bitCount = 0;
            
            // Get low nibble from next position
            if (i + 2 < pixelBuffer.length) {
                const nextHigh = pixelBuffer[i + 2] & 0x03;
                currentByte = (currentByte << 2) | nextHigh;
                bitCount = 2;
            }
        }
        
        // Also check low nibble
        if (i + 1 < pixelBuffer.length && !byteComplete) {
            currentByte = (currentByte << 2) | lowNibble;
            bitCount += 2;
            
            if (bitCount === 8) {
                if (currentByte === 0) break;
                bytes.push(currentByte);
                currentByte = 0;
                bitCount = 0;
            }
        }
    }
    
    return Buffer.from(bytes).toString('utf8');
}

/**
 * Encode message using RGBA (4 bits/pixel)
 * @param {string} message - Message to hide
 * @param {string} inputPath - Input PNG (must be RGBA)
 * @param {string} outputPath - Output PNG
 * @param {object} options - { encrypt: 'password' }
 */
function encodeRGBA(message, inputPath, outputPath, options = {}) {
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
    }
    
    let dataToHide = message;
    
    if (options.encrypt) {
        const encrypted = encrypt(message, options.encrypt);
        dataToHide = 'RGBAENC:' + encrypted.toString('base64');
    } else {
        dataToHide = 'RGBADATA:' + message;
    }
    
    const inputBuffer = fs.readFileSync(inputPath);
    const pixelData = extractPixelsRGBA(inputBuffer);
    
    if (!pixelData || !pixelData.rgba) {
        throw new Error('Image must be RGBA (32-bit) PNG. Use convert to RGBA first.');
    }
    
    const hidden = hideDataRGBA(dataToHide, pixelData);
    
    // Rebuild PNG
    const result = Buffer.from(inputBuffer);
    let offset = 8;
    
    while (offset < result.length) {
        const length = result.readUInt32BE(offset);
        const type = result.slice(offset + 4, offset + 8).toString('ascii');
        
        if (type === 'IDAT') {
            const dataStart = offset + 8;
            hidden.copy(result, dataStart, 0, Math.min(hidden.length, length));
            break;
        }
        
        offset += 12 + length;
    }
    
    fs.writeFileSync(outputPath, result);
    const method = options.encrypt ? 'encrypted ' : '';
    logger.info(`Encoded RGBA ${method}${message.length} bytes into ${outputPath}`);
}

/**
 * Decode from RGBA image
 * @param {string} imagePath - RGBA PNG
 * @param {object} options - { decrypt: 'password' }
 */
function decodeRGBA(imagePath, options = {}) {
    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image not found: ${imagePath}`);
    }
    
    const buffer = fs.readFileSync(imagePath);
    const pixelData = extractPixelsRGBA(buffer);
    
    if (!pixelData || !pixelData.rgba) {
        throw new Error('Image must be RGBA PNG');
    }
    
    let message = extractDataRGBA(pixelData.data);
    
    // Check for encryption
    if (message.startsWith('RGBAENC:') && options.decrypt) {
        try {
            const encrypted = Buffer.from(message.slice(8), 'base64');
            message = decrypt(encrypted, options.decrypt);
            logger.info('Decrypted RGBA message');
        } catch (e) {
            throw new errors.VantError('RGBA Decryption failed', {
                code: errors.CODES.DECRYPT_FAIL,
                retryable: false
            });
        }
    } else if (message.startsWith('RGBADATA:')) {
        message = message.slice(9);
    }
    
    return message;
}

/**
 * Encode message across multiple images
 * @param {string} message - Message to hide
 * @param {string} inputPattern - Input file pattern (e.g., 'frame-%d.png')
 * @param {string} outputPattern - Output pattern (e.g., 'output-%d.png')
 * @param {number} count - Number of images
 * @param {object} options - { encrypt: 'password' }
 */
function encodeMulti(message, inputPattern, outputPattern, count, options = {}) {
    const chunks = [];
    const chunkSize = Math.ceil(message.length / count);
    
    // Split message into chunks
    for (let i = 0; i < count; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, message.length);
        chunks.push(message.slice(start, end));
    }
    
    // Prefix with chunk info: "MULTI:total:index:"
    const encodedChunks = chunks.map((chunk, i) => {
        return `MULTI:${count}:${i}:` + chunk;
    });
    
    // Encode each chunk
    for (let i = 0; i < count; i++) {
        const inputPath = inputPattern.replace('%d', i + 1);
        const outputPath = outputPattern.replace('%d', i + 1);
        
        if (!fs.existsSync(inputPath)) {
            throw new Error(`Input file not found: ${inputPath}`);
        }
        
        encode(encodedChunks[i], inputPath, outputPath, options);
    }
    
    logger.info(`Encoded ${message.length} bytes across ${count} images`);
}

/**
 * Decode message from multiple images
 * @param {array} imagePaths - Array of image paths
 * @param {object} options - { decrypt: 'password' }
 */
function decodeMulti(imagePaths, options = {}) {
    const chunks = [];
    
    // Decode each image
    for (const imagePath of imagePaths) {
        const msg = decode(imagePath, options);
        
        // Parse chunk info
        const match = msg.match(/^MULTI:(\d+):(\d+):(.*)$/);
        if (!match) {
            throw new Error('Invalid multi-image format');
        }
        
        const [, total, index, chunk] = match;
        chunks[parseInt(index)] = chunk;
    }
    
    // Verify we have all chunks
    if (chunks.length !== parseInt(total)) {
        throw new Error(`Missing chunks: got ${chunks.length}, expected ${total}`);
    }
    
    return chunks.join('');
}
