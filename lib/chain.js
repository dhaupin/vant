/**
 * Vant Skill Chain Loader
 * 
 * Parses skill markdown definitions to build execution chains.
 * Reads docs/runtime/vant-skill-*.md -> extracts chain order.
 * 
 * Usage:
 *   const chain = require('./chain');
 *   chain.load('vant-skill-chain-test');  // returns ordered skill names
 *   chain.execute('vant-skill-chain-test', ctx); // runs chain
 */

const fs = require('fs');
const path = require('path');

const RUNTIME_DIR = path.join(__dirname, '../docs/runtime');

// Cache loaded chains
const _chains = new Map();

/**
 * Load a skill chain by name
 * @param {string} name - Skill name (e.g., 'vant-skill-chain-test')
 * @returns {Object} - { name, steps: [{ skill, purpose }] }
 */
function load(name) {
    if (_chains.has(name)) {
        return _chains.get(name);
    }
    
    const filePath = path.join(RUNTIME_DIR, `${name}.md`);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Skill not found: ${name}`);
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = _parseFrontmatter(content);
    
    // Extract chain order from ## Chain section
    const chain = _parseChain(parsed.body);
    
    const result = {
        name,
        meta: parsed.meta || {},
        steps: chain
    };
    
    _chains.set(name, result);
    return result;
}

/**
 * Parse markdown frontmatter (yaml) from content
 */
function _parseFrontmatter(content) {
    const result = { raw: content };
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (fmMatch) {
        const yaml = require('yaml');
        try {
            result.meta = yaml.parse(fmMatch[1]) || {};
            result.body = content.slice(fmMatch[0].length).trim();
        } catch (e) {
            result.meta = {};
            result.body = content;
        }
    } else {
        result.body = content;
    }
    return result;
}

/**
 * Parse chain ordering from markdown body
 * @param {string} body - Markdown body
 * @returns {Array} - [{ skill, purpose }]
 */
function _parseChain(body) {
    const steps = [];
    
    // Split into lines
    const lines = body.split('\n');
    let inChainSection = false;
    let inOrderedList = false;
    
    for (const line of lines) {
        // Detect ## Chain header
        if (line.match(/^##?\s+Chain/i)) {
            inChainSection = true;
            continue;
        }
        
        // Exit chain section on next ## header
        if (inChainSection && line.match(/^##?\s+/) && !line.match(/^##?\s+Chain/i)) {
            break;
        }
        
        if (!inChainSection) continue;
        
        // Match numbered list: 1. **vant-skill-*.md**
        const numMatch = line.match(/^\d+\.\s+\*\*([vant\-skill\-][^*]+)\.md\*\*/);
        if (numMatch) {
            steps.push({
                skill: numMatch[1],
                purpose: ''
            });
            inOrderedList = true;
            continue;
        }
        
        // Match purpose (next lines after skill ref)
        if (inOrderedList && line.match(/^\s+-/)) {
            const purpose = line.replace(/^\s+-\s+/, '').trim();
            if (purpose && steps.length > 0) {
                steps[steps.length - 1].purpose = purpose;
            }
        }
    }
    
    return steps;
}

/**
 * Execute a skill chain
 * @param {string} name - Chain name
 * @param {Object} ctx - Execution context
 * @returns {Promise<Object>} - { chain, results, error? }
 */
async function execute(name, ctx = {}) {
    const chain = load(name);
    const results = [];
    
    for (const step of chain.steps) {
        try {
            // Delegate to sub-skill
            const result = await _invokeSkill(step.skill, ctx);
            results.push({
                skill: step.skill,
                status: 'ok',
                result
            });
        } catch (e) {
            results.push({
                skill: step.skill,
                status: 'error',
                error: e.message
            });
            
            // Stop on error unless force
            if (!ctx.force) {
                break;
            }
        }
    }
    
    return {
        chain: name,
        meta: chain.meta,
        steps: chain.steps,
        results
    };
}

/**
 * Invoke individual skill (placeholder - to be wired to MCP/skill invoker)
 */
async function _invokeSkill(skill, ctx) {
    // TODO: Wire to skill_invoke RPC when implemented
    return { skill, invoked: true, ctx };
}

/**
 * List all available skill chains
 */
function list() {
    const files = fs.readdirSync(RUNTIME_DIR);
    const chains = files
        .filter(f => f.startsWith('vant-skill-chain') && f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
    
    return chains.map(name => {
        const ch = load(name);
        return {
            name,
            steps: ch.steps.map(s => s.skill)
        };
    });
}

/**
 * Clear cache (for testing)
 */
function clearCache() {
    _chains.clear();
}

module.exports = {
    load,
    execute,
    list,
    clearCache,
    // Expose for testing
    _parseChain
};

// Self-test
if (require.main === module) {
    console.log('[chain] loaded, available:', list().length, 'chains');
}