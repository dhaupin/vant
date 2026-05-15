/**
 * Brain Branch Manager (v0.0.1)
 * 
 * Auto-git-branch on brain writes with smart commits.
 * Auto-push to remote for backup.
 * 
 * Usage:
 *   node bin/branch-manager.js status   # Show branch status
 *   node bin/branch-manager.js auto      # Auto-branch on dirty
 *   node bin/branch-manager.js commit  # Commit pending changes
 *   node bin/branch-manager.js push     # Push to remote
 *   node bin/branch-manager.js pr      # Create PR if divergent
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MODELS_DIR = path.join(__dirname, '..', 'models');
const PRIVATE_BRAINS = path.join(MODELS_DIR, 'private');

const GIT_BIN = process.env.GIT_BIN || 'git';

/**
 * Run git command
 */
function git(args, opts = {}) {
    const cmd = `${GIT_BIN} ${args}`;
    try {
        return execSync(cmd, {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf8',
            ...opts
        }).trim();
    } catch (e) {
        if (opts.silent) return null;
        throw e;
    }
}

/**
 * Get current branch
 */
function getBranch() {
    return git('rev-parse --abbrev-ref HEAD');
}

/**
 * Get status
 */
function getStatus() {
    return git('status --porcelain');
}

/**
 * Get current commit
 */
function getCommit() {
    try {
        return git('rev-parse HEAD').slice(0, 7);
    } catch {
        return null;
    }
}

/**
 * Get diff from remote
 */
function getRemoteDiff() {
    return git('diff origin/main..HEAD --stat', { silent: true }) || 
           git('diff origin/master..HEAD --stat', { silent: true }) || '';
}

/**
 * Check if working directory is dirty
 */
function isDirty() {
    return getStatus().length > 0;
}

/**
 * Get changed brain files
 */
function getChangedBrains() {
    const status = getStatus();
    if (!status) return [];
    
    return status.split('\n')
        .filter(line => line.includes('private/'))
        .map(line => {
            const parts = line.trim().split(/\s+/);
            const file = parts[1] || parts[2];
            return file?.replace('private/', '').replace('.md', '');
        })
        .filter(Boolean);
}

/**
 * Create auto-branch from brain changes
 */
function autoBranch(options = {}) {
    const { prefix = 'agent' } = options;
    
    if (!isDirty()) {
        console.log('[branch] No changes to branch');
        return null;
    }
    
    const brains = getChangedBrains();
    const branchName = `${prefix}-${brains.join('-') || 'changes'}-${Date.now().toString(36)}`;
    
    // Create branch
    git(`checkout -b ${branchName}`);
    
    console.log(`[branch] Created branch: ${branchName}`);
    console.log(`[branch] Changed brains: ${brains.join(', ')}`);
    
    return branchName;
}

/**
 * Auto-commit with smart message from brain content
 */
function autoCommit(options = {}) {
    if (!isDirty()) {
        console.log('[commit] No changes to commit');
        return null;
    }
    
    const brains = getChangedBrains();
    const branch = getBranch();
    
    // Generate commit message from first brain
    let message = `Auto-commit: ${brains.join(', ')}`;
    
    if (brains.length > 0) {
        const firstBrain = brains[0];
        const brainPath = path.join(PRIVATE_BRAINS, firstBrain + '.md');
        if (fs.existsSync(brainPath)) {
            const content = fs.readFileSync(brainPath, 'utf8');
            const firstLine = content.split('\n').find(l => l.trim() && !l.startsWith('#'));
            if (firstLine && firstLine.length < 50) {
                message = firstLine.trim().slice(0, 72);
            }
        }
    }
    
    git(`add -A`);
    git(`commit -m "${message}"`);
    
    console.log(`[commit] Committed: ${message}`);
    console.log(`[commit] Branch: ${branch}`);
    
    return message;
}

/**
 * Push to remote
 */
function push(options = {}) {
    const { remote = 'origin', force = false } = options;
    const branch = getBranch();
    
    const flags = force ? '-f' : '';
    git(`push ${flags} ${remote} ${branch}`);
    
    console.log(`[push] Pushed ${branch} to ${remote}`);
    
    return { remote, branch };
}

/**
 * Create PR if divergent from main
 */
function createPR(options = {}) {
    const { title = null, body = '' } = options;
    const branch = getBranch();
    
    // Check if divergent
    const diff = getRemoteDiff();
    if (!diff) {
        console.log('[pr] Branch is up to date with main');
        return null;
    }
    
    // Auto PR title
    const prTitle = title || `Auto: ${getChangedBrains().join(', ') || branch}`;
    
    console.log(`[pr] Would create PR: ${prTitle}`);
    console.log(`[pr] Branch: ${branch}`);
    console.log(`[pr] Run: gh pr create --title "${prTitle}" --base main --head ${branch}`);
    
    return { title: prTitle, branch };
}

/**
 * Get full status
 */
function status() {
    const branch = getBranch();
    const commit = getCommit();
    const dirty = isDirty();
    const changed = getChangedBrains();
    const diff = getRemoteDiff();
    
    return {
        branch,
        commit,
        dirty,
        changed,
        diverged: diff.length > 0,
        diffLines: diff.split('\n').filter(Boolean).length
    };
}

// CLI
const cmd = process.argv[2];
const opts = process.argv.slice(3);

(async () => {
    try {
        switch (cmd) {
            case 'status': {
                const s = status();
                console.log(`
Branch Manager Status
--------------------
Branch:    ${s.branch}
Commit:    ${s.commit}
Dirty:    ${s.dirty}
Changed:  ${s.changed.join(', ') || 'none'}
Diverged:  ${s.diverged} (${s.diffLines} files)
                `);
                break;
            }
            case 'auto': {
                autoBranch();
                break;
            }
            case 'commit': {
                autoCommit();
                break;
            }
            case 'push': {
                push();
                break;
            }
            case 'pr': {
                createPR();
                break;
            }
            case 'diff': {
                const diff = getRemoteDiff() || 'No diff';
                console.log(diff);
                break;
            }
            default:
                console.log(`
Brain Branch Manager

Usage:
  vant branch status    # Show branch status
  vant branch auto     # Auto-branch on changes
  vant branch commit   # Auto-commit with smart msg
  vant branch push     # Push to remote
  vant branch pr      # Show PR command
  vant branch diff     # Show remote diff
                `);
        }
    } catch (e) {
        console.error('[branch] Error:', e.message);
        process.exit(1);
    }
})();