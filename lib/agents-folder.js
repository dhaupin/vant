/**
 * Agents Folder Loader (v1.0)
 * Loads agents from models/agents/vant-agent-{name}/AGENT.md
 */
const path = require('path');
const fs = require('fs');
const VANT_ROOT = '/workspace/project/vant';

let _format = null;
function _getFormat() {
    if (!_format) _format = require('./format');
    return _format;
}

function loadFolder(name) {
    const folderPath = path.join(VANT_ROOT, 'models', 'agents', 'vant-agent-' + name, 'AGENT.md');
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
    const dir = path.join(VANT_ROOT, 'models', 'agents');
    try {
        return fs.readdirSync(dir)
            .filter(d => d.startsWith('vant-agent-'))
            .map(d => d.replace('vant-agent-', ''));
    } catch (e) { return []; }
}

async function loadChain(name, loaded = []) {
    const agent = loadFolder(name);
    if (!agent) return loaded;
    if (loaded.find(a => a.name === name)) return loaded;
    loaded.push({ name, agent });
    // Load skills in chain
    for (const chainItem of agent.chain || []) {
        if (chainItem.startsWith('vant-skill-')) {
            try {
                await require('./skills-folder').loadChain(chainItem.replace(/^vant-skill-/, ''), loaded);
            } catch(e) {}
        }
    }
    return loaded;
}

module.exports = { loadFolder, listFolders, loadChain };
