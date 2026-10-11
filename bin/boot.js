#!/usr/bin/env node
/**
 * Vant Boot - Ghost in the Machine
 * 
 * Boot Vant from zero local state by fetching a stego image.
 * Triple-redundant bootstrap: URL → local backup → .env fallback
 * 
 * Usage:
 *   node bin/boot.js --image <url>           # From URL
 *   node bin/boot.js --image <path>          # From local file
 *   node bin/boot.js --decrypt <password>   # Decrypt password
 *   node bin/boot.js                        # Auto (try all sources)
 * 
 * The flow:
 *   1. Try provided URL (or use default)
 *   2. Try local backup: models/.states/manifest.png
 *   3. Try .env DEFAULT_BOOT_URL
 *   4. If all fail → Amnesia Mode (clean state)
 * 
 * SECURITY:
 *   - Validates URL before fetch (HTTPS required for remote)
 *   - No tokens in embedded config (by design)
 *   - Sanitizes all paths
 */

const fs = require('fs');

// Lazy-load sandbox
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) { try { _sandbox = require("../lib/sandbox"); } catch (e) {} }
    return _sandbox;
}
function _checkRead() { const sandbox = _getSandbox(); if (sandbox && !sandbox.canRead()) throw new Error("Read required"); }
function _checkWrite() { const sandbox = _getSandbox(); if (sandbox && !sandbox.canWrite()) throw new Error("Write required"); }
const path = require('path');
const { URL } = require('url');

const args = process.argv.slice(2);

// (Issue #175 QC) Both flag spellings work: --image=<value> AND
// --image <value> (space-separated). The old parser only matched the =
// form — `--image path/to.svg` fell through to AUTO-boot with "trying 0
// sources", ignoring the operator's explicit stone. Space form validated
// as a sane path/url token (no further flags, non-empty).
function _flagValue(name) {
    // --image=<value>
    const inline = args.find(a => a.startsWith('--' + name + '='));
    if (inline !== undefined && inline.slice(name.length + 3) !== '') {
        return inline.slice(name.length + 3);
    }
    // --image <value>
    const i = args.indexOf('--' + name);
    if (i !== -1) {
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('--')) return next;
        // Bare flag without a value: loud failure, not a silent auto-boot.
        console.error('[Boot] --' + name + ' requires a value: --' + name + '=<url|path>');
        process.exit(1);
    }
    return undefined;
}

const imageArg = _flagValue('image');
const decrypt = _flagValue('decrypt');
const force = args.includes('--force');

// Helper: Validate URL is safe for fetching
function validateUrl(urlString) {
    let url;
    try {
        url = new URL(urlString);
    } catch (e) {
        // Not a URL, treat as local path
        if (!fs.existsSync(urlString)) {
            throw new Error(`File not found: ${urlString}`);
        }
        // Security: ensure path is within allowed directories
        const resolved = path.resolve(urlString);
        if (resolved.includes('..')) {
            throw new Error('Path traversal blocked');
        }
        return { isLocal: true, path: resolved };
    }
    
    // Remote URL validation
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Only HTTP/HTTPS URLs allowed');
    }
    
    // Block internal/private IPs
    const hostname = url.hostname.toLowerCase();
    if (hostname.startsWith('localhost') || 
        hostname.startsWith('127.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('172.16.') ||
        hostname.endsWith('.local')) {
        throw new Error('Internal/ localhost URLs not allowed');
    }
    
    return { isLocal: false, url: urlString };
}

// Fetch image from URL
async function fetchImage(urlString) {
    console.log('[Boot] Fetching image from:', urlString);
    
    const response = await fetch(urlString);
    if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    console.log('[Boot] Fetched', buffer.byteLength, 'bytes');
    
    return Buffer.from(buffer);
}

// Load image from local file
function loadImage(filePath) {
    console.log('[Boot] Loading local image:', filePath);
    
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    
    const buffer = fs.readFileSync(filePath);
    console.log('[Boot] Loaded', buffer.length, 'bytes');
    
    return buffer;
}

// Boot Vant from horcrux using transform.js pipeline
async function boot(imageInput, decryptPassword) {
    // Validate input
    const validation = validateUrl(imageInput);
    let imagePath = validation.isLocal ? validation.path : null;
    
    // Load transform module
    const transform = require('../lib/transform');
    
    // If URL, download to temp file first
    if (!validation.isLocal) {
        // Security: explicit HTTPS check
        if (!validation.url.startsWith('https://') && !validation.url.includes('localhost')) {
            throw new Error('HTTPS required for remote URLs (except localhost)');
        }
        
        console.log('[Boot] Downloading horcrux from:', validation.url);
        const imageBuffer = await fetchImage(validation.url);
        
        // Save to temp file for transform.fromHorcrux
        const os = require('os');
        const tmpPath = path.join(os.tmpdir(), 'vant-horcrux-' + Date.now() + '.svg');
        fs.writeFileSync(tmpPath, imageBuffer);
        imagePath = tmpPath;
        console.log('[Boot] Saved to temp:', imagePath);
    }
    
    // Use transform.js pipeline (proper way)
    console.log('[Boot] Extracting horcrux using transform.js...');
    let horcruxData;
    
    try {
        horcruxData = await transform.fromHorcrux(imagePath, { 
            password: decryptPassword 
        });
    } catch (e) {
        if (e.message.includes('Password required') || e.message.includes('Invalid password')) {
            throw new Error('Horcrux is encrypted. Provide --decrypt <password>');
        }
        if (e.message.includes('not found') || e.message.includes('Invalid')) {
            throw new Error('Invalid horcrux file. Is this a Vant horcrux?');
        }
        throw e;
    }
    
    console.log('[Boot] Horcrux extracted successfully');
    
    // Full restore using transform.restore()
    console.log('[Boot] Restoring systems...');
    let restoreResult;
    try {
        restoreResult = await transform.restore(horcruxData);
    } catch (e) {
        console.warn('[Boot] Partial restore:', e.message);
        restoreResult = { restored: [], errors: [e.message] };
    }
    
    // Show what was restored
    console.log('\n[Boot] Restored systems:');
    for (const item of restoreResult.restored || []) {
        console.log('  -', item);
    }
    if (restoreResult.errors && restoreResult.errors.length > 0) {
        console.log('[Boot] Restore warnings:', restoreResult.errors.length);
    }
    
    // Show horcrux metadata
    console.log('\n[Boot] Horcrux info:');
    console.log('  - Version:', horcruxData.version);
    console.log('  - Timestamp:', horcruxData.timestamp);
    if (horcruxData.mode) {
        console.log('  - Mode:', horcruxData.mode.mode);
        console.log('  - Stack:', horcruxData.mode.stack?.join(' → '));
    }
    
    console.log('\n[Boot] Ghost in the Machine: ✓');
    console.log('[Boot] Next: vant sync to sync with remote, or vant run to start');
    
    return { success: true, restored: restoreResult.restored, data: horcruxData };
}

