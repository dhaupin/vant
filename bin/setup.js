/**
 * Vant Setup
 * Interactive configuration for new users
 * 
 * Usage: node bin/setup.js
 * 
 * SECURITY:
 * - Never save tokens to config.ini
 * - Use environment variables instead
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG_FILE = 'config.ini';
const CONFIG_TEMPLATE = `=== Vant CONFIG ===

# Core
VANT_VERSION=v0.8.3
MODEL_PATH=models/public
STATE_PATH=states/active/current.json

# Transport (stegoframe)
STEGOFRAME_URL=https://stegoframe.creadev.org
STEGOFRAME_ROOM=REPLACE_ME
STEGOFRAME_PASSPHRASE=REPLACE_ME
STEGOFRAME_MODE=svg

# GitHub
GITHUB_REPO=REPLACE_ME
GITHUB_BRANCH=main
GITHUB_TOKEN=\${GITHUB_TOKEN}

# Runtime
POLLING_INTERVAL=10000
MAX_REQUESTS_PER_HOUR=360
`;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
}

async function setup() {
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║         Vant Setup v0.8.3            ║');
    console.log('╚═══════════════════════════════════════╝\n');

    // Check existing config
    if (fs.existsSync(CONFIG_FILE)) {
        const overwrite = await question('config.ini exists. Overwrite? (y/N): ');
        if (overwrite.toLowerCase() !== 'y') {
            console.log('Setup cancelled.');
            rl.close();
            return;
        }
    }

    console.log('\n1. GitHub Setup');
    console.log('   Create token: https://github.com/settings/tokens');
    console.log('   Required: repo scope');
    console.log('   IMPORTANT: Set as GITHUB_TOKEN env var, NOT in config.ini\n');
    const githubRepo = await question('GitHub repo (username/repo): ');
    
    console.log('\n2. Stegoframe Setup (optional)');
    console.log('   URL: https://stegoframe.creadev.org\n');
    const roomId = await question('Room ID (or press Enter to skip): ');
    const passphrase = await question('Passphrase (or press Enter to skip): ');

    // Build config
    let config = CONFIG_TEMPLATE
        .replace('REPLACE_ME', githubRepo || 'your-username/vant')
        .replace('GITHUB_REPO=REPLACE_ME', `GITHUB_REPO=${githubRepo || 'your-username/vant'}`);

    if (roomId) {
        config = config.replace('STEGOFRAME_ROOM=REPLACE_ME', `STEGOFRAME_ROOM=${roomId}`);
    }
    if (passphrase) {
        config = config.replace('STEGOFRAME_PASSPHRASE=REPLACE_ME', `STEGOFRAME_PASSPHRASE=${passphrase}`);
    }

    // Write config
    fs.writeFileSync(CONFIG_FILE, config);
    console.log(`\n✓ Written to ${CONFIG_FILE}`);

    console.log('\n═══════════════════════════════════════════');
    console.log('Setup complete! Run: node bin/vant.js health');
    console.log('IMPORTANT: Set GITHUB_TOKEN as env var, NOT in config');
    console.log('═══════════════════════════════════════════\n');

    rl.close();
}

setup().catch(console.error);