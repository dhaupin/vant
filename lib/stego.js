/**
 * Vant Stego
 * Steganography for encoding/decoding messages in images
 * 
 * Uses LSB (Least Significant Bit) encoding in RGB channels
 * 
 * Usage:
 *   const stego = require('./stego');
 *   stego.encode('message', 'input.png', 'output.png');
 *   const msg = stego.decode('output.png');
 */

const fs = require('fs');
const path = require('path');

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
 */
function encode(message, inputPath, outputPath) {
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
    }
    
    const inputBuffer = fs.readFileSync(inputPath);
    const pixels = extractPixels(inputBuffer);
    const hidden = hideData(message, pixels);
    
    // Rebuild PNG with modified IDAT
    // For simplicity, we modify the buffer directly
    // A proper implementation would rebuild the whole PNG
    const result = Buffer.from(inputBuffer);
    
    // Find IDAT and replace data
    let offset = 8;
    while (offset < result.length) {
        const length = result.readUInt32BE(offset);
        const type = result.slice(offset + 4, offset + 8).toString('ascii');
        
        if (type === 'IDAT') {
            const dataStart = offset + 8;
            const dataEnd = dataStart + length;
            hidden.copy(result, dataStart, 0, Math.min(hidden.length, length));
            break;
        }
        
        offset += 12 + length;
    }
    
    fs.writeFileSync(outputPath, result);
    console.log(`[Stego] Encoded ${message.length} bytes into ${outputPath}`);
}

/**
 * Decode message from image
 * @param {string} imagePath - Image containing hidden message
 * @returns {string} Decoded message
 */
function decode(imagePath) {
    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image not found: ${imagePath}`);
    }
    
    const buffer = fs.readFileSync(imagePath);
    const pixels = extractPixels(buffer);
    const message = extractData(pixels);
    
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
    hasData
};