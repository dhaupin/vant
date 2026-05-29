/**
 * Skills Folder Loader (v1.0)
 * Loads skills from models/skills/vant-skill-{name}/SKILL.md
 */
const path = require('path');
const fs = require('fs');
const VANT_ROOT = '/workspace/project/vant';

// Load format lazily
let _format = null;
function _getFormat() {
    if (!_format) _format = require('./format');
    return _format;
}

function loadFolder(name) {
    const folderPath = path.join(VANT_ROOT, 'models', 'skills', 'vant-skill-' + name, 'SKILL.md');
    try {
        if (fs.existsSync(folderPath)) {
            const content = fs.readFileSync(folderPath, 'utf8');
            const parsed = _getFormat().parse(content);
            return {
                name: parsed.data.meta?.name || name,
                path: folderPath,
                content: content,
                description: parsed.data.meta?.description || '',
                chain: parsed.data.meta?.chain || [],
                metadata: parsed.data.meta?.metadata || {}
            };
        }
    } catch (e) { console.error('loadFolder error:', e.message); }
    return null;
}

function listFolders() {
    const dir = path.join(VANT_ROOT, 'models', 'skills');
    try {
        return fs.readdirSync(dir)
            .filter(d => d.startsWith('vant-skill-'))
            .map(d => d.replace('vant-skill-', ''));
    } catch (e) { return []; }
}

async function loadChain(name, loaded = []) {
    const skill = loadFolder(name);
    if (!skill) return loaded;
    if (loaded.find(s => s.name === name)) return loaded;
    loaded.push({ name, skill });
    for (const chainItem of skill.chain || []) {
        const subName = chainItem.replace(/^vant-skill-/, '');
        await loadChain(subName, loaded);
    }
    return loaded;
}

module.exports = { loadFolder, listFolders, loadChain };
