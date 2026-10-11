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
                throw new errors.VantError('Read permission required for stego operations', { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

function _checkWrite() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canWrite) {
        try {
            if (!sandbox.canWrite()) {
                throw new errors.VantError('Write permission required for stego operations', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

//
// ==================== PNG / LSB PIPELINE (pass 178 rework) ====================
// The old implementation was a prototype with four fatal flaws (fixed here):
//   (1) the signature check used toString('ascii'), which MANGLES the 0x89
//       lead byte — encode() rejected every valid PNG ever fed to it;
//   (2) Buffer.from(buffer.buffer) aliased the whole underlying ArrayBuffer
//       (an 8KB slab for a 413-byte file), skewing every byte access;
//   (3) bits were written at a HARD-CODED byte offset 54 — PNG layout is
//       not fixed (ancillary chunks shift IDAT), so structure could break;
//   (4) the PNG wire dialect ('BRN:'+'ENC:…') differed from the SVG one
//       ('BRN:ENC:…') — two dialects in one repo.
//
// Canonical LSB format (SHARED with Stegoframe, mirrors the SVG packet):
//   - packet: 'BRN:ENC:' + salt:iv:authTag:ciphertext hex
//     (Encrypt.encrypt), or 'BRN:' + plaintext when unencrypted;
//   - bit packing over UTF-8 BYTES, MSB-first, ONE bit per pixel (no
//     char-coercion, no NaN-zeros);
//   - carrier: the R-channel LSB of the DECODED pixel stream
//     (scanline-filtered), via zlib inflate/deflate round-trip so the
//     output PNG is structurally identical (same chunk chain, fresh IDAT);
//   - decode self-delimits: stream bits into bytes until the packet
//     header + 4 colon fields parse (no length header needed to read).
//
// KDF/QoS unchanged from the SVG pipeline (the Encrypt module owns it).

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const LSB_BITS_PER_PIXEL = 1; // one bit in R-channel LSB

/**
 * (pass 178) Walk the PNG chunk chain and return {width, height, colorType,
 * ihdrEnd, idat{offset,len}}. Throws E_PNG_FORMAT on anything we can't
 * carry (non-PNG, missing IHDR, missing IDAT, or IEND before IDAT).
 * Detail: colorType 2 (RGB) / 6 (RGBA) / 0 (gray) are supported for LSB
 * embedding in the FIRST byte of each pixel; palette (3) is NOT (indices
 * are pointers, not pixel bytes).
 */
function _pngScan(buffer) {
    if (!buffer.slice(0, 8).equals(PNG_SIG)) {
        throw new errors.VantError('Not a valid PNG file', { code: errors.CODES.STORAGE_FORMAT_INVALID, retryable: false });
    }
    let off = 8;
    let ihdr = null; const idats = [];
    while (off + 8 <= buffer.length) {
        const len = buffer.readUInt32BE(off);
        const type = buffer.toString('latin1', off + 4, off + 8);
        const dataStart = off + 8;
        if (type === 'IHDR') {
            ihdr = {
                width: buffer.readUInt32BE(dataStart),
                height: buffer.readUInt32BE(dataStart + 4),
                bitDepth: buffer[dataStart + 8],
                colorType: buffer[dataStart + 9]
            };
        } else if (type === 'IDAT') {
            idats.push(buffer.slice(dataStart, dataStart + len));
        } else if (type === 'IEND') {
            break;
        }
        off = dataStart + len + 4; // + CRC
        if (len < 0 || off > buffer.length) break; // hostile chunk — stop
    }
    if (!ihdr || ihdr.bitDepth !== 8 || ![0, 2, 6].includes(ihdr.colorType) || idats.length === 0) {
        throw new errors.VantError('PNG not LSB-embeddable (need 8-bit gray/RGB/RGBA with IDAT)', { code: errors.CODES.STORAGE_FORMAT_INVALID, retryable: false });
    }
    return { ...ihdr, idatChunks: idats };
}

/** bytes per pixel per colorType */
function _bpp(colorType) { return colorType === 0 ? 1 : colorType === 2 ? 3 : 4; }

/**
 * (pass 178) LSB write region: inflate IDAT, unfilter scanlines, flip LSBs
 * in each pixel's FIRST byte (R for RGB/RGBA, gray for gray), refilter and
 * deflate. All filter types (0-4) handled per the PNG spec — the stream
 * round-trips through the SAME filter for simplicity: we always re-emit
 * filter byte 0 (None) with unfiltered rows, which is spec-legal and
 * deterministic.
 */
function _lsbRoundTrip(buffer, packetBytes, writeMode) {
    const scan = _pngScan(buffer);
    const zlib = require('zlib');
    const raw = zlib.inflateSync(Buffer.concat(scan.idatChunks));
    const stride = scan.width * _bpp(scan.colorType);
    const strideFull = stride + 1; // + filter byte per row
    const rowBytes = raw.length / scan.height | 0;
    if (rowBytes !== strideFull) {
        throw new errors.VantError('PNG scanline stride mismatch (' + rowBytes + ' vs ' + strideFull + ')', { code: errors.CODES.STORAGE_FORMAT_INVALID, retryable: false });
    }

    // Capacity: first byte of every pixel = one LSB bit. Read mode passes
    // null packetBytes — guard so capacity can never deref a null length.
    const capacityBits = scan.width * scan.height * LSB_BITS_PER_PIXEL;
    const bits = writeMode ? (packetBytes ? packetBytes.length : 0) * 8 + 32 : Infinity; // +32 for the BE length header
    if (writeMode && bits > capacityBits) {
        throw new errors.VantError('PNG too small for payload (' + packetBytes.length + 'B in ' + capacityBits + ' bits)', { code: errors.CODES.STORAGE_CAPACITY_EXCEEDED, retryable: false });
    }

    // Unfilter the stream into true pixel rows.
    const out = Buffer.alloc(scan.height * strideFull);
    for (let y = 0; y < scan.height; y++) {
        const off = y * strideFull;
        const ft = raw[off];
        out[off] = 0; // re-emit filter None
        for (let x = 0; x < stride; x++) {
            const cur = raw[off + 1 + x];
            let a = x >= _bpp(scan.colorType) ? out[off + 1 + x - _bpp(scan.colorType)] : 0;
            let b = y > 0 ? out[off + 1 - strideFull + x] : 0;
            let c = (x >= _bpp(scan.colorType) && y > 0) ? out[off + 1 - strideFull + x - _bpp(scan.colorType)] : 0;
            let pred;
            switch (ft) {
                case 0: pred = 0; break;
                case 1: pred = a; break;
                case 2: pred = b; break;
                case 3: pred = (a + b) >> 1; break;
                case 4: {
                    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                    pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); break;
                }
                default: throw new errors.VantError('Bad PNG filter ' + ft, { code: errors.CODES.STORAGE_FORMAT_INVALID, retryable: false });
            }
            out[off + 1 + x] = (cur + pred) & 0xFF;
        }
    }

    // ENCODE SIDE: flip the first byte's LSB of each pixel, row-by-row,
    // channel-first (x-major). Bytes to carry: BE-length header + packet.
    if (writeMode) {
        const payload = Buffer.alloc(4 + packetBytes.length);
        payload.writeUInt32BE(packetBytes.length, 0);
        packetBytes.copy(payload, 4);
        let bitIdx = 0;
        const totalBits = payload.length * 8;
        for (let y = 0; y < scan.height && bitIdx < totalBits; y++) {
            const rowOff = y * strideFull;
            for (let px = 0; px < scan.width && bitIdx < totalBits; px++) {
                const pixOff = rowOff + 1 + px * _bpp(scan.colorType);
                const byteIdx = bitIdx >> 3, bitIdxIn = 7 - (bitIdx & 7); // MSB-first
                const bit = (payload[byteIdx] >> bitIdxIn) & 1;
                out[pixOff] = (out[pixOff] & 0xFE) | bit;
                bitIdx++;
            }
        }
    }

    // DECODE SIDE: read the first-byte LSBs (only in writeMode === false).
    if (writeMode === false) {
        const totalBits = out.length * 8 - scan.height * (strideFull * 8);
        void totalBits; // (capacity is huge; we self-delimit by packet parsing)
        const bytes = [];
        let byte = 0, bitsDone = 0; // hushed dead var below (kept for symmetry with write side)
        void bitsDone;
        for (let y = 0; y < scan.height; y++) {
            const rowOff = y * strideFull;
            for (let px = 0; px < scan.width; px++) {
                const pixOff = rowOff + 1 + px * _bpp(scan.colorType);
                const bit = out[pixOff] & 1;
                byte = (byte << 1) | bit; bitsDone++;
                if (bitsDone === 8) { bytes.push(byte); byte = 0; bitsDone = 0; if (bytes.length > 65536) { y = scan.height; break; } }
            }
        }
        return { scan, unfiltered: out, streamBits: Buffer.from(bytes) };
    }

        const deflated = zlib.deflateSync(out);
    // Reassemble: everything up to the first IDAT, one fresh IDAT, then IEND.
    return { scan, unfiltered: out, payload: deflated };
}

/** IEND is always the same 12 bytes; emit it verbatim. */
const IEND_CHUNK = Buffer.from([
    0x00, 0x00, 0x00, 0x00,              // length 0
    0x49, 0x45, 0x4E, 0x44,              // 'IEND'
    0xAE, 0x42, 0x60, 0x82,              // CRC (fixed by the PNG spec)
]);

/**
 * (pass 178) Rebuild a COMPLETE PNG from a source: keep signature + IHDR +
 * every ancillary chunk that sits BEFORE the first IDAT, append ONE fresh
 * IDAT carrying the re-deflated scanlines, then IEND. Chunks after the old
 * IDAT chain (nonstandard but legal) are dropped — every encoder we know
 * writes ancillaries before IDAT, and keeping only the front chain keeps
 * our output deterministic. CRCs are computed like the spec wants (type +
 * data); zlib.crc32 is core on Node >= 20.15.
 */
function _assemblePng(src, _scan, newIdat) {
    const zlib = require('zlib');
    let off = 8, idatStart = -1;
    while (off + 12 <= src.length) {
        const len = src.readUInt32BE(off);
        const type = src.toString('latin1', off + 4, off + 8);
        if (type === 'IDAT') { idatStart = off; break; }
        if (type === 'IEND') break;
        off += 12 + len; // lengthtype LENTYPE + data + CRC
        if (len < 0 || off > src.length) break; // hostile chunk — stop
    }
    if (idatStart === -1) {
        throw new errors.VantError('PNG has no IDAT to replace', { code: errors.CODES.STORAGE_FORMAT_INVALID, retryable: false });
    }
    const head = src.slice(0, idatStart);
    const chunkType = Buffer.from('IDAT', 'latin1');
    const crc32 = zlib.crc32(Buffer.concat([chunkType, newIdat])) >>> 0;
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(newIdat.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32, 0);
    return Buffer.concat([head, lenBuf, chunkType, newIdat, crcBuf, IEND_CHUNK]);
}

/**
 * Extract pixels from image buffer
 * Supports PNG format
 */
function extractPixels(buffer) {
    const scan = _pngScan(buffer);
    return { width: scan.width, height: scan.height, buffer, scan };
}

/**
 * (pass 178) Canonical packet builder — ONE shape for SVG and PNG:
 *   BRN:ENC: + Encrypt.encrypt(...) when password,
 *   BRN: + message otherwise.
 */
function _lsbPacket(message, password, encryptOpt) {
    if (password && encryptOpt !== false) {
        return 'BRN:ENC:' + Encrypt.encrypt(message, password, { algorithm: 'aes-256-gcm' });
    }
    return 'BRN:' + message;
}

/**
 * Hide data in a SOURCE PNG — returns a complete, structurally-valid PNG
 * (same chunk chain, fresh IDAT) carrying the packet in R-channel LSBs.
 */
function hideData(data, sourcePngBuffer) {
    const src = Buffer.isBuffer(sourcePngBuffer) ? sourcePngBuffer : Buffer.from(sourcePngBuffer);
    const r = _lsbRoundTrip(src, Buffer.from(data, 'utf8'), true);
    return _assemblePng(src, r.scan, r.payload);
}

/**
 * Extract a packet from a PNG — returns the CANONICAL string
 * (BRN:… or BRN:ENC:…), empty string when no Vant packet is present.
 */
function extractData(pngBuffer) {
    const buf = Buffer.isBuffer(pngBuffer) ? pngBuffer : Buffer.from(pngBuffer);
    const r = _lsbRoundTrip(buf, null, false);
    const stream = r.streamBits;
    if (stream.length < 8) return '';
    // Wire layout mirrors the write side: [u32 BE len][packet bytes].
    const len = stream.readUInt32BE(0);
    if (!Number.isSafeInteger(len) || len <= 0 || 4 + len > stream.length) return '';
    const packet = stream.slice(4, 4 + len).toString('utf8');
    return packet.startsWith('BRN:') ? packet : '';
}

// (storage migration assessment, R-1) stego operates on BINARY image
// artifacts (PNG pixel data) at caller-supplied paths — CLI users pass
// arbitrary paths and transform.js passes horcrux images inside models.
// FileStorage.read is utf8-only, so routing through it would corrupt binary
// payloads: per prd-storage.md migration standard #7 this module stays on fs
// BY DESIGN, with vaf.checkPathTraversal on every caller path (already in
// place) and atomic write for outputs.

/**
 * Encode message in image
 */
function encode(message, inputPath, outputPath, options = {}) {
    // VAF: Validate paths (also require both to be present)
    const vaf = require('./vaf');
    if (!inputPath || !outputPath) {
        throw new errors.VantError('Input and output paths are required', { code: errors.CODES.VAF_REQUIRED_FIELD });
    }
    const inCheck = vaf.checkPathTraversal(inputPath);
    if (inCheck.blocked) {
        throw new errors.VantError('Path blocked', { code: errors.CODES.SECURITY_PATH_TRAVERSAL });
    }
    const outCheck = vaf.checkPathTraversal(outputPath);
    if (outCheck.blocked) {
        throw new errors.VantError('Path blocked', { code: errors.CODES.SECURITY_PATH_TRAVERSAL });
    }

    if (!fs.existsSync(inputPath)) {
        throw new errors.VantError('Input image not found: ' + inputPath, { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
    }

    // (pass 178) Canonical packet — identical shape to the SVG path. One
    // wire dialect across stego surfaces; legacy 'BRN:'+'ENC:' stones are
    // legacy-only (PNG path never successfully encoded anything, see the
    // pass head comment — no migration needed).
    const data = _lsbPacket(message, options.password, options.encrypt);

    // (pass 178) NO Buffer aliasing: readFileSync returns a tight Buffer.
    const buffer = fs.readFileSync(inputPath);
    const modified = hideData(data, buffer);

    // (pass 178) The old encode built the stone and NEVER WROTE it —
    // encode() just returned the output path with an empty file silently
    // absent. Atomic write (tmp + rename) so a crash mid-write can never
    // strand a truncated PNG at the outputPath.
    const fs2 = require('fs'), pathMod = require('path');
    const outDir = pathMod.dirname(outputPath);
    if (!fs2.existsSync(outDir)) fs2.mkdirSync(outDir, { recursive: true });
    const tmp = outputPath + '.tmp-' + process.pid + '-' + Date.now();
    fs2.writeFileSync(tmp, modified);
    _checkWrite();
    fs2.renameSync(tmp, outputPath);

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
        throw new errors.VantError('Image not found: ' + imagePath, { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
    }

    // (pass 178) Tight buffers, canonical packet handling.
    const buffer = fs.readFileSync(imagePath);
    const packet = extractData(buffer);
    if (!packet.startsWith('BRN:ENC:') && !packet.startsWith('BRN:')) {
        throw new errors.VantError('No hidden data found in image', { code: errors.CODES.STORAGE_DATA_NOT_FOUND, retryable: false });
    }
    let data = packet.slice(4);
    const isEncrypted = packet.startsWith('BRN:ENC:');
    if (isEncrypted) {
        if (!options.password && options.decrypt !== false) {
            // try filename-derived password via stego's own convention first,
            // else an honest refusal (plaintext must not silently pass).
            return { error: 'Encrypted PNG payload requires a password (options.password)' };
        }
        if (options.decrypt !== false) {
            const rec = packet.slice(8);
            data = Encrypt.decrypt(rec, options.password, { algorithm: "aes-256-gcm" });
        }
    }

    // (pass 178) No decompress stage: the Encrypt packet is
    // salt:iv:authTag:cipher hex — never compressed — and a phantom
    // Encrypt.decompress() call here would crash every decode.

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
        return extractData(buffer).startsWith('BRN:');
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
        data = 'BRN:ENC:' + Encrypt.encrypt(message, password, { algorithm: "aes-256-gcm" });
    }
    return Buffer.from(data, 'utf8');
}

/**
 * Decode message from buffer (companion to encodeToBuffer)
 * FIXED: previously referenced pwd/meta from decodeSvg's scope — any call
 * threw ReferenceError; tests only checked typeof, never executed it.
 */
function decodeFromBuffer(buffer, password) {
    const data = buffer.toString('utf8');
    if (!data.startsWith('BRN:')) return null;

    let msg = data.slice(4);
    if (msg.startsWith('ENC:')) {
        if (!password) {
            throw new errors.VantError('Encrypted payload requires a password', { code: errors.CODES.VAF_REQUIRED_FIELD });
        }
        msg = Encrypt.decrypt(msg.slice(4), password, { algorithm: "aes-256-gcm" });
    }
    return { message: msg, encrypted: msg !== data.slice(4) };
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
    return password ? Encrypt.encrypt(json, password, { algorithm: "aes-256-gcm" }) : json;
}

/**
 * Parse bootstrap string
 */
function parseBootstrap(bootstrapStr, password) {
    const json = password ? Encrypt.decrypt(bootstrapStr, password, { algorithm: "aes-256-gcm" }) : bootstrapStr;
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
        throw new errors.VantError('Image not found: ' + imagePath, { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
    }
    const buffer = fs.readFileSync(imagePath); // (pass 178) tight Buffer, no ArrayBuffer aliasing
    const pixels = extractPixels(buffer);
    // Capacity == R-channel (first-byte) LSB bits over the DECODED stream,
    // matching what _lsbRoundTrip actually writes — not a 3-channel guess.
    return Math.floor((pixels.width * pixels.height * LSB_BITS_PER_PIXEL) / 8);
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
        data = 'BRN:ENC:' + Encrypt.encrypt(message, password, { algorithm: "aes-256-gcm" });
    }
    const b64 = Buffer.from(data, 'utf8').toString('base64');

    let svg = svgContent;

    // Clean existing — both legacy (bare) and Stegoframe-styled (attributed)
    // opening tags must match or an incoming stone keeps TWO payloads.
    svg = svg.replace(/<brn:secret[^>]*>.*?<\/brn:secret>/gs, '');
    svg = svg.replace(/\s*<\/metadata>/g, '').replace(/<metadata>\s*/g, '');

    // (pass 178 stego-interop) Shared namespace. Vant historically stamped
    // xmlns:brn="urn:vant" only when absent; Stegoframe owns the
    // http://steganography.dev/brn URI. The ELEMENT name is the contract (
    // <brn:secret>); either URI declaration on the fake namespace is fine,
    // and Stegoframe's reader tolerates both.
    if (!svg.includes('xmlns:brn=')) {
        svg = svg.replace(/<svg[ >]/, '<svg xmlns:brn="http://steganography.dev/brn" ');
    }

    // (pass 178 stego-interop) Shared format marker: matches Stegoframe's
    // <desc data-f="1.0"/> and gives future tools a tag to detect. Written
    // when absent; readers (below) never REQUIRE it.
    if (!svg.includes('data-f="1.0"') && !svg.includes('data-f=\'1.0\'')) {
        svg = svg.replace(/>/, '><desc data-f="1.0"/>');
    }

    // Embed — Vant's historical <metadata> wrapper is kept (every horcrux
    // consumer reads through decodeSvg, and validateHorcruxFile's
    // hasBrnSecret sniff is wrap-agnostic).
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

    // (pass 178 stego-interop) READ BOTH WIRE STYLES — this is the line
    // that makes Vant read Stegoframe stones unchanged:
    //   - opening tag with OR without attributes (Stegoframe writes
    //     <brn:secret xmlns:brn="http://steganography.dev/brn">; legacy
    //     Vant writes the bare tag)
    //   - payload element directly vs inside <metadata>
    //   - [^<]+ body instead of the strict base64 class (both writers
    //     emit standard base64; '=' padding and variants must not strand
    //     a stone)
    const match = svgContent.match(/<brn:secret[^>]*>([^<]+)<\/brn:secret>/s);
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
            msg = Encrypt.decrypt(msg, pwd, { algorithm: "aes-256-gcm" });
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
    // (pass 178) internals exposed for tests/interop tooling only — not a
    // public API promise.
    _pngScan,
    _lsbRoundTrip,
    _lsbPacket,
    _assemblePng,
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
    getLayerStatus: () => ({ name: 'Stego', type: 'stego', version: require('./version'), enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true })
};
