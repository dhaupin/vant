/**
 * VANT Setup
 * Interactive configuration for new users
 * 
 * Usage: node bin/setup.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG_FILE = 'config.ini';
const CONFIG_TEMPLATE = `=== VANT CONFIG ===

# Core
VANT_VERSION=v0.6.0
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
    console.log('║         VANT Setup v0.6.0            ║');
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
    console.log('   Required: repo scope\n');
    const githubRepo = await question('GitHub repo (username/repo): ');
    const githubToken = await question('GitHub token (or press Enter for env var): ');
    
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

    // Set env var if provided
    if (githubToken) {
        console.log('\n💡 Set GITHUB_TOKEN env var:');
        console.log(`   export GITHUB_TOKEN=${githubToken.substring(0, 8)}...`);
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('Setup complete! Run: node bin/vant.js health');
    console.log('═══════════════════════════════════════════\n');

    rl.close();
}

setup().catch(console.error);