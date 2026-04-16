#!/usr/bin/env node
/**
 * Vant Sync
 * Pull and push to GitHub
 * 
 * Usage: vant sync
 *        vant sync push
 *        vant sync pull
 */

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
    
    return `https://${token}@github.com/${repo}.git`;
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
    const args = process.argv.slice(3);
    const action = args[0] || 'pull';
    
    if (action === 'push') {
        const message = args.slice(1).join(' ') || 'Vant update';
        push(message);
    } else if (action === 'pull') {
        pull();
    } else if (action === 'status') {
        console.log(git(['status']));
    } else {
        console.log('Usage: vant sync [pull|push|status]');
    }
}

main();