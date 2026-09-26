#!/usr/bin/env node
/**
 * Vant Rerank CLI
 * RAG-powered memory reranking and compression
 * 
 * All args should have both long (--arg) and short (-a) forms.
 * 
 * Usage:
 *   vant rerank -h|--help
 *   vant rerank <query> [-k|--top-k <n>] [-t|--max-tokens <n>]
 *   vant rerank.compress <file> [-t|--max-tokens <n>]
 *   vant rerank.refine <query> [-k|--top-k <n>] [-t|--max-tokens <n>]
 *   vant rerank -s|--stats
 */

const path = require('path');
const DIR = path.join(__dirname, '..');

// -h/--help
const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
    console.log('Usage: vant rerank [-h|--help] <query> [options]');
    console.log('       vant rerank.compress <file> [options]');
    console.log('       vant rerank.refine <query> [options]');
    console.log('       vant rerank -s|--stats');
    console.log('');
    console.log('RAG-powered memory reranking and compression.');
    console.log('');
    console.log('Commands:');
    console.log('  <query>        Rerank memories against query (default)');
    console.log('  compress      Compress memories using token budget');
    console.log('  refine        Rerank + compress (refine memories)');
    console.log('');
    console.log('Options:');
    console.log('  -h, --help         Show this help');
    console.log('  -k, --top-k       Top K results to return (default: 5)');
    console.log('  -t, --max-tokens  Max tokens for compression (default: 2000)');
    console.log('  -s, --stats        Show rerank statistics');
    console.log('  -v, --verbose     Verbose output');
    console.log('');
    console.log('Examples:');
    console.log('  vant rerank "lessons learned"');
    console.log('  vant rerank "security fixes" -k 10');
    console.log('  vant rerank.refine "memory" -t 4000');
    console.log('  vant rerank.compress lessons.md -t 1000');
    process.exit(0);
}

// Parse command
const command = args[0];
const hasStats = args.includes('-s') || args.includes('--stats');
const hasVerbose = args.includes('-v') || args.includes('--verbose');

// Options parsing
const getOption = (short, long, defaultVal) => {
    const idx = args.indexOf(short);
    if (idx >= 0 && args[idx + 1]) return args[idx + 1];
    const lidx = args.findIndex(a => a.startsWith(long + '='));
    if (lidx >= 0) return args[lidx].split('=')[1];
    return defaultVal;
};

const topK = parseInt(getOption('-k', '--top-k', '5'));
const maxTokens = parseInt(getOption('-t', '--max-tokens', '2000'));

// Load modules
const rerank = require(path.join(DIR, 'lib', 'search'));

/**
 * Get memories from brain files
 */
function getMemories() {
    // Look in current brain (models/public/vant by default in dual mode)
    const modelsPath = path.join(DIR, 'models', 'public', 'vant');
    const memories = [];
    
    // Look for common memory files
    const memoryFiles = ['lessons.md', 'errors.md', 'goals.md', 'fears.md', 'identity.md', 'creed.md'];
    
    for (const file of memoryFiles) {
        const filePath = path.join(modelsPath, file);
        try {
            if (require('fs').existsSync(filePath)) {
                const content = require('fs').readFileSync(filePath, 'utf8');
                if (content.trim()) {
                    memories.push({
                        id: file,
                        title: file.replace('.md', ''),
                        content: content.substring(0, 5000), // Limit for rerank
                        date: new Date().toISOString()
                    });
                }
            }
        } catch (e) {
            // Skip unreadable files
        }
    }
    
    return memories;
}

/**
 * Show stats
 */
function showStats() {
    const memories = getMemories();
    console.log(`
╔═══════════════════════════════════════╗
║         Vant Rerank Stats            ║
╚════════════════════════════════════════╝

Available Memories: ${memories.length}
Default Top-K: ${topK}
Default Max-Tokens: ${maxTokens}

Modules:
  - rerank(query, memories, topK)
  - compress(memories, maxTokens)
  - pipeline(query, memories, { topK, maxTokens })
`);
}

/**
 * Run rerank
 */
async function runRerank(query) {
    const memories = getMemories();
    
    if (memories.length === 0) {
        console.log('[Rerank] No memories found');
        return;
    }
    
    if (hasVerbose) console.log('[Rerank] Scored ' + memories.length + ' memories');
    
    const results = rerank.rerank(memories, query, topK);
    
    console.log('\n[Rerank] Top ' + results.length + ' results for: ' + query);
    console.log('─'.repeat(40));
    
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const score = r.rerankScore || 0;
        console.log((i + 1) + '. [' + score + '] ' + r.title);
        if (hasVerbose && r.content) {
            const preview = r.content.substring(0, 100).replace(/\n/g, ' ');
            console.log('   ' + preview + '...');
        }
    }
    
    return results;
}

/**
 * Refine memories (rerank + compress)
 */
async function refine(query) {
    const memories = getMemories();
    
    if (memories.length === 0) {
        console.log('[Refine] No memories found');
        return;
    }
    
    const result = rerank.refine(memories, query, { topK, maxTokens });
    
    console.log('\n[Refine] Results for: ' + query);
    console.log('─'.repeat(40));
    console.log('Input: ' + result.stats.input + ' memories');
    console.log('Output: ' + result.stats.output + ' memories');
    console.log('Est. Tokens: ' + result.stats.estimatedTokens);
    console.log('Max Tokens: ' + maxTokens);
    
    return result;
}

/**
 * Run compression
 */
async function runCompress() {
    const memories = getMemories();
    
    if (memories.length === 0) {
        console.log('[Compress] No memories found');
        return;
    }
    
    const result = rerank.compress(memories, maxTokens);
    
    console.log('\n[Compress] Results');
    console.log('─'.repeat(40));
    console.log('Input: ' + memories.length + ' memories');
    console.log('Output: ' + result.length + ' memories');
    console.log('Max Tokens: ' + maxTokens);
    
    return result;
}

// Main
async function main() {
    if (hasStats) {
        showStats();
        return;
    }
    
    if (!command || command.startsWith('-')) {
        console.log('[Rerank] Missing query. Use -h for help.');
        process.exit(1);
    }
    
    if (command === 'compress') {
        await runCompress();
        return;
    }
    
    if (command === 'refine') {
        await refine(args.slice(1)[0] || '');
        return;
    }
    
    // Default: rerank
    await runRerank(command);
}

main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});