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

// (Wave 2/R5, #189) The encrypt CLI encrypts ONLY with a key the R1 resolver
// resolves — the silent `process.env.ENCRYPT_KEY || 'default-key-change-me'`
// fallback is gone (R5 truth-in-help: the error names exactly which of the
// three canon sources were consulted, so a missing key is never guessed
// silently). Also dies fast before any crypto on a cipher-shaped input so a
// missing key shows the canon error, not a decrypt stack.
function _resolveKeyOrFail() {
    const config = require('../lib/config');
    const key = config.resolveAuthKey();
    if (key) {
        // (Battery item 4, #189 door sweep) Same resolver-derived posture line
        // every key door prints; one-shot commands state it under --verbose
        // instead of on "startup".
        if (args.includes('--verbose')) {
            try { console.error(config.authPosture().line); } catch (e) { /* never blocks crypto */ }
        }
        return key;
    }
    console.error(
        'No auth key resolvable. The R1 canon was consulted in order:\n' +
        '  1. VANT_AUTH_KEY          (canonical env)\n' +
        '  2. VANT_API_KEY / VANT_MCP_API_KEY (deprecated aliases)\n' +
        '  3. persisted brain config: mcp.apiKey (vant config set mcp.apiKey <key>)\n' +
        'Set one of these and retry. Encryption with an unresolvable key would\n' +
        'silently use a guessed secret — which is exactly what it never does.'
    );
    process.exit(1);
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
        const encrypted = Encrypt.encrypt(data, _resolveKeyOrFail());
        console.log(encrypted);
    } else if (subcmd === 'decrypt' || subcmd === 'dec') {
        const data = args[1];
        if (!data) {
            console.error('Usage: vant encrypt decrypt <data>');
            process.exit(1);
        }
        try {
            const decrypted = Encrypt.decrypt(data, _resolveKeyOrFail());
            console.log(decrypted);
        } catch (e) {
            console.error('Decryption failed:', e.message);
            process.exit(1);
        }
    } else if (subcmd === 'key' || subcmd === 'genkey') {
        // (pass 206, issue #186 bug 3 / #188-A7) A UUID was printed as
        // "ENCRYPT_KEY": 16 bytes of entropy rendered where the AES-256
        // path expects 32 (padded/truncated keys are weaker). Encrypt.key()
        // is the canonical secret-material generator (it IS what
        // generateShortId derives from) - the same function the brain
        // README's key convention names.
        const key = Encrypt.key(32);
        console.log('ENCRYPT_KEY=' + key);
    } else if (subcmd === 'verify' || subcmd === 'check') {
        const hash = args[1];
        const data = args.slice(2).join(' ');
        if (!hash || !data) {
            console.error('Usage: vant encrypt verify <hash> <data>');
            process.exit(1);
        }
        // (Issue #171 QC) hash() is SALTED PBKDF2 — two calls NEVER produce
        // the same string (fresh random salt each time), so re-hash-compare
        // was always Invalid. Encrypt.verify(data, hash) is the real
        // verifier: it splits the salt out of the stored hash and
        // recomputes. Exit status encodes the verdict (0 valid / 1 invalid).
        const valid = Encrypt.verify(data, hash);
        console.log(valid ? 'Valid ✓' : 'Invalid ✗');
        process.exit(valid ? 0 : 1);
    } else {
        console.log('Usage: vant encrypt <command>');
        process.exit(1);
    }
}

run();
