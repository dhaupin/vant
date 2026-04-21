/**
 * Vant Stego
 * Steganography for encoding/decoding messages in images
 * 
 * Uses LSB (Least Significant Bit) encoding in RGB channels
 * Optional AES-256-GCM encryption for secure transmission
 * 
 * Usage:
 *   const stego = require('./stego');
 *   stego.encode('message', 'input.png', 'output.png');
 *   stego.encode('message', 'input.png', 'output.png', { encrypt: 'secret123' });
 *   const msg = stego.decode('output.png');
 *   const msg = stego.decode('output.png', { decrypt: 'secret123' });
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vaf = require("./vaf")
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
    vaf.check(message, {type: "string", name: "message", maxLength: 10000});
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

/**
 * Encode message to buffer (in-memory, no file I/O)
 * @param {string} message - Message to encode
 * @param {string} password - Optional encryption password
 * @returns {Buffer} PNG buffer with hidden message
 */
function encodeToBuffer(message, password) {
    let dataToHide = message;
    
    // Encrypt if password provided
    if (password) {
        const encrypted = encrypt(message, password);
        dataToHide = 'ENC:' + encrypted.toString('base64');
    }
    
    // Create 1x1 PNG with hidden data
    const header = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, // IHDR length
        0x49, 0x48, 0x44, 0x52, // IHDR
        0x00, 0x00, 0x00, 0x01, // width: 1
        0x00, 0x00, 0x00, 0x01, // height: 1
        0x08, 0x02, // bit depth: 8, color type: RGB
        0x00, 0x00, 0x00, // compression, filter, interlace
        0x90, 0x77, 0x53, 0xDE // CRC
    ]);
    
    // Encode data into pixels
    const pixelData = [];
    for (let i = 0; i < dataToHide.length; i++) {
        const code = dataToHide.charCodeAt(i);
        pixelData.push(code >> 8, code & 0xFF, (code >> 4) & 0xFF);
    }
    
    // Pad to minimum size
    while (pixelData.length < 12) {
        pixelData.push(0);
    }
    
    const idatData = Buffer.from(pixelData.slice(0, 12));
    const idatLen = Buffer.alloc(4);
    idatLen.writeUInt32BE(idatData.length, 0);
    
    // Simple CRC
    const crc = require('zlib').crc32(Buffer.concat([Buffer.from('IDAT'), idatData]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc >>> 0, 0);
    
    const iend = Buffer.from([
        0x00, 0x00, 0x00, 0x00, // length: 0
        0x49, 0x45, 0x4E, 0x44, // IEND
        0xAE, 0x42, 0x60, 0x82 // CRC
    ]);
    
    return Buffer.concat([header, idatLen, idatData, crcBuf, iend]);
}

/**
 * Decode message from buffer (in-memory)
 * @param {Buffer} buffer - PNG buffer with hidden message
 * @param {string} password - Optional decryption password
 * @returns {string} Decoded message
 */
function decodeFromBuffer(buffer, password) {
    // Find IDAT data
    let offset = 8;
    let idatData = null;
    while (offset < buffer.length - 8) {
        const len = buffer.readUInt32BE(offset);
        const type = buffer.slice(offset + 4, offset + 8).toString('ascii');
        if (type === 'IDAT') {
            idatData = buffer.slice(offset + 8, offset + 8 + len);
            break;
        }
        offset += 12 + len;
    }
    
    if (!idatData) {
        return '';
    }
    
    let message = '';
    for (let i = 0; i < idatData.length; i += 3) {
        const ch = ((idatData[i] & 0xFF) << 8) | (idatData[i + 1] & 0xFF);
        if (ch !== 0) {
            message += String.fromCharCode(ch);
        }
    }
    
    // Decrypt if needed
    if (password && message.startsWith('ENC:')) {
        const encrypted = Buffer.from(message.slice(4), 'base64');
        message = decrypt(encrypted, password);
    }
    
    return message.trim();
}

module.exports = {
    encode,
    decode,
    hasData,
    encrypt,
    decrypt,
    encodeToBuffer,
    decodeFromBuffer
};