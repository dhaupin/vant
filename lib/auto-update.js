/**
 * Context Auto-Updater
 * Monitors conversation context and writes to brain before window fills
 * 
 * Features:
 * - Track message count and estimated tokens
 * - Auto-summarize key info to brain
 * - Configurable thresholds
 * - Sync to GitHub for next agent
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DEFAULT_THRESHOLD = 8000; // Tokens before auto-update
const DEFAULT_INTERVAL = 60; // Check every 60 seconds
const MAX_MESSAGES_TO_SUMMARIZE = 50;

// Message history (in-memory for now, could persist)
let messageHistory = [];
let lastSummaryLength = 0;

/**
 * Add message to history
 * @param {string} role - user, assistant, system
 * @param {string} content - Message content
 */
function addMessage(role, content) {
    messageHistory.push({
        role,
        content,
        timestamp: Date.now()
    });
    
    // Trim old messages if too many
    if (messageHistory.length > MAX_MESSAGES_TO_SUMMARIZE) {
        messageHistory = messageHistory.slice(-MAX_MESSAGES_TO_SUMMARIZE);
    }
}

/**
 * Estimate token count (rough)
 */
function estimateTokens(text) {
    // Average: 1 token ≈ 4 chars
    return Math.ceil(text.length / 4);
}

/**
 * Get total context tokens
 */
function getContextTokens() {
    let total = 0;
    messageHistory.forEach(m => {
        total += estimateTokens(m.content);
        // Add overhead for role
        total += 10;
    });
    return total;
}

/**
 * Extract key information from messages
 */
function extractKeyInfo() {
    if (messageHistory.length === 0) return null;
    
    const keyPoints = {
        decisions: [],
        codeChanges: [],
        learnings: [],
        todos: [],
        filesModified: []
    };
    
    // Simple keyword-based extraction
    messageHistory.forEach(m => {
        const content = m.content.toLowerCase();
        
        // Decisions
        if (content.includes('decided') || content.includes('will do') || content.includes('let\'s') || content.includes('yes please')) {
            keyPoints.decisions.push(m.content.substring(0, 200));
        }
        
        // Code changes
        if (content.includes('created') || content.includes('modified') || content.includes('fixed') || content.includes('updated')) {
            keyPoints.codeChanges.push(m.content.substring(0, 200));
        }
        
        // Learnings
        if (content.includes('learned') || content.includes('found') || content.includes('figured out')) {
            keyPoints.learnings.push(m.content.substring(0, 200));
        }
        
        // Todos
        if (content.includes('todo') || content.includes('pending') || content.includes('need to') || content.includes('should')) {
            keyPoints.todos.push(m.content.substring(0, 200));
        }
        
        // File paths
        const fileMatches = m.content.match(/\/[\w-.]+\.\w+/g);
        if (fileMatches) {
            fileMatches.forEach(f => {
                if (!keyPoints.filesModified.includes(f)) {
                    keyPoints.filesModified.push(f);
                }
            });
        }
    });
    
    // Dedupe and limit
    Object.keys(keyPoints).forEach(k => {
        keyPoints[k] = [...new Set(keyPoints[k])].slice(0, 10);
    });
    
    return keyPoints;
}

/**
 * Generate summary markdown
 */
