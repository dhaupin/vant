#!/usr/bin/env node
/**
 * Vant Stego CLI
 * 
 * Usage:
 *   node bin/stego.js snapshot --output brain.png [--encrypt password]
 *   node bin/stego.js recover --input brain.png [--decrypt password]
 *   node bin/stego.js capacity --image avatar.png
 *   node bin/stego.js upload --input avatar.png [--provider github]
 */

const fs = require('fs');
const path = require('path');
const stego = require('../lib/stego');
const brain = require('../lib/brain');

const args = process.argv.slice(2);
const command = args[0];

async function snapshot(args) {
    const output = args.find(a => a.startsWith('--output='))?.slice(9) || 'brain.png';
    const encrypt = args.find(a => a.startsWith('--encrypt='))?.slice(10);
    const input = args.find(a => a.startsWith('--input='))?.slice(8) || 'avatar.png';
    
    if (!fs.existsSync(input)) {
        console.error(`Input image not found: ${input}`);
        console.error('Usage: node bin/stego.js snapshot --input=avatar.png --output=brain.png [--encrypt=password]');
        process.exit(1);
    }
    
    // Check capacity
    const capacity = stego.getCapacity(input);
    const compressedSize = brain.compress().length;
    
    console.log(`[Stego] Brain size: ${compressedSize} bytes`);
    console.log(`[Stego] Image capacity: ${capacity} bytes`);
    
    if (compressedSize > capacity) {
        console.log('[Stego] Brain too large, using chunked encoding...');
        const chunks = Math.ceil(compressedSize / capacity);
        console.log(`[Stego] Requires ${chunks} images`);
        // For now, just output single image with warning
        console.warn('[Stego] WARNING: Single image too small. Use larger carrier image.');
    }
    
    try {
        stego.encodeBrain(input, output, { encrypt: encrypt || null });
        console.log(`[Stego] Snapshot saved to: ${output}`);
    } catch (e) {
        console.error(`[Stego] Error: ${e.message}`);
        process.exit(1);
    }
}

async function recover(args) {
    const input = args.find(a => a.startsWith('--input='))?.slice(8);
    const decrypt = args.find(a => a.startsWith('--decrypt='))?.slice(10);
    const output = args.find(a => a.startsWith('--output='))?.slice(9);
    
    if (!input) {
        console.error('Usage: node bin/stego.js recover --input=brain.png [--decrypt=password] [--output=brain.json]');
        process.exit(1);
    }
    
    if (!fs.existsSync(input)) {
        console.error(`Input image not found: ${input}`);
        process.exit(1);
    }
    
    try {
        const brainData = stego.decodeBrain(input, { decrypt: decrypt || null });
        
        if (output) {
            fs.writeFileSync(output, JSON.stringify(brainData, null, 2));
            console.log(`[Stego] Recovered brain to: ${output}`);
        } else {
            console.log(JSON.stringify(brainData, null, 2));
        }
    } catch (e) {
        console.error(`[Stego] Error: ${e.message}`);
        process.exit(1);
    }
}

function capacity(args) {
    const input = args.find(a => a.startsWith('--image='))?.slice(8);
    
    if (!input) {
        console.error('Usage: node bin/stego.js capacity --image=avatar.png');
        process.exit(1);
    }
    
    if (!fs.existsSync(input)) {
        console.error(`Image not found: ${input}`);
        process.exit(1);
    }
    
    const cap = stego.getCapacity(input);
    console.log(`[Stego] Capacity: ${cap} bytes (${Math.round(cap / 1024)} KB)`);
    console.log(`[Stego] Max brain size (compressed): ${Math.round(cap / 1024)} KB`);
}

async function upload(args) {
    const input = args.find(a => a.startsWith('--input='))?.slice(8);
    const provider = args.find(a => a.startsWith('--provider='))?.slice(11);
    
    if (!input) {
        console.error('Usage: node bin/stego.js upload --input=avatar.png [--provider=github]');
        process.exit(1);
    }
    
    if (!fs.existsSync(input)) {
        console.error(`Image not found: ${input}`);
        process.exit(1);
    }
    
    try {
        // Load providers
        const { getProvider } = require('../lib/providers');
        const p = getProvider(provider);
        
        if (!p.isConfigured()) {
            console.error(`[Stego] Provider ${provider || 'auto'} not configured`);
            process.exit(1);
        }
        
        // Try to update avatar (provider must support this)
        await p.updateAvatar(input);
        console.log(`[Stego] Avatar updated via ${p.getType()}`);
    } catch (e) {
        if (e.message.includes('does not support')) {
            console.log(`[Stego] ${e.message}`);
            console.log('[Stego] Tip: Use stego snapshot to create hidden image, then upload manually');
        } else {
            console.error(`[Stego] Error: ${e.message}`);
        }
        process.exit(1);
    }
}

function help() {
    console.log(`
Vant Stego CLI v0.8.6

Usage: node bin/stego.js <command> [options]

Commands:
  snapshot          Encode brain into image
  recover          Decode brain from image
  capacity         Show image capacity
  upload           Upload as profile picture

Options:
  --input=<file>      Input image (default: avatar.png)
  --output=<file>     Output file
  --encrypt=<pass>    Encrypt with password
  --decrypt=<pass>   Decrypt with password
  --provider=<name>  Git provider (github, gitlab, bitbucket)

Examples:
  # Encode brain into image
  node bin/stego.js snapshot --input=avatar.png --output=brain.png

  # Encode with encryption
  node bin/stego.js snapshot --input=avatar.png --output=brain.png --encrypt=secret123

  # Decode brain from image
  node bin/stego.js recover --input=brain.png --output=brain.json

  # Check capacity
  node bin/stego.js capacity --image=avatar.png
`);
}

// Main
async function main() {
    switch (command) {
        case 'snapshot':
            await snapshot(args.slice(1));
            break;
        case 'recover':
            await recover(args.slice(1));
            break;
        case 'capacity':
            capacity(args.slice(1));
            break;
        case 'upload':
            await upload(args.slice(1));
            break;
        case 'help':
        case '--help':
        case '-h':
        default:
            help();
    }
}

main().catch(e => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
});