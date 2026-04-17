/**
 * Brain Engine - Unified Loader for VANT Brains
 * 
 * Supports:
 * - Multi-format: txt, json, yaml, markdown
 * - Smart semver parsing (not string sort)
 * - Delta computation between versions
 * - Version graph/lineage tracking
 * - Multi-brain composable rendering
 * - Cache + arbitration for resilient loading
 * - Keeper layer for security
 * 
 * Usage:
 *   node bin/brain-engine.js discover
 *   node bin/brain-engine.js load v0.5.0
 *   node bin/brain-engine.js graph
 *   node bin/brain-engine.js delta v0.5.0 v0.8.0
 *   node bin/brain-engine.js render --needs identity,memories
 *   node bin/brain-engine.js keeper-verify
 *   node bin/brain-engine.js cache-status
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('yaml');

const MODELS_DIR = path.join(__dirname, '..', 'models');
const STATES_DIR = path.join(__dirname, '..', 'states');
const CACHE_DIR = path.join(STATES_DIR, 'cache');
const KEEPERS_DIR = path.join(STATES_DIR, 'keepers');
const DELTAS_DIR = path.join(STATES_DIR, 'deltas');

// Ensure directories exist
[CACHE_DIR, KEEPERS_DIR, DELTAS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

let currentBrain = null;
let currentVersion = null;

// ============================================================
// FORMAT PARSERS (with failsafes)
// ============================================================

/**
 * Parse text format (key=value or flat text)
 */
function parseTxt(content, filePath) {
    try {
        const lines = content.trim().split('\n');
        const result = { _raw: content };
        
        lines.forEach(line => {
            line = line.trim();
            if (!line || line.startsWith('#')) return;
            
            if (line.includes('=')) {
                const [key, ...vals] = line.split('=');
                result[key.trim()] = vals.join('=').trim();
            } else {
                result[`_line_${Object.keys(result).length}`] = line;
            }
        });
        
        return result;
    } catch (e) {
        warn('txt', filePath, e.message);
        return { _raw: content, _error: e.message };
    }
}

/**
 * Parse JSON format
 */
function parseJson(content, filePath) {
    try {
        return JSON.parse(content);
    } catch (e) {
        warn('json', filePath, e.message);
        return { _raw: content, _error: e.message };
    }
}

/**
 * Parse YAML format (with multiple documents)
 */
function parseYaml(content, filePath) {
    try {
        const docs = yaml.parseAllDocuments(content);
        if (docs.length === 1) {
            return docs[0].toJSON();
        } else if (docs.length > 1) {
            return docs.map(d => d.toJSON());
        }
        return { _raw: content };
    } catch (e) {
        warn('yaml', filePath, e.message);
        return { _raw: content, _error: e.message };
    }
}

/**
 * Parse Markdown with optional frontmatter
 */
function parseMarkdown(content, filePath) {
    try {
        const result = { _raw: content };
        
        // Check for frontmatter
        if (content.startsWith('---')) {
            const endIdx = content.indexOf('---', 3);
            if (endIdx > 0) {
                const frontmatter = content.slice(3, endIdx).trim();
                const body = content.slice(endIdx + 3).trim();
                
                try {
                    result._frontmatter = parseYaml(frontmatter, filePath);
                } catch (e) {
                    result._frontmatter = { _raw: frontmatter };
                }
                result._body = body;
            }
        } else {
            result._body = content;
        }
        
        return result;
    } catch (e) {
        warn('md', filePath, e.message);
        return { _raw: content, _error: e.message };
    }
}

/**
 * Warn with rainbow message when parser fails
 */
function warn(format, filePath, error) {
    console.warn(`⚠ your ${format} failed bro, but I read it still, here's alert rainbow 🌈`);
    console.warn(`   File: ${filePath}`);
    console.warn(`   Error: ${error}`);
}

/**
 * Auto-detect format and parse
 */
function parseBrainFile(filePath, content) {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();
    
    // Check extension
    switch (ext) {
        case '.txt':
            return parseTxt(content, filePath);
        case '.json':
            return parseJson(content, filePath);
        case '.yaml':
        case '.yml':
            return parseYaml(content, filePath);
        case '.md':
            return parseMarkdown(content, filePath);
    }
    
    // Check basename for identity files
    if (basename === 'identity.yaml' || basename === 'identity.yml') {
        return parseYaml(content, filePath);
    }
    if (basename === 'identity.json') {
        return parseJson(content, filePath);
    }
    if (basename === 'identity.txt' || basename === 'identity.md') {
        return parseMarkdown(content, filePath);
    }
    if (basename === 'meta.json') {
        return parseJson(content, filePath);
    }
    
    // Default: try as text
    return parseTxt(content, filePath);
}