function generateSummary() {
    const keyInfo = extractKeyInfo();
    if (!keyInfo) return null;
    
    const tokens = getContextTokens();
    const date = new Date().toISOString().split('T')[0];
    
    let summary = `# Context Summary - ${date}\n\n`;
    summary += `**Message count:** ${messageHistory.length}\n`;
    summary += `**Estimated tokens:** ${tokens}\n\n`;
    
    if (keyInfo.decisions.length) {
        summary += `## Decisions\n\n`;
        keyInfo.decisions.slice(0, 5).forEach(d => {
            summary += `- ${d}\n`;
        });
        summary += '\n';
    }
    
    if (keyInfo.codeChanges.length) {
        summary += `## Code Changes\n\n`;
        keyInfo.codeChanges.slice(0, 5).forEach(c => {
            summary += `- ${c}\n`;
        });
        summary += '\n';
    }
    
    if (keyInfo.learnings.length) {
        summary += `## Learnings\n\n`;
        keyInfo.learnings.slice(0, 5).forEach(l => {
            summary += `- ${l}\n`;
        });
        summary += '\n';
    }
    
    if (keyInfo.filesModified.length) {
        summary += `## Files Modified\n\n`;
        keyInfo.filesModified.forEach(f => {
            summary += `- ${f}\n`;
        });
        summary += '\n';
    }
    
    if (keyInfo.todos.length) {
        summary += `## Pending\n\n`;
        keyInfo.todos.slice(0, 5).forEach(t => {
            summary += `- ${t}\n`;
        });
    }
    
    return summary;
}

/**
 * Write summary to brain
 * @param {object} brain - Brain module
 */
function writeToBrain(brain) {
    const summary = generateSummary();
    if (!summary) return;
    
    // Check if we've already written this length
    if (summary.length === lastSummaryLength) {
        console.log('[AutoUpdate] No new content to write');
        return;
    }
    
    // Append to context session
    const date = new Date().toISOString().split('T')[0];
    brain.append('memories', `context-${date}`, summary);
    lastSummaryLength = summary.length;
    
    console.log(`[AutoUpdate] Wrote summary to brain (${summary.length} chars)`);
}

/**
 * Push to GitHub
 * NOTE: GitHub TOS prohibits using git as a database.
 *       Call this only when user explicitly requests sync.
 * @param {string} token - GitHub token
 * @param {string} repo - Repository (owner/repo)
 * @param {string} message - Commit message
 */
function pushToGitHub(token, repo, message = 'Auto-update brain') {
    // Simple git commit and push
    const { execSync } = require('child_process');
    
    try {
        execSync('git add -A', { stdio: 'pipe' });
        execSync(`git commit -m "${message}"`, { stdio: 'pipe' });
        execSync(`git push https://${token}@github.com/${repo}.git`, { stdio: 'pipe' });
        console.log('[AutoUpdate] Pushed to GitHub');
        return true;
    } catch (e) {
        console.log(`[AutoUpdate] Push failed: ${e.message}`);
        return false;
    }
}

/**
 * Check if auto-update needed
 * @param {number} threshold - Token threshold
 */
function shouldUpdate(threshold = DEFAULT_THRESHOLD) {
    const tokens = getContextTokens();
    return tokens >= threshold;
}

/**
 * Get stats
 */
function stats() {
    return {
        messageCount: messageHistory.length,
        estimatedTokens: getContextTokens(),
        lastSummaryLength
    };
}

/**
 * Reset history
 */
function reset() {
    messageHistory = [];
    lastSummaryLength = 0;
}

/**
 * Save brain on graceful exit
 * @param {object} brain - Brain module
 */
function saveOnExit(brain) {
    const exitHandler = (code) => {
        console.log(`\n[AutoUpdate] Saving before exit (code: ${code})...`);
        writeToBrain(brain);
        console.log('[AutoUpdate] Brain saved.');
        process.exit(0);
    };
    
    process.on('SIGINT', () => exitHandler(0));
    process.on('SIGTERM', () => exitHandler(0));
    process.on('exit', () => {
        // Write final summary
        writeToBrain(brain);
    });
}

/**
 * Get session summary for Vant changelog
 */
function getSessionSummary() {
    const keyInfo = extractKeyInfo();
    if (!keyInfo) return null;
    
    return {
        messageCount: messageHistory.length,
        tokens: getContextTokens(),
        decisions: keyInfo.decisions.length,
        filesModified: keyInfo.filesModified,
        learnings: keyInfo.learnings.slice(0, 3)
    };
}

module.exports = {
    addMessage,
    getContextTokens,
    shouldUpdate,
    generateSummary,
    writeToBrain,
    pushToGitHub,
    stats,
    reset,
    saveOnExit,
    getSessionSummary,
    DEFAULT_THRESHOLD
};