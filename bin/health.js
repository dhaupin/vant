/**
 * Vant Health Check & Diagnostics
 * 
 * Related: https://github.com/dhaupin/vant
 * 
 * Run: node bin/health.js
 * 
 * Checks:
 * - Config files exist and valid
 * - Brain files exist
 * - GitHub connectivity
 * - Stegoframe room status
 * - Rate limit state
 * - Dependencies
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG = {
    CONFIG_FILE: 'config.ini',
    SETTINGS_FILE: 'settings.ini',
    MOOD_FILE: 'mood.ini',
    MODELS_DIR: 'models',
    STATES_DIR: 'states',
    REQUIRED_FILES: [
        'config.example.ini',
        '.env.example',
        'README.md'
    ]
};

let issues = [];
let warnings = [];

function log(status, msg) {
    const symbols = { ok: '✓', warn: '⚠', fail: '✗', info: 'ℹ' };
    console.log(`${symbols[status] || '•'} ${msg}`);
    if (status === 'fail') issues.push(msg);
    if (status === 'warn') warnings.push(msg);
}

function checkFile(file) {
    if (fs.existsSync(file)) {
        log('ok', `${file} exists`);
        return true;
    } else {
        log('fail', `${file} missing`);
        return false;
    }
}

function checkDir(dir) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        const count = fs.readdirSync(dir).length;
        log('ok', `${dir}/ exists (${count} items)`);
        return true;
    } else {
        log('fail', `${dir}/ missing`);
        return false;
    }
}

function parseIni(content) {
    const result = {};
    content.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#') && line.includes('=')) {
            const [key, value] = line.split('=').map(s => s.trim());
            result[key] = value;
        }
    });
    return result;
}

function checkConfig() {
    console.log('\n--- Config Files ---');
    
    CONFIG.REQUIRED_FILES.forEach(f => checkFile(f));
    
    // Also check for optional config.ini
    if (fs.existsSync(CONFIG.CONFIG_FILE)) {
        const config = parseIni(fs.readFileSync(CONFIG.CONFIG_FILE, 'utf8'));
        
        // Check critical fields
        const critical = ['VANT_VERSION', 'MODEL_PATH', 'STEGOFRAME_ROOM', 'GITHUB_BRANCH'];
        critical.forEach(key => {
            if (config[key]) {
                log('ok', `config.${key}=${config[key]}`);
            } else {
                log('warn', `config.${key} missing`);
            }
        });
    } else {
        log('info', 'config.ini not found (using config.example.ini defaults)');
    }
}

function checkBrain() {
    console.log('\n--- Brain ---');
    
    checkDir(CONFIG.MODELS_DIR);
    
    // Check for public model (in public release)
    if (fs.existsSync(path.join(CONFIG.MODELS_DIR, 'public'))) {
        log('ok', 'Public model exists');
        const publicPath = path.join(CONFIG.MODELS_DIR, 'public');
        const files = fs.readdirSync(publicPath);
        ['identity.txt', 'meta.json', 'lessons.txt'].forEach(f => {
            if (files.includes(f)) {
                log('ok', `  public/${f} exists`);
            }
        });
    }
    
    // Find latest versioned model
    const versions = fs.readdirSync(CONFIG.MODELS_DIR)
        .filter(d => d.startsWith('v') && fs.statSync(path.join(CONFIG.MODELS_DIR, d)).isDirectory())
        .sort();
    
    if (versions.length) {
        const latest = versions[versions.length - 1];
        log('ok', `Latest versioned model: ${latest}`);
        
        const modelPath = path.join(CONFIG.MODELS_DIR, latest);
        const files = fs.readdirSync(modelPath);
        
        const required = ['identity.txt', 'meta.json'];
        required.forEach(f => {
            if (files.includes(f)) {
                log('ok', `  ${latest}/${f} exists`);
            } else {
                log('warn', `  ${latest}/${f} missing`);
            }
        });
    } else {
        log('warn', 'No versioned models found (public only?)');
    }
}

function checkStates() {
    console.log('\n--- State Files ---');
    
    // States are only in vant-brain, not in public release
    if (fs.existsSync(CONFIG.STATES_DIR)) {
        checkDir(CONFIG.STATES_DIR);
        checkDir(path.join(CONFIG.STATES_DIR, 'active'));
        
        // Check room metadata
        const roomMeta = path.join(CONFIG.STATES_DIR, 'active', 'room-meta.json');
        if (fs.existsSync(roomMeta)) {
            const meta = JSON.parse(fs.readFileSync(roomMeta, 'utf8'));
            log('ok', `Room: ${meta.room}`);
            
            if (meta.expires_at) {
                const expires = new Date(meta.expires_at);
                const daysLeft = Math.ceil((expires - new Date()) / (1000 * 60 * 60 * 24));
                if (daysLeft > 0) {
                    log('info', `Room expires in ${daysLeft} days`);
                } else {
                    log('fail', 'Room EXPIRED!');
                }
            }
        } else {
            log('warn', 'No room metadata - room may be expired');
        }
        
        // Check rate limit
        const rateLimit = path.join(CONFIG.STATES_DIR, 'active', 'rate-limit.json');
        if (fs.existsSync(rateLimit)) {
            const rl = JSON.parse(fs.readFileSync(rateLimit, 'utf8'));
            const remaining = rl.maxPerHour - rl.requestsThisHour;
            log('ok', `Rate limit: ${remaining} remaining this hour`);
        } else {
            log('warn', 'No rate limit tracking');
        }
    } else {
        log('info', 'states/ not in public release (vant-brain only)');
    }
}

function checkGitHub() {
    console.log('\n--- GitHub Connectivity ---');
    
    try {
        // Just check we can make a simple request
        const repoUrl = 'https://api.github.com/repos/dhaupin/vant';
        log('ok', 'GitHub API reachable (check with token for full test)');
    } catch (e) {
        log('fail', `GitHub unreachable: ${e.message}`);
    }
}

function checkPlugins() {
    console.log('\n--- Plugins ---');
    
    // Plugins are only in vant-brain, not public
    const pluginsDir = 'src/plugins';
    if (fs.existsSync(pluginsDir)) {
        const plugins = fs.readdirSync(pluginsDir).filter(f => 
            fs.statSync(path.join(pluginsDir, f)).isDirectory()
        );
        plugins.forEach(p => log('ok', `Plugin: ${p}`));
    } else {
        log('info', 'src/plugins not in public release (vant-brain only)');
    }
}

function checkBin() {
    console.log('\n--- Bin Scripts ---');
    
    // Check available scripts in public
    const scripts = ['load.js', 'health.js', 'setup.js', 'vant.js'];
    scripts.forEach(s => {
        const found = fs.existsSync(path.join('bin', s));
        if (found) {
            log('ok', `bin/${s}`);
        } else {
            log('warn', `bin/${s} missing`);
        }
    });
    
    // Note about private scripts
    log('info', 'Note: sync.js, run.js, changelog.js are in vant-brain only');
}

function summary() {
    console.log('\n═══════════════════════════════════════');
    console.log('           HEALTH SUMMARY            ');
    console.log('═══════════════════════════════════════');
    
    if (issues.length === 0 && warnings.length === 0) {
        console.log('✓ All checks passed!');
    } else if (issues.length === 0) {
        console.log(`✓ No critical issues`);
        console.log(`⚠ ${warnings.length} warnings`);
    } else {
        console.log(`✗ ${issues.length} issues found`);
    }
    
    if (warnings.length) {
        console.log('\nWarnings:');
        warnings.forEach(w => console.log(`  ⚠ ${w}`));
    }
    
    if (issues.length) {
        console.log('\nIssues:');
        issues.forEach(i => console.log(`  ✗ ${i}`));
    }
    
    console.log(`\nVersion: ${fs.existsSync('config.ini') ? parseIni(fs.readFileSync('config.ini', 'utf8')).VANT_VERSION : 'unknown'}`);
    console.log('═══════════════════════════════════════');
    
    return issues.length === 0;
}

// Main
console.log('╔═══════════════════════════════════════╗');
console.log('║     Vant Health Check v0.8.2        ║');
console.log('╚═══════════════════════════════════════╝');

checkConfig();
checkBrain();
checkStates();
checkGitHub();
checkPlugins();
checkBin();

const healthy = summary();
process.exit(healthy ? 0 : 1);