// ============================================================
// BRAIN DISCOVERY
// ============================================================

/**
 * Smart semver comparison
 */
function compareVersions(a, b) {
    // Extract version numbers
    const parseVer = (v) => {
        v = v.replace(/^v/, '');
        const parts = v.split(/[.-]/);
        return parts.map(p => {
            const num = parseInt(p, 10);
            return isNaN(num) ? 0 : num;
        });
    };
    
    const aParts = parseVer(a);
    const bParts = parseVer(b);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aVal = aParts[i] || 0;
        const bVal = bParts[i] || 0;
        if (aVal !== bVal) return aVal - bVal;
    }
    return 0;
}

/**
 * Discover all brain versions in models/
 */
function discoverBrains() {
    if (!fs.existsSync(MODELS_DIR)) {
        return [];
    }
    
    const dirs = fs.readdirSync(MODELS_DIR).filter(d => {
        const fullPath = path.join(MODELS_DIR, d);
        return fs.statSync(fullPath).isDirectory() && d !== 'backup';
    });
    
    // Sort by semver
    dirs.sort(compareVersions);
    
    return dirs.map(d => ({
        name: d,
        path: path.join(MODELS_DIR, d),
        isLatest: false,
        format: detectFormat(d)
    }));
}

/**
 * Detect primary format of a brain version
 */
function detectFormat(versionDir) {
    const brainPath = path.join(MODELS_DIR, versionDir);
    if (!fs.existsSync(brainPath)) return 'unknown';
    
    const files = fs.readdirSync(brainPath);
    
    if (files.includes('identity.yaml') || files.includes('identity.yml')) return 'yaml';
    if (files.includes('identity.json')) return 'json';
    if (files.some(f => f.endsWith('.json') && f !== 'meta.json')) return 'json';
    if (files.includes('identity.txt')) return 'txt';
    if (files.includes('identity.md') || files.includes('README.md')) return 'markdown';
    
    // Check for category folders (v0.5.0+ structure)
    const categories = ['learnings', 'memories', 'decisions', 'todos'];
    if (categories.some(c => fs.existsSync(path.join(brainPath, c)))) return 'yaml+folders';
    
    return 'txt';
}

// ============================================================
// BRAIN LOADING
// ============================================================

/**
 * Load a brain version
 */
function loadBrain(version) {
    const brainPath = path.join(MODELS_DIR, version);
    
    if (!fs.existsSync(brainPath)) {
        throw new Error(`Brain not found: ${version}`);
    }
    
    const brain = {
        version,
        format: detectFormat(version),
        identity: null,
        meta: null,
        files: {},
        categories: {
            learnings: {},
            memories: {},
            decisions: {},
            todos: {}
        }
    };
    
    // Load files from brain root
    const rootFiles = fs.readdirSync(brainPath);
    rootFiles.forEach(file => {
        const filePath = path.join(brainPath, file);
        if (fs.statSync(filePath).isDirectory()) return;
        
        const content = fs.readFileSync(filePath, 'utf8');
        const key = path.basename(file, path.extname(file));
        
        brain.files[file] = content;
        
        // Extract identity and meta
        if (file === 'identity.yaml' || file === 'identity.yml') {
            brain.identity = parseYaml(content, filePath);
        } else if (file === 'identity.json') {
            brain.identity = parseJson(content, filePath);
        } else if (file === 'identity.txt' || file === 'identity.md') {
            brain.identity = parseMarkdown(content, filePath);
        } else if (file === 'meta.json') {
            brain.meta = parseJson(content, filePath);
        }
    });
    
    // Load category folders
    const categories = ['learnings', 'memories', 'decisions', 'todos'];
    categories.forEach(cat => {
        const catPath = path.join(brainPath, cat);
        if (fs.existsSync(catPath)) {
            const files = fs.readdirSync(catPath);
            files.forEach(file => {
                if (!file.endsWith('.md')) return;
                const content = fs.readFileSync(path.join(catPath, file), 'utf8');
                const key = path.basename(file, '.md');
                brain.categories[cat][key] = content;
            });
        }
    });
    
    currentBrain = brain;
    currentVersion = version;
    
    return brain;
}

/**
 * Load latest brain
 */