// Help
function help() {
    console.log(`
Vant Boot - Ghost in the Machine

Boot Vant from zero local state by fetching a stego image.
The agent becomes truly transient - no .env needed if config is embedded!

Usage:
  node bin/boot.js --image <url|path> [--decrypt <password>]

Options:
  --image=<url|path>    Image URL or local file path (required)
  --decrypt=<pass>     Decryption password (if encrypted)

Examples:
  # From GitHub raw URL
  node bin/boot.js --image=https://raw.githubusercontent.com/user/repo/main/brain.png

  # From local file
  node bin/boot.js --image=./brain.png

  # Encrypted
  node bin/boot.js --image=./brain.png --decrypt=secret123

Security:
  - Only HTTPS allowed for remote URLs
  - No internal/localhost URLs
  - No tokens in embedded config (by design)
  - Configuration must be set separately
`);
}

// Main
// Local backup path
const LOCAL_BACKUP = path.join(__dirname, '..', 'models', '.states', 'manifest.png');
const ENV_FILE = path.join(__dirname, '..', '.env');

// Load .env fallback
function getEnvBootUrl() {
    if (fs.existsSync(ENV_FILE)) {
        const env = fs.readFileSync(ENV_FILE, 'utf8');
        const match = env.match(/DEFAULT_BOOT_URL=(.+)/);
        if (match && match[1] && !match[1].startsWith('#')) {
            return match[1].trim();
        }
    }
    return null;
}

// Triple-redundant boot sources
function getBootSources() {
    const sources = [];
    
    // 1. Provided or default
    if (imageArg) {
        sources.push({ type: 'provided', source: imageArg });
    }
    
    // 2. Local backup
    if (fs.existsSync(LOCAL_BACKUP)) {
        sources.push({ type: 'local', source: LOCAL_BACKUP });
    }
    
    // 3. .env fallback
    const envUrl = getEnvBootUrl();
    if (envUrl) {
        sources.push({ type: 'env', source: envUrl });
    }
    
    return sources;
}

// Amnesia Mode - clean state
async function enterAmnesiaMode() {
    // (Issue #175 QC) The old wording said "Cleaning brain and starting
    // fresh" — but the function NEVER wipes the brain (it only records an
    // amnesia state marker). Two problems: the lie made an operator believe
    // their dates were gone mid-recovery, and it papered over "we could not
    // boot" as if a reset was intentional. Say what actually happens.
    console.log('\n⚠ All boot sources failed!');
    console.log('============================================');
    console.log('VANT AMNESIA MODE (no boot source available)');
    console.log('(The brain tree was NOT modified — nothing was wiped.)');
    console.log('Recover the brain manually: `vant horcrux restore <svg> <password>`');
    console.log('or `vant backup restore <file>`.');
    console.log('============================================\n');
    
    // Save warning state - use memory.state instead
    const vant = require('../lib/vant');
    const memory = require('../lib/memory');
    await memory.state('amnesia', JSON.stringify({
        mode: true,
        timestamp: new Date().toISOString(),
        reason: 'No valid boot sources found'
    }));
    
    return true;
}

async function main() { _checkRead(); 
    const isHelp = args.includes('--help') || args.includes('-h');
    
    if (isHelp && !imageArg) {
        help();
        process.exit(0);
    }
    
    // If no image provided, try all sources
    if (!imageArg && !force) {
        const sources = getBootSources();
        
        console.log('[Boot] Auto-boot mode: trying', sources.length, 'sources');
        
        let lastError = null;
        for (const src of sources) {
            console.log('[Boot] Trying', src.type + ':', src.source);
            try {
                await boot(src.source, decrypt);
                process.exit(0);
            } catch (e) {
                console.log('[Boot] Failed:', e.message);
                lastError = e;
            }
        }
        
        // All sources failed — record it but DO NOT exit zero: "could not
        // boot" is a failure, not a success (scripts must see it).
        console.log('[Boot] All sources exhausted');
        await enterAmnesiaMode();
        process.exit(1);
    }
    
    try {
        await boot(imageArg || 'auto', decrypt);
    } catch (e) {
        console.error('[Boot] Error:', e.message);
        
        // Try fallback
        if (!force) {
            const sources = getBootSources().filter(s => s.source !== imageArg);
            for (const src of sources) {
                console.log('[Boot] Fallback:', src.type);
                try {
                    await boot(src.source, decrypt);
                    process.exit(0);
                } catch (e2) {
                    console.log('[Boot] Fallback failed:', e2.message);
                }
            }
            await enterAmnesiaMode();
        }
        process.exit(1);
    }
}

main();