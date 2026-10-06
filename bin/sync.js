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

// Parse args: support both -p/--push, -r/--pull, -s/--status, --branch <name>
const argsSet = new Set(args);
const action = (argsSet.has('-p') || argsSet.has('--push')) ? 'push' :
              (argsSet.has('-r') || argsSet.has('--pull')) ? 'pull' :
              (argsSet.has('-s') || argsSet.has('--status')) ? 'status' :
              args[0] || 'pull';
const branchFlagIdx = args.indexOf('--branch');
const branchFlag = branchFlagIdx !== -1 ? args[branchFlagIdx + 1] : undefined;

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');

// Lazy-load sandbox
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) { try { _sandbox = require("../lib/sandbox"); } catch (e) {} }
    return _sandbox;
}
function _checkRead() { const sandbox = _getSandbox(); if (sandbox && !sandbox.canRead()) throw new Error("Read required"); }
function _checkWrite() { const sandbox = _getSandbox(); if (sandbox && !sandbox.canWrite()) throw new Error("Write required"); }
const path = require('path');

const CONFIG_PATH = process.env.CONFIG_PATH || 'config.ini';
const DEFAULT_BRANCH = 'main';

/**
 * Branch awareness (axolotl fix): work on the CURRENT branch, never a
 * hard-coded one. The old code pushed/pulled DEFAULT_BRANCH ('main')
 * unconditionally — on a feature branch (axolotl) that meant:
 *   pull → git reset --hard origin/main  (DESTROYS all branch work)
 *   push → git push <url> main           (wrong target)
 * Protected branches require an explicit --branch override; git's own
 * upstream tracking is used otherwise.
 */
const PROTECTED_BRANCHES = ['main', 'master'];
function getCurrentBranch() {
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch (e) {
        return null;
    }
}
function hasUpstream() {
    try {
        execSync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', { encoding: 'utf8', stdio: 'pipe' });
        return true;
    } catch (e) {
        return false;
    }
}
function resolveTargetBranch(flags = {}) {
    if (flags.branch) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(flags.branch) || flags.branch.includes('..')) {
            throw new Error('Invalid branch name: ' + flags.branch);
        }
        return flags.branch;
    }
    return getCurrentBranch() || DEFAULT_BRANCH;
}

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
        const branch = resolveTargetBranch({ branch: branchFlag });
        const current = getCurrentBranch();

        // GUARD: reset --hard discards ALL uncommitted/branch work. On a
        // protected branch require the explicit --branch opt-in; otherwise
        // refuse rather than destroy agent work.
        if (PROTECTED_BRANCHES.includes(branch) && branchFlag === undefined) {
            console.log(`[Sync] REFUSED: pull would 'git reset --hard origin/${branch}' on protected branch '${branch}'.`);
            console.log('        Pass --branch ' + branch + ' explicitly to confirm, or run from a feature branch.');
            return { success: false, error: 'protected branch requires --branch' };
        }
        if (current && PROTECTED_BRANCHES.includes(current) && !branchFlag) {
            console.log(`[Sync] REFUSED: currently on protected branch '${current}'.`);
            return { success: false, error: 'protected branch requires --branch' };
        }

        execSync('git fetch origin', { stdio: 'pipe' });
        if (current && branch === current) {
            // Fast-forward-ish reset against the tracked upstream of THIS branch
            const upstream = hasUpstream() ? `origin/${branch}` : null;
            execSync(`git reset --hard ${upstream || ('origin/' + branch)}`, { stdio: 'pipe' });
        } else {
            // Explicit cross-branch pull: still reset --hard, but at least it is opt-in
            execSync(`git reset --hard origin/${branch}`, { stdio: 'pipe' });
        }
        console.log(`[Sync] Pulled ${branch} successfully`);
        return { success: true, branch };
    } catch (e) {
        console.log('[Sync] Pull failed:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Push to GitHub
 */
function push(message = 'Vant update') {
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

        // (pass 30) execFileSync with argv-passed message — data, never
        // shell. The old execSync(`git commit -m "${message}"`) let
        // brain-file content execute (the P0 pattern
        // git-injection.test.js hunts).
        execFileSync('git', ['commit', '-m', message], { stdio: 'pipe' });
        // (pass 30) credential handling removed: the old block persisted the
        // token PLAINTEXT to /tmp/vant-*/git-credentials and left
        // credential.helper=store configured in the repo (the store helper
        // never even reads that path), plus wrote a junk masked value to
        // user.token in .git/config. Credentials are the caller's job
        // (managed credential injection, GCM, ssh remotes) — never ours.
        // (axolotl fix) push the CURRENT branch — the old code pushed
        // DEFAULT_BRANCH unconditionally, so feature-branch work targeted main
        const branch = resolveTargetBranch({ branch: branchFlag });
        const current = getCurrentBranch();
        if (PROTECTED_BRANCHES.includes(branch) && branch !== current) {
            console.log(`[Sync] REFUSED: cannot push '${branch}' (protected) unless you are ON it.`);
            return { success: false, error: 'protected branch push refused' };
        }
        execSync(`git push origin ${branch}`, { stdio: 'pipe' });
        console.log(`[Sync] Pushed ${branch} successfully`);
        return { success: true, changes: true, branch };
    } catch (e) {
        console.log('[Sync] Push failed:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Main
 */
function main() { _checkRead(); 
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