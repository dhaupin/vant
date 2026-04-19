/**
 * Brain Loader
 * Loads and manages VANT brain with category folders
 * 
 * Structure:
 *   models/v0.5.0/
 *     identity.yaml    - Core identity
 *     learnings/       - Lessons and learnings
 *     memories/        - Long-term memories
 *     decisions/       - Key decisions
 *     todos/           - Pending tasks
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml'); // You'll need: npm install yaml

const MODELS_PATH = path.join(__dirname, '..', 'models');

let currentBrain = {
    identity: null,
    learnings: {},
    memories: {},
    decisions: {},
    todos: {}
};
let currentVersion = null;

/**
 * Load brain from version folder
 * @param {string} version - Version to load (default: latest)
 */
function load(version = 'latest') {
    if (version === 'latest') {
        const versions = fs.readdirSync(MODELS_PATH).filter(d => 
            fs.statSync(path.join(MODELS_PATH, d)).isDirectory() && d.startsWith('v')
        );
        version = versions.sort().pop();
    }
    
    const brainPath = path.join(MODELS_PATH, version);
    if (!fs.existsSync(brainPath)) {
        throw new Error(`Brain not found: ${version}`);
    }
    
    // Reset brain
    currentBrain = {
        identity: null,
        learnings: {},
        memories: {},
        decisions: {},
        todos: {}
    };
    
    // Load identity.yaml
    const identityPath = path.join(brainPath, 'identity.yaml');
    if (fs.existsSync(identityPath)) {
        try {
            const yamlContent = fs.readFileSync(identityPath, 'utf8');
            // Handle multiple documents - get first
            const docs = yaml.parseAllDocuments(yamlContent);
            if (docs.length > 0) {
                currentBrain.identity = docs[0].toJSON();
            }
        } catch (e) {
            console.warn(`[Brain] Could not parse identity.yaml: ${e.message}`);
            // Try as plain text
            currentBrain.identity = { raw: fs.readFileSync(identityPath, 'utf8') };
        }
    }
    
    // Load category folders
    const categories = ['learnings', 'memories', 'decisions', 'todos'];
    
    // Supported file extensions
    const supportedExts = ['.md', '.txt', '.json', '.yaml', '.yml'];
    
    categories.forEach(cat => {
        const catPath = path.join(brainPath, cat);
        if (fs.existsSync(catPath)) {
            const files = fs.readdirSync(catPath).filter(f => {
                const ext = path.extname(f).toLowerCase();
                return supportedExts.includes(ext);
            });
            files.forEach(file => {
                const filePath = path.join(catPath, file);
                const ext = path.extname(file).toLowerCase();
                const key = path.basename(file, ext);
                let content = fs.readFileSync(filePath, 'utf8');
                
                // Parse JSON/YAML if needed, store as raw string
                if (ext === '.json') {
                    try {
                        content = JSON.stringify(JSON.parse(content), null, 2);
                    } catch (e) {
                        console.warn(`[Brain] Could not parse ${cat}/${file}: ${e.message}`);
                    }
                } else if (ext === '.yaml' || ext === '.yml') {
                    try {
                        // yaml is already required at top of file
                        const doc = yaml.parse(content);
                        content = doc ? JSON.stringify(doc, null, 2) : content;
                    } catch (e) {
                        console.warn(`[Brain] Could not parse ${cat}/${file}: ${e.message}`);
                    }
                }
                
                currentBrain[cat][key] = content;
            });
        }
    });
    
    currentVersion = version;
    console.log(`[Brain] Loaded ${version}:`);
    console.log(`  - identity: ${currentBrain.identity ? 'yes' : 'no'}`);
    console.log(`  - learnings: ${Object.keys(currentBrain.learnings).length} files`);
    console.log(`  - memories: ${Object.keys(currentBrain.memories).length} files`);
    console.log(`  - decisions: ${Object.keys(currentBrain.decisions).length} files`);
    console.log(`  - todos: ${Object.keys(currentBrain.todos).length} files`);
    
    return { version, brain: currentBrain };
}

/**
 * Get identity
 */
function getIdentity() {
    return currentBrain.identity;
}

/**
 * Get category content
 * @param {string} category - learnings, memories, decisions, todos
 * @param {string} key - Specific file key
 */
function get(category, key = null) {
    if (!currentBrain[category]) return null;
    
    if (key) {
        return currentBrain[category][key] || null;
    }
    
    return { ...currentBrain[category] };
}

/**
 * Get all brain content
 */
function getAll() {
    return { ...currentBrain };
}

/**
 * Get current version
 */
function getVersion() {
    return currentVersion;
}

/**
 * Write to brain category
 * @param {string} category - learnings, memories, decisions, todos
 * @param {string} key - File key (without extension)
 * @param {string} content - Content to write
 * @param {string} format - Optional: 'md', 'txt', 'json', 'yaml' (default: 'md')
 */
function write(category, key, content, format = 'md') {
    if (!currentBrain[category]) {
        throw new Error(`Invalid category: ${category}`);
    }
    
    // Validate format
    const validFormats = ['md', 'txt', 'json', 'yaml', 'yml'];
    if (!validFormats.includes(format)) {
        throw new Error(`Invalid format: ${format}. Use: ${validFormats.join(', ')}`);
    }
    
    // Ensure directory exists
    const version = currentVersion || 'v0.5.0';
    const catPath = path.join(MODELS_PATH, version, category);
    if (!fs.existsSync(catPath)) {
        fs.mkdirSync(catPath, { recursive: true });
    }
    
    // Handle JSON/YAML serialization
    let fileContent = content;
    if (format === 'json') {
        try {
            fileContent = typeof content === 'string' ? JSON.stringify(JSON.parse(content), null, 2) : JSON.stringify(content, null, 2);
        } catch (e) {
            throw new Error(`Invalid JSON: ${e.message}`);
        }
    } else if (format === 'yaml' || format === 'yml') {
        // Keep as-is or could add YAML stringify
        fileContent = content;
    }
    
    // Write file
    const ext = format === 'yml' ? 'yaml' : format;
    const filePath = path.join(catPath, `${key}.${ext}`);
    fs.writeFileSync(filePath, fileContent);
    
    // Update memory
    currentBrain[category][key] = fileContent;
    console.log(`[Brain] Wrote ${category}/${key}.${ext}`);
}

/**
 * Append to existing file or create new
 * @param {string} category - learnings, memories, decisions, todos
 * @param {string} key - File key
 * @param {string} content - Content to append
 */
function append(category, key, content) {
    const existing = get(category, key);
    const newContent = existing ? `${existing}\n\n---\n\n${content}` : content;
    write(category, key, newContent);
}

/**
 * Has key in category
 */
function has(category, key) {
    return currentBrain[category] && !!currentBrain[category][key];
}

// Auto-load latest on init
try {
    load('latest');
} catch (e) {
    console.log('[Brain] No brain loaded yet');
}

module.exports = {
    load,
    getIdentity,
    get,
    getAll,
    getVersion,
    write,
    append,
    has,
    version: getVersion
};