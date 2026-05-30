/**
 * Skils (v0.8.6)
 * Skill routing system - mirrors islands.js pattern
 * 
 * Routes to internal lib modules that provide capabilities.
 * Like islands routes to brain/corpus, skills route to lib modules.
 * 
 * Usage:
 *   const skills = require('./skills');
 *   await skills.load('github');  // routes to github skill
 *   await skills.list();         // available skills
 *   await skills.findTriggers(prompt); // find by keywords
 */

const path = require('path');
const fs = require('fs');
const sudo = require('./sudo');
const vaf = require('./vaf');
const brain = require('./brain');
const format = require('./format');

// Skill → lib module routing
// mirrors islands: type (static/lazy) → source (corpus/storage)
// skills: type (native/remote) → routes to lib/*.js module
const DEFAULT_SKILLS = {
    // Native: routed to internal lib modules
    agents: { 
        name: 'Agents', 
        type: 'native', 
        module: './agents',
        triggers: ['spawn', 'delegate', 'fork', 'agent']
    },
    brain: { 
        name: 'Brain', 
        type: 'native', 
        module: './brain',
        triggers: ['memory', 'learn', 'remember', 'brain']
    },
    islands: { 
        name: 'Islands', 
        type: 'native', 
        module: './islands',
        triggers: ['component', 'island', 'lazy']
    },
    mcp: { 
        name: 'MCP', 
        type: 'native', 
        module: './mcp',
        triggers: ['rpc', 'json-rpc', 'mcp', 'tool']
    },
    github: { 
        name: 'GitHub', 
        type: 'native', 
        module: './github',
        triggers: ['github', 'pr', 'issue', 'repo', 'push']
    },
    gitlab: { 
        name: 'GitLab', 
        type: 'native', 
        module: './gitlab',
        triggers: ['gitlab', 'merge', 'mr']
    },
    linear: { 
        name: 'Linear', 
        type: 'native', 
        module: './linear',
        triggers: ['linear', 'project', 'ticket', 'sprint']
    },
    slack: { 
        name: 'Slack', 
        type: 'native', 
        module: './slack',
        triggers: ['slack', 'channel', 'message']
    },
    discord: { 
        name: 'Discord', 
        type: 'native', 
        module: './discord',
        triggers: ['discord', 'server', 'bot']
    },
    notion: { 
        name: 'Notion', 
        type: 'native', 
        module: './notion',
        triggers: ['notion', 'page', 'database']
    },
    security: { 
        name: 'Security', 
        type: 'native', 
        module: './security',
        triggers: ['security', 'auth', 'token', 'permission']
    },
    code_review: { 
        name: 'Code Review', 
        type: 'native', 
        module: './code-review',
        triggers: ['review', 'pr', 'security']
    }
};

const MANIFEST_FILE = 'skills.json';

let _manifestCache = null;
function _getManifestSync() {
    if (!_manifestCache) {
        _manifestCache = {
            version: '1.0',
            skills: { ...DEFAULT_SKILLS },
            loaded: [],
            hydrated: []
        };
    }
    return _manifestCache;
}

/**
 * Get models path
 */
function _getModelsPath() {
    return path.join(__dirname, '..', 'models');
}

/**
 * Load manifest from file
 */
async function _loadManifestFile() {
    const manifestPath = path.join(_getModelsPath(), MANIFEST_FILE);
    try {
        if (fs.existsSync(manifestPath)) {
            const result = await format.loadFile(manifestPath);
            if (result.data) return result.data;
        }
    } catch (e) {}
    return null;
}

/**
 * Get skills manifest
 */
async function getManifest() {
    const fileManifest = await _loadManifestFile();
    if (fileManifest && fileManifest.skills) {
        return {
            version: fileManifest.version || '1.0',
            skills: { ...DEFAULT_SKILLS, ...fileManifest.skills },
            loaded: fileManifest.loaded || [],
            hydrated: fileManifest.hydrated || []
        };
    }
    return { version: '1.0', skills: DEFAULT_SKILLS, loaded: [], hydrated: [] };
}

/**
 * Save manifest
 */
async function saveManifest(m) {
    const manifestPath = path.join(_getModelsPath(), MANIFEST_FILE);
    await format.saveFile(manifestPath, m);
}

/**
 * List available skills
 */
async function list() {
    const m = await getManifest();
    return Object.keys(m.skills).map(name => ({
        name,
        ...m.skills[name]
    }));
}

/**
 * Get skill by name
 */
async function get(name) {
    vaf.check(name, { type: 'string', maxLength: 50 });
    const m = await getManifest();
    return m.skills[name] || null;
}

/**
 * Load skill (route to module)
 * Mirrors islands.load() - routes to lib module
 */
async function load(name) {
    vaf.check(name, { type: 'string', maxLength: 50 });
    
    const m = await getManifest();
    const def = m.skills[name];
    
    if (!def) return null;
    
    // Native skills: route to lib modules OR islands
    if (def.type === 'native' && def.module) {
        try {
            const mod = require(def.module);
            return {
                name,
                type: def.type,
                module: def.module,
                handler: mod,
                triggers: def.triggers || []
            };
        } catch (e) {
            return { name, error: e.message };
        }
    }
    
    // Islands skill: delegate to islands.js
    if (def.type === 'island') {
        try {
            const Islands = require('./islands');
            return {
                name,
                type: 'island',
                handler: Islands,
                triggers: def.triggers || []
            };
        } catch (e) {
            return { name, error: e.message };
        }
    }
    
    return { name, type: def.type, triggers: def.triggers || [] };
}

