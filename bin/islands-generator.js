/**
 * Islands Generator (v0.0.1)
 * 
 * CLI to create new islands programmatically.
 * Add custom triggers and dynamic registration.
 * 
 * Usage:
 *   node bin/islands-generator.js create github --triggers "github,pr"
 *   node bin/islands_generator.js list
 *   node bin/islands_generator.js hydrate <name>
 *   node bin/islands_generator.js trigger <query>
 */

const fs = require('fs');
const path = require('path');
const REPO_ROOT = path.join(__dirname, '..');

// Load modules
const islands = require(path.join(REPO_ROOT, 'lib', 'islands'));
const brain = require(path.join(REPO_ROOT, 'lib', 'brain'));

/**
 * Get islands manifest
 */
function getManifest() {
    return islands.getManifest();
}

/**
 * Create new island definition
 */
function createIsland(name, options = {}) {
    const { type = 'static', source = 'corpus', triggers = [] } = options;
    
    const m = getManifest();
    
    // Validate name
    if (m.islands[name]) {
        console.log(`[create] Island '${name}' already exists`);
        return null;
    }
    
    // Add new island
    m.islands[name] = {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        type,
        source: type === 'static' ? 'corpus' : 'storage',
        triggers: triggers.map(t => t.toLowerCase())
    };
    
    islands.saveManifest(m);
    console.log(`[create] Created island: ${name}`);
    console.log(`[create] Type: ${type}, Triggers: ${triggers.join(', ') || 'none'}`);
    
    // Create brain file for static islands
    if (type === 'static') {
        const brainPath = brain.getBrainPath();
        const filePath = path.join(brainPath, name + '.md');
        
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, `# ${name}\n\nTODO: Add content for ${name} island.\n`);
            console.log(`[create] Created brain: ${name}.md`);
        }
    }
    
    return m.islands[name];
}

/**
 * Update island triggers
 */
function updateTriggers(name, triggers) {
    const m = getManifest();
    
    if (!m.islands[name]) {
        console.log(`[update] Island '${name}' not found`);
        return null;
    }
    
    m.islands[name].triggers = triggers.map(t => t.toLowerCase());
    islands.saveManifest(m);
    
    console.log(`[update] Updated triggers for ${name}: ${triggers.join(', ')}`);
    return m.islands[name];
}

/**
 * Add trigger to island
 */
function addTrigger(name, trigger) {
    const m = getManifest();
    
    if (!m.islands[name]) {
        console.log(`[add] Island '${name}' not found`);
        return null;
    }
    
    const t = trigger.toLowerCase();
    if (!m.islands[name].triggers.includes(t)) {
        m.islands[name].triggers.push(t);
    }
    
    islands.saveManifest(m);
    console.log(`[add] Added trigger '${t}' to ${name}`);
    return m.islands[name];
}

/**
 * List islands
 */
function listIslands() {
    const m = getManifest();
    const available = islands.getAvailable();
    const hydrated = islands.getHydrated();
    
    console.log(`[list] ${available.length} islands:`);
    for (const name of available) {
        const island = m.islands[name];
        const isHydrated = hydrated.includes(name);
        console.log(`  - ${name} (${island.type}) triggers=[${island.triggers?.join(', ') || 'none'}]${isHydrated ? ' *hydrated*' : ''}`);
    }
    return available;
}

/**
 * Find triggers for query
 */
function findTriggers(query) {
    const matches = islands.findTriggers(query);
    console.log(`[trigger] Query: "${query}"`);
    console.log(`[trigger] Matching islands: ${matches.join(', ') || 'none'}`);
    return matches;
}

/**
 * Auto-hydrate from query
 */
function autoHydrate(query) {
    const hydrated = islands.autoHydrate(query);
    console.log(`[hydrate] Auto-hydrated: ${hydrated.join(', ') || 'none'}`);
    return hydrated;
}

/**
 * Get island data
 */
async function loadIsland(name) {
    const data = await islands.load(name);
    if (data) {
        console.log(`[load] ${name}:`);
        console.log(`  source: ${data.source}`);
        console.log(`  content: ${data.content?.slice(0, 100)}...`);
    } else {
        console.log(`[load] ${name} not found (may need to create brain file)`);
    }
    return data;
}

/**
 * Get hydrated islands
 */
function getHydratedIslands() {
    const hydrated = islands.getHydrated();
    console.log(`[hydrated] ${hydrated.length} islands:`);
    for (const name of hydrated) {
        console.log(`  - ${name}`);
    }
    return hydrated;
}

/**
 * Seed example islands
 */
function seedExamples() {
    const examples = [
        { name: 'docker', type: 'lazy', triggers: ['docker', 'container', 'image'] },
        { name: 'kubernetes', type: 'lazy', triggers: ['k8s', 'kubectl', 'pod'] },
        { name: 'api', type: 'static', triggers: ['api', 'rest', 'endpoint'] },
    ];
    
    for (const ex of examples) {
        if (!getManifest().islands[ex.name]) {
            createIsland(ex.name, ex);
        }
    }
    
    console.log(`[seed] Added ${examples.length} example islands`);
    return examples;
}

// CLI
const cmd = process.argv[2];
const opts = process.argv.slice(3);

(async () => {
    try {
        switch (cmd) {
            case 'create': {
                const name = opts[0];
                if (!name) {
                    console.error('Usage: create <name> [--triggers x,y,z]');
                    process.exit(1);
                }
                const triggersIdx = opts.indexOf('--triggers');
                const triggers = triggersIdx >= 0 
                    ? opts[triggersIdx + 1]?.split(',') || []
                    : [];
                createIsland(name, { triggers });
                break;
            }
            case 'list': {
                listIslands();
                break;
            }
            case 'trigger': {
                const query = opts.join(' ');
                findTriggers(query);
                break;
            }
            case 'hydrate': {
                const name = opts[0];
                if (name) {
                    await loadIsland(name);
                } else {
                    const query = opts.join(' ');
                    if (query) {
                        autoHydrate(query);
                    } else {
                        console.error('Usage: hydrate <name|query>');
                        process.exit(1);
                    }
                }
                break;
            }
            case 'hydrated': {
                getHydratedIslands();
                break;
            }
            case 'add-trigger': {
                const name = opts[0];
                const trigger = opts[1];
                if (!name || !trigger) {
                    console.error('Usage: add-trigger <name> <trigger>');
                    process.exit(1);
                }
                addTrigger(name, trigger);
                break;
            }
            case 'seed': {
                seedExamples();
                break;
            }
            case 'load': {
                const name = opts[0];
                if (!name) {
                    console.error('Usage: load <name>');
                    process.exit(1);
                }
                await loadIsland(name);
                break;
            }
            default:
                console.log(`
Islands Generator

Usage:
  vant island create <name> [--triggers x,y,z]  # Create new island
  vant island list                        # List all islands
  vant island trigger <query>             # Find matching islands  
  vant island hydrate <name|query>       # Hydrate island(s)
  vant island hydrated                   # List hydrated islands
  vant island add-trigger <name> <trigger>    # Add trigger to island
  vant island seed                      # Add example islands
  vant island load <name>               # Load island content

Notes:
  - Static islands load from brain corpus files
  - Lazy islands use storage for dynamic data
  - Triggers determine auto-hydration from prompts
                `);
        }
    } catch (e) {
        console.error('[island] Error:', e.message);
        process.exit(1);
    }
})();