function loadLatest() {
    const brains = discoverBrains();
    if (brains.length === 0) {
        throw new Error('No brains found');
    }
    
    const latest = brains[brains.length - 1];
    return loadBrain(latest.name);
}

/**
 * Get current brain
 */
function getCurrentBrain() {
    return currentBrain;
}

/**
 * Get current version
 */
function getCurrentVersion() {
    return currentVersion;
}

// ============================================================
// ARBITRATION LAYER (Cache + Fallback)
// ============================================================

/**
 * Get cached brain
 */
function getCachedBrain() {
    const cacheFile = path.join(CACHE_DIR, 'last-good.json');
    if (fs.existsSync(cacheFile)) {
        try {
            return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        } catch (e) {
            return null;
        }
    }
    return null;
}

/**
 * Cache brain as last working
 */
function cacheBrain(brain) {
    const cacheFile = path.join(CACHE_DIR, 'last-good.json');
    fs.writeFileSync(cacheFile, JSON.stringify(brain, null, 2));
    console.log('💾 Cached brain:', brain.version);
}

/**
 * Record failure
 */
function recordFailure(version, error) {
    const failureFile = path.join(CACHE_DIR, 'failures.json');
    let failures = {};
    
    if (fs.existsSync(failureFile)) {
        try {
            failures = JSON.parse(fs.readFileSync(failureFile, 'utf8'));
        } catch (e) {}
    }
    
    failures[version] = {
        error,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(failureFile, JSON.stringify(failures, null, 2));
    console.warn('⚠ Failure recorded:', version, error);
}

/**
 * Get failures
 */
function getFailures() {
    const failureFile = path.join(CACHE_DIR, 'failures.json');
    if (fs.existsSync(failureFile)) {
        try {
            return JSON.parse(fs.readFileSync(failureFile, 'utf8'));
        } catch (e) {
            return {};
        }
    }
    return {};
}

/**
 * Format fallback chain for arbitration
 */
const FORMAT_FALLBACK = ['yaml', 'json', 'txt', 'md'];

/**
 * Try format fallback sequence
 */
function tryFallback(version) {
    for (const format of FORMAT_FALLBACK) {
        try {
            const brain = loadBrain(version);
            if (brain) return brain;
        } catch (e) {
            console.log(`Fallback: ${format} failed, trying next...`);
        }
    }
    
    // Return cached if all fail
    const cached = getCachedBrain();
    if (cached) {
        console.log('⚠ Using cached brain (degraded mode)');
        return cached;
    }
    
    throw new Error('All formats failed, no cache available');
}

// ============================================================
// KEEPER LAYER (Security)
// ============================================================

/**
 * Compute hash of brain
 */
function computeHash(brain) {
    const content = JSON.stringify(brain, null, 2);
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Verify brain integrity
 */
function keeperVerify(brain) {
    const result = {
        valid: true,
        anomalies: [],
        checksums: {}
    };
    
    if (!brain) {
        result.valid = false;
        result.anomalies.push('No brain to verify');
        return result;
    }
    
    // Compute checksum
    result.checksum = computeHash(brain);
    result.checksums[brain.version] = result.checksum;
    
    // Check for unexpected keys
    const dangerous = ['_eval', '_exec', 'require', 'eval(', 'exec(', 'child_process'];
    Object.keys(brain).forEach(key => {
        if (dangerous.some(d => key.toLowerCase().includes(d))) {
            result.anomalies.push(`Suspicious key: ${key}`);
        }
    });
    
    if (brain.files) {
        Object.keys(brain.files).forEach(file => {
            const content = String(brain.files[file]);
            dangerous.forEach(d => {
                if (content.toLowerCase().includes(d)) {
                    result.anomalies.push(`Suspicious pattern in ${file}: ${d}`);
                }
            });
        });
    }
    
    // Store keeper record
    const keeperFile = path.join(KEEPERS_DIR, `${brain.version}.json`);
    fs.writeFileSync(keeperFile, JSON.stringify(result, null, 2));
    
    if (result.anomalies.length > 0) {
        console.warn('⚠ Keeper anomalies detected:');
        result.anomalies.forEach(a => console.warn('   -', a));
    } else {
        console.log('✓ Keeper verification passed');
    }
    
    return result;
}

/**
 * Get stored keeper record
 */
function getKeeperRecord(version) {
    const keeperFile = path.join(KEEPERS_DIR, `${version}.json`);
    if (fs.existsSync(keeperFile)) {
        try {
            return JSON.parse(fs.readFileSync(keeperFile, 'utf8'));
        } catch (e) {
            return null;
        }
    }
    return null;
}

// ============================================================
// DELTA ENGINE
// ============================================================

/**
 * Compute delta between two brain versions
 */
function computeDelta(fromVersion, toVersion) {
    const fromBrain = loadBrain(fromVersion);
    const toBrain = loadBrain(toVersion);
    
    const delta = {
        from: fromVersion,
        to: toVersion,
        added: {},
        modified: {},
        removed: {},
        timestamp: new Date().toISOString()
    };
    
    // Find added and modified
    Object.keys(toBrain.files || {}).forEach(file => {
        if (!fromBrain.files[file]) {
            delta.added[file] = toBrain.files[file];
        } else if (fromBrain.files[file] !== toBrain.files[file]) {
            delta.modified[file] = {
                from: fromBrain.files[file],
                to: toBrain.files[file]
            };
        }
    });
    
    // Find removed
    Object.keys(fromBrain.files || {}).forEach(file => {
        if (!toBrain.files[file]) {
            delta.removed[file] = fromBrain.files[file];
        }
    });
    
    // Check categories
    const categories = ['learnings', 'memories', 'decisions', 'todos'];
    categories.forEach(cat => {
        const fromCat = fromBrain.categories?.[cat] || {};
        const toCat = toBrain.categories?.[cat] || {};
        
        Object.keys(toCat).forEach(key => {
            if (!fromCat[key]) {
                delta.added[`${cat}/${key}`] = toCat[key];
            } else if (fromCat[key] !== toCat[key]) {
                delta.modified[`${cat}/${key}`] = {
                    from: fromCat[key],
                    to: toCat[key]
                };
            }
        });
        
        Object.keys(fromCat).forEach(key => {
            if (!toCat[key]) {
                delta.removed[`${cat}/${key}`] = fromCat[key];
            }
        });
    });
    
    // Save delta
    const deltaFile = path.join(DELTAS_DIR, `${fromVersion}..${toVersion}.json`);
    fs.writeFileSync(deltaFile, JSON.stringify(delta, null, 2));
    console.log('💾 Delta saved:', deltaFile);
    
    return delta;
}

// ============================================================
// VERSION GRAPH
// ============================================================

/**
 * Get version graph
 */
function getGraph() {
    const brains = discoverBrains();
    const nodes = brains.map(b => ({
        name: b.name,
        format: b.format
    }));
    
    // Try to extract lineage from identity files
    const edges = [];
    brains.forEach(brain => {
        try {
            const brn = loadBrain(brain.name);
            const parent = brn.identity?.parent || brn.identity?.parent_version;
            if (parent) {
                edges.push({ from: parent, to: brain.name });
            }
        } catch (e) {}
    });
    
    return { nodes, edges };
}

/**
 * Get lineage for a version
 */
function getLineage(version) {
    const lineage = [version];
    let current = version;
    
    while (true) {
        const brain = loadBrain(current);
        const parent = brain.identity?.parent || brain.identity?.parent_version;
        if (!parent) break;
        lineage.push(parent);
        current = parent;
    }
    
    return lineage;
}

// ============================================================
// MULTI-BRAIN RENDERER
// ============================================================

/**
 * Render brain from multiple versions based on needs
 * @param {object} options - { needs: ['identity', 'memories', 'learnings', 'decisions', 'todos'], priority: [] }
 */
function render(options = {}) {
    const needs = options.needs || ['identity'];
    const priority = options.priority || [];
    
    const result = {
        identity: null,
        learnings: {},
        memories: {},
        decisions: {},
        todos: {},
        sources: {}
    };
    
    // Load in priority order
    const versions = priority.length > 0 ? priority : discoverBrains().map(b => b.name).reverse();
    
    versions.forEach(version => {
        try {
            const brain = loadBrain(version);
            result.sources[version] = true;
            
            if (needs.includes('identity') && brain.identity) {
                result.identity = brain.identity;
            }
            
            if (needs.includes('learnings')) {
                Object.assign(result.learnings, brain.categories.learnings);
            }
            if (needs.includes('memories')) {
                Object.assign(result.memories, brain.categories.memories);
            }
            if (needs.includes('decisions')) {
                Object.assign(result.decisions, brain.categories.decisions);
            }
            if (needs.includes('todos')) {
                Object.assign(result.todos, brain.categories.todos);
            }
        } catch (e) {
            console.warn(`⚠ Could not load ${version}:`, e.message);
        }
    });
    
    return result;
}

// ============================================================
// CLI
// ============================================================

const args = process.argv.slice(2);
const command = args[0];

async function main() {
    switch (command) {
        case 'discover':
        case 'list':
            console.log('🧠 Brain Engine - Discovered Brains\n');
            const brains = discoverBrains();
            brains.forEach((b, i) => {
                const marker = i === brains.length - 1 ? '👉 ' : '   ';
                console.log(`${marker}${b.name} (${b.format})`);
            });
            console.log(`\nTotal: ${brains.length} brains`);
            break;
            
        case 'load':
            const version = args[1] || 'latest';
            console.log('🧠 Brain Engine - Loading\n');
            const brain = version === 'latest' ? loadLatest() : loadBrain(version);
            console.log(`Loaded: ${brain.version}`);
            console.log(`Format: ${brain.format}`);
            console.log(`Identity: ${brain.identity ? 'yes' : 'no'}`);
            console.log(`Files: ${Object.keys(brain.files).length}`);
            console.log(`Categories: learnings(${Object.keys(brain.categories.learnings).length}), memories(${Object.keys(brain.categories.memories).length})`);
            cacheBrain(brain);
            break;
            
        case 'graph':
            console.log('🧠 Brain Engine - Version Graph\n');
            const graph = getGraph();
            console.log('Nodes:', graph.nodes.map(n => n.name).join(', '));
            if (graph.edges.length > 0) {
                console.log('\nEdges:');
                graph.edges.forEach(e => console.log(`  ${e.from} → ${e.to}`));
            }
            break;
            
        case 'delta':
            const from = args[1];
            const to = args[2];
            if (!from || !to) {
                console.log('Usage: node bin/brain-engine.js delta <from-version> <to-version>');
                process.exit(1);
            }
            console.log('🧠 Brain Engine - Delta\n');
            const delta = computeDelta(from, to);
            console.log(`From: ${delta.from} → To: ${delta.to}`);
            console.log(`Added: ${Object.keys(delta.added).length}`);
            console.log(`Modified: ${Object.keys(delta.modified).length}`);
            console.log(`Removed: ${Object.keys(delta.removed).length}`);
            break;
            
        case 'render':
            const needsArg = args.find(a => a.startsWith('--needs='));
            const needs = needsArg ? needsArg.replace('--needs=', '').split(',') : ['identity'];
            console.log('🧠 Brain Engine - Render\n');
            const rendered = render({ needs });
            console.log(`Needs: ${needs.join(', ')}`);
            console.log(`Sources: ${Object.keys(rendered.sources).join(', ')}`);
            console.log(`Identity: ${rendered.identity ? 'loaded' : 'none'}`);
            console.log(`Learnings: ${Object.keys(rendered.learnings).length}`);
            console.log(`Memories: ${Object.keys(rendered.memories).length}`);
            break;
            
        case 'keeper-verify':
        case 'verify':
            console.log('🧠 Brain Engine - Keeper Verify\n');
            const toVerify = currentVersion || (args[1] ? loadBrain(args[1]).version : loadLatest().version);
            const vBrain = currentBrain || loadBrain(toVerify);
            keeperVerify(vBrain);
            break;
            
        case 'cache-status':
            console.log('🧠 Brain Engine - Cache Status\n');
            const failures = getFailures();
            console.log('Failures recorded:', Object.keys(failures).length);
            Object.keys(failures).forEach(v => {
                console.log(`  - ${v}: ${failures[v].error}`);
            });
            const cached = getCachedBrain();
            console.log('\nCached brain:', cached ? cached.version : 'none');
            break;
            
        default:
            console.log('🧠 Brain Engine - VANT Unified Loader');
            console.log('');
            console.log('Usage: node bin/brain-engine.js <command> [options]');
            console.log('');
            console.log('Commands:');
            console.log('  discover, list           List all brain versions');
            console.log('  load [version]           Load brain (or latest)');
            console.log('  graph                   Show version relationships');
            console.log('  delta <from> <to>        Compute diff between versions');
            console.log('  render --needs=x,y        Compose brain from needs');
            console.log('  keeper-verify [ver]      Security check brain');
            console.log('  cache-status           Show cache/failures');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});

module.exports = {
    discoverBrains,
    loadBrain,
    loadLatest,
    getCurrentBrain,
    getCurrentVersion,
    getCachedBrain,
    cacheBrain,
    recordFailure,
    getFailures,
    tryFallback,
    keeperVerify,
    getKeeperRecord,
    computeDelta,
    getGraph,
    getLineage,
    render,
    compareVersions,
    parseBrainFile
};