/**
 * Find skills matching prompt triggers
 * Mirrors islands.findTriggers()
 */
async function findTriggers(prompt) {
    const p = prompt.toLowerCase();
    const m = await getManifest();
    const matches = [];
    
    for (const [name, def] of Object.entries(m.skills)) {
        const triggers = def.triggers || [];
        if (triggers.some(t => p.includes(t.toLowerCase()))) {
            matches.push({ name, ...def });
        }
    }
    
    return matches;
}

/**
 * Register skill
 */
async function register(def) {
    vaf.check(def.name, { type: 'string', maxLength: 50 });
    
    const m = await getManifest();
    if (m.skills[def.name]) {
        return { error: 'Skill already exists: ' + def.name };
    }
    
    m.skills[def.name] = {
        name: def.name,
        type: def.type || 'native',
        module: def.module || null,
        triggers: def.triggers || []
    };
    
    await saveManifest(m);
    return { name: def.name, registered: true };
}

/**
 * Unregister skill
 */
async function unregister(name) {
    const m = await getManifest();
    if (!m.skills[name]) {
        return { error: 'Skill not found: ' + name };
    }
    
    delete m.skills[name];
    await saveManifest(m);
    return { name, unregistered: true };
}

// Module exports - mirroring islands.js API
module.exports = {
    DEFAULT_SKILLS,
    getManifest,
    saveManifest,
    list,
    get,
    load,
    findTriggers,
    register,
    unregister,
    
    // Unified proto loader: brain priority + folder + flat + YAML parse
    loadProto(name) {
        const fs = require('fs');
        const path = require('path');
        const fmt = require('./format');
        
        // Brain order: private > public
        const roots = [
            path.join(__dirname, '..', 'models', 'private', 'skills'),
            path.join(__dirname, '..', 'models', 'public', 'skills')
        ];
        
        let found = null;
        // Check: folder first (vant-skill-{name}/SKILL.md), then flat ({name}.md)
        for (const root of roots) {
            const fp = path.join(root, 'vant-skill-' + name, 'SKILL.md');
            if (fs.existsSync(fp)) { found = { p: fp }; break; }
            const fp2 = path.join(root, name + '.md');
            if (fs.existsSync(fp2)) { found = { p: fp2 }; break; }
        }
        if (!found) return null;
        
        const content = fs.readFileSync(found.p, 'utf8');
        const parsed = fmt.parse(content);  // Use format.js for YAML parse
        
        return {
            name: parsed.data?.meta?.name || name,
            path: found.p,
            content: content,
            type: 'skill',
            source: found.p.includes('/private/') ? 'private' : 'public',
            description: parsed.data?.meta?.description || '',
            chain: parsed.data?.meta?.chain || [],
            metadata: parsed.data?.meta?.metadata || {},
            format: found.p.includes('vant-skill-') ? 'folder' : 'flat'
        };
    },
    
    // List all: private + public, folders + flat files
    listProtos() {
        const fs = require('fs');
        const path = require('path');
        const s = new Set();
        
        ['private/skills', 'public/skills'].forEach(sub => {
            const dir = path.join(__dirname, '..', 'models', sub);
            try {
                fs.readdirSync(dir)
                    .filter(d => d.startsWith('vant-skill-'))
                    .forEach(d => s.add(d.replace('vant-skill-', '')));
                fs.readdirSync(dir)
                    .filter(f => f.endsWith('.md') && !f.startsWith('vant-'))
                    .forEach(f => s.add(f.replace('.md', '')));
            } catch (e) {}
        });
        return Array.from(s);
    },

    // NEW: Load skill from folder format (vant-skill-{name}/SKILL.md)
    loadFolder(name) {
        const fs = require('fs');
        const folderPath = path.join(__dirname, '..', 'models', 'public', 'skills', 'vant-skill-' + name, 'SKILL.md');
        try {
            if (fs.existsSync(folderPath)) {
                const content = fs.readFileSync(folderPath, 'utf8');
                const parsed = format.parse(content);
                return {
                    name: parsed.data.meta?.name || name,
                    path: folderPath,
                    content: content,
                    description: parsed.data.meta?.description || '',
                    chain: parsed.data.meta?.chain || [],
                    metadata: parsed.data.meta?.metadata || {}
                };
            }
        } catch (e) {}
        return null;
    },

    // List all skills in folder format
    listFolders() {
        const fs = require('fs');
        const dir = path.join(__dirname, '..', 'models', 'public', 'skills');
        try {
            return fs.readdirSync(dir)
                .filter(d => d.startsWith('vant-skill-'))
                .map(d => d.replace('vant-skill-', ''));
        } catch (e) { return []; }
    },

    // Load skill chain - recursively load all skills in chain
    async loadChain(name, loaded = []) {
        const skill = this.loadProto(name);
        if (!skill) return loaded;
        if (loaded.find(s => s.name === skill.name)) return loaded;

        loaded.push(skill);

        for (const chainItem of skill.chain || []) {
            const subName = chainItem.replace(/^vant-skill-/, '');
            await this.loadChain(subName, loaded);
        }
        return loaded;
    }
};