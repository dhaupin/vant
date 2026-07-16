#!/usr/bin/env node
/**
 * Vant Encrypt CLI
 * Encryption utilities
 * 
 * Usage:
 *   vant encrypt generate-id       # Generate unique ID
 *   vant encrypt hash <data>      # Hash data
 *   vant encrypt encrypt <data>   # Encrypt data
 *   vant encrypt decrypt <data>   # Decrypt data
 *   vant encrypt key              # Generate encryption key
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Encrypt CLI - Encryption utilities

Usage:
  vant encrypt generate-id        Generate unique ID
  vant encrypt hash <data>       Hash data (SHA-256)
  vant encrypt encrypt <data>    Encrypt data (AES-256)
  vant encrypt decrypt <data>   Decrypt data
  vant encrypt key              Generate encryption key
  vant encrypt verify <hash> <data>  Verify hash
`);
    process.exit(0);
}

function run() {
    const Encrypt = require('../lib/encrypt');
    
    if (subcmd === 'generate-id' || subcmd === 'id' || subcmd === 'uuid') {
        const id = Encrypt.generateId();
        console.log(id);
    } else if (subcmd === 'hash' || subcmd === 'sha256') {
        const data = args.slice(1).join(' ');
        if (!data) {
            console.error('Usage: vant encrypt hash <data>');
            process.exit(1);
        }
        const hash = Encrypt.hash(data);
        console.log(hash);
    } else if (subcmd === 'encrypt' || subcmd === 'enc') {
        const data = args.slice(1).join(' ');
        if (!data) {
            console.error('Usage: vant encrypt encrypt <data>');
            process.exit(1);
        }
        const key = process.env.ENCRYPT_KEY || 'default-key-change-me';
        const encrypted = Encrypt.encrypt(data, key);
        console.log(encrypted);
    } else if (subcmd === 'decrypt' || subcmd === 'dec') {
        const data = args[1];
        if (!data) {
            console.error('Usage: vant encrypt decrypt <data>');
            process.exit(1);
        }
        const key = process.env.ENCRYPT_KEY || 'default-key-change-me';
        try {
            const decrypted = Encrypt.decrypt(data, key);
            console.log(decrypted);
        } catch (e) {
            console.error('Decryption failed:', e.message);
            process.exit(1);
        }
    } else if (subcmd === 'key' || subcmd === 'genkey') {
        const key = Encrypt.generateId();
        console.log('ENCRYPT_KEY=' + key);
    } else if (subcmd === 'verify' || subcmd === 'check') {
        const hash = args[1];
        const data = args.slice(2).join(' ');
        if (!hash || !data) {
            console.error('Usage: vant encrypt verify <hash> <data>');
            process.exit(1);
        }
        const computed = Encrypt.hash(data);
        console.log(hash === computed ? 'Valid ✓' : 'Invalid ✗');
    } else {
        console.log('Usage: vant encrypt <command>');
        process.exit(1);
    }
}

run();
