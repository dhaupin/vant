#!/usr/bin/env node
const vaf = require("../lib/vaf");

/**
 * Vant Sync
 * Pull and push to GitHub
 * 
 * IMPORTANT: GitHub TOS prohibits using git as a database.
 *             Do NOT auto-commit. User must manually sync.
 * 
 * All args should have both long (--arg) and short (-a) forms.
 * 
 * Usage: vant sync [-h|--help] [-p|-r|-s] [message]
 *        vant sync --push [message]
 *        vant sync --pull
 *        vant sync --status
 */

// Universal -h/--help
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log('Usage: vant sync [-h|--help] [-p|-r|-s] [message]');
    console.log('');
    console.log('  -h, --help    Show this help');
    console.log('  -p, --push   Push to GitHub');
    console.log('  -r, --pull   Pull from GitHub (default)');
    console.log('  -s, --status Show git status');
    console.log('');
    console.log('  message     Optional commit message for push');
    process.exit(0);
}

// Parse args: support both -p/--push, -r/--pull, -s/--status
const argsSet = new Set(args);
const action = (argsSet.has('-p') || argsSet.has('--push')) ? 'push' :
              (argsSet.has('-r') || argsSet.has('--pull')) ? 'pull' :
              (argsSet.has('-s') || argsSet.has('--status')) ? 'status' :
              args[0] || 'pull';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.CONFIG_PATH || 'config.ini';
const DEFAULT_BRANCH = 'main';

/**
 * Load config
 */
function loadConfig() {
    const config = {};
    const configPath = CONFIG_PATH;
    
    if (!fs.existsSync(configPath)) {
        return config;
    }
    
    const content = fs.readFileSync(configPath, 'utf8');
    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const [key, value] = trimmed.split('=');
            config[key.trim()] = value.trim();
        }
    });
    
    return config;
}

/**
 * Run git command
 */
function git(args) {
    try {
        return execSync(args.join(' '), { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
        return e.message;
    }
}

/**
 * Get remote URL with token
 */
function getRemoteUrl() {
    const config = loadConfig();
    const repo = config.GITHUB_REPO;
    
    if (!repo) {
        return null;
    }
    
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        return null;
    }
    
    return `https://github.com/${repo}.git`;
}

/**
 * Pull from GitHub
 */
function pull() {
    const url = getRemoteUrl();
    if (!url) {
        console.log('Config not set. Run vant setup first.');
        return { success: false, error: 'No config' };
    }
    
    console.log('[Sync] Pulling from GitHub...');
    
    try {
        execSync('git fetch origin', { stdio: 'pipe' });
        execSync(`git reset --hard origin/${DEFAULT_BRANCH}`, { stdio: 'pipe' });
        console.log('[Sync] Pulled successfully');
        return { success: true };
    } catch (e) {
        console.log('[Sync] Pull failed:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Push to GitHub
 */
function push(message = 'Vant update') {
    const token = process.env.GITHUB_TOKEN;
    vaf.check(message, {type: "string", name: "message", maxLength: 200});
    const url = getRemoteUrl();
    if (!url) {
        console.log('Config not set. Run vant setup first.');
        return { success: false, error: 'No config' };
    }
    
    console.log('[Sync] Pushing to GitHub...');
    
    try {
        execSync('git add -A', { stdio: 'pipe' });
        const status = execSync('git status --porcelain', { encoding: 'utf8' });
        
        if (!status.trim()) {
            console.log('[Sync] No changes to push');
            return { success: true, changes: false };
        }
        
        execSync(`git commit -m "${message}"`, { stdio: 'pipe' });
        // SECURITY: Use git config token instead of URL
if (token) {
    const os = require('os');
    const tmp = fs.mkdtempSync(os.tmpdir() + '/vant-');
    fs.writeFileSync(tmp + '/git-credentials', `https://${token}:x-oauth-basic@github.com\n`);
    execSync(`git config --local credential.helper store`);
    execSync(`git config --local credential.useHttpPath true`);
    execSync(`git config --local user.token ${token.replace(/./, '*')}`);
}
execSync(`git push ${url} ${DEFAULT_BRANCH}`, { stdio: 'pipe' });
        console.log('[Sync] Pushed successfully');
        return { success: true, changes: true };
    } catch (e) {
        console.log('[Sync] Push failed:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Main
 */
function main() {
    // Use action parsed at top-level, or default to pull
    const message = args.slice(1).join(' ') || 'Vant update';
    
    if (action === 'push') {
        push(message);
    } else if (action === 'pull') {
        pull();
    } else if (action === 'status') {
        console.log(git(['status']));
    } else {
        console.log('Usage: vant sync [-h|--help] [-p|-r|-s]');
        process.exit(1);
    }
}

main();