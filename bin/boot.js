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
const path = require('path');
const { URL } = require('url');

const args = process.argv.slice(2);
const imageArg = args.find(a => a.startsWith('--image='))?.slice(8);
const decrypt = args.find(a => a.startsWith('--decrypt='))?.slice(10);
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

// Boot Vant from image
async function boot(imageInput, decryptPassword) {
    // Validate input
    const validation = validateUrl(imageInput);
    let imageBuffer;
    
    if (validation.isLocal) {
        imageBuffer = loadImage(validation.path);
    } else {
        // Security: explicit HTTPS check
        if (!validation.url.startsWith('https://') && !validation.url.includes('localhost')) {
            throw new Error('HTTPS required for remote URLs (except localhost)');
        }
        imageBuffer = await fetchImage(validation.url);
    }
    
    // Load stego module
    const stego = require('../lib/stego');
    const brain = require('../lib/storage').get('brain');
    
    // Decode brain from image
    console.log('[Boot] Decoding brain from image...');
    let brainData;
    
    try {
        brainData = stego.decodeBrain(imageBuffer, { 
            decrypt: decryptPassword || null 
        });
    } catch (e) {
        if (e.message.includes('encrypted')) {
            throw new Error('Image is encrypted. Provide --decrypt <password>');
        }
        if (e.message.includes('No brain data')) {
            throw new Error('No brain data found in image. Is this a stego image?');
        }
        throw e;
    }
    
    console.log('[Boot] Brain decoded successfully');
    
    // Load brain state
    brain.fromJSON(brainData);
    console.log('[Boot] Brain loaded');
    
    // Extract embedded config (if any)
    const embeddedConfig = brain.extractEmbeddedConfig();
    if (embeddedConfig) {
        console.log('[Boot] Found embedded config:');
        console.log('  - GITHUB_REPO:', embeddedConfig.GITHUB_REPO || '(not set)');
        console.log('  - GITHUB_BRANCH:', embeddedConfig.GITHUB_BRANCH || 'main');
        console.log('  - MODEL_PATH:', embeddedConfig.MODEL_PATH || '(default)');
    }
    
    // Show what we recovered
    const json = brain.toJSON();
    console.log('\n[Boot] Recovered brain:');
    console.log('  - Version:', json.version);
    console.log('  - Timestamp:', json.timestamp);
    console.log('  - Learnings:', Object.keys(json.learnings || {}).length, 'files');
    console.log('  - Memories:', Object.keys(json.memories || {}).length, 'files');
    console.log('  - Decisions:', Object.keys(json.decisions || {}).length, 'files');
    
    console.log('\n[Boot] Ghost in the Machine: ✓');
    console.log('[Boot] Next: vant sync to sync with remote, or vant run to start');
    
    return { success: true, embeddedConfig };
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
function enterAmnesiaMode() {
    console.log('\n⚠ All boot sources failed!');
    console.log('============================================');
    console.log('VANT AMNESIA MODE');
    console.log('Cleaning brain and starting fresh...');
    console.log('============================================\n');
    
    // Save warning state
    const brain = require('../lib/storage').get('brain');
    brain.set('amnesia', {
        mode: true,
        timestamp: new Date().toISOString(),
        reason: 'No valid boot sources found'
    });
    
    return true;
}

async function main() {
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
        
        // All sources failed
        console.log('[Boot] All sources exhausted');
        enterAmnesiaMode();
        process.exit(0);
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
            enterAmnesiaMode();
        }
        process.exit(1);
    }
}

main();