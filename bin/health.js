/**
 * Vant Health Check
 * 
 * Checks system state and model integrity
 */

const fs = require('fs');
const path = require('path');

// Check if file exists - tries .md first, falls back to .txt
function fileExists(file) {
    if (fs.existsSync(file)) return true;
    const base = file.replace('.md', '');
    return fs.existsSync(base + '.md') || fs.existsSync(base + '.txt');
}

function checkModel() {
    console.log('\n📦 Model:');
    
    // Try .md first, then .txt for backward compat
    const checks = [
        ['identity.md', 'identity.txt'],
        ['meta.json'],
        ['lessons.md', 'lessons.txt']
    ];
    
    const required = ['identity.md', 'identity.txt'];
    const found = checks.some(pair => pair.some(f => fs.existsSync(path.join('models/public', f))));
    
    if (found) {
        console.log('  ✓ Public model exists');
        
        // Try to read identity
        const identityPath = fs.existsSync('models/public/identity.md') 
            ? 'models/public/identity.md' 
            : fs.existsSync('models/public/identity.txt') 
                ? 'models/public/identity.txt' 
                : null;
        
        if (identityPath) {
            const content = fs.readFileSync(identityPath, 'utf8');
            const modelMatch = content.match(/MODEL:\s*(.+)/);
            if (modelMatch) {
                console.log(`  → ${modelMatch[1]}`);
            }
        }
    } else {
        console.log('  ✗ Public model missing');
        return false;
    }
    
    return true;
}

function checkConfig() {
    console.log('\n⚙️  Config:');
    if (fs.existsSync('config.ini')) {
        console.log('  ✓ config.ini exists');
    } else {
        console.log('  ⚠ config.ini not found (run vant setup)');
    }
}

function checkEnv() {
    console.log('\n🔐 Environment:');
    if (fs.existsSync('.env')) {
        console.log('  ✓ .env exists');
    } else {
        console.log('  ⚠ .env not found');
    }
}

function checkDirs() {
    console.log('\n📁 Directories:');
    const dirs = ['models', 'models/public', 'lib', 'bin', 'states'];
    dirs.forEach(d => {
        if (fs.existsSync(d)) {
            console.log(`  ✓ ${d}/`);
        } else {
            console.log(`  ✗ ${d}/ missing`);
        }
    });
}

function run() {
    console.log('╔═══════════════════════════════════════╗');
    console.log('║         Vant Health Check            ║');
    console.log('╚═══════════════════════════════════════╝');
    
    checkModel();
    checkConfig();
    checkEnv();
    checkDirs();
    
    console.log('\n');
}

run();
module.exports = { checkModel, checkConfig, checkEnv, checkDirs, run };
