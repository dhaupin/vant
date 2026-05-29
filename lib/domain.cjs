/**
 * Domain Loader - Flexible domain loading (skills, agents, writers, artists...)
 */
const fs = require('fs');
const path = require('path');
const format = require('./format');
const VANT_ROOT = '/workspace/project/vant';
const EXT = { skill: 'SKILL.md', agent: 'AGENT.md', writer: 'DOC.md', artist: 'DOC.md' };
const cache = new Map();

function getDir(domain) {
    const sg = domain.replace(/s$/, '');
    return path.join(VANT_ROOT, 'models', sg + 's');
}
function getExt(domain) {
    return EXT[domain.replace(/s$/, '')] || 'DOC.md';
}
function domList(domain) {
    const dir = getDir(domain);
    if (!fs.existsSync(dir)) return [];
    const pf = 'vant-' + domain.replace(/s$/, '') + '-';
    return fs.readdirSync(dir).filter(d => d.startsWith(pf)).map(d => d.replace(pf, ''));
}
function domLoad(domain, name) {
    const k = domain + ':' + name;
    if (cache.has(k)) return cache.get(k);
    const fp = path.join(getDir(domain), 'vant-' + domain.replace(/s$/, '') + '-' + name, getExt(domain));
    if (fs.existsSync(fp)) {
        const content = fs.readFileSync(fp, 'utf8');
        const p = format.parse(content);
        const item = { name: p.data.meta?.name || name, domain, path: fp, content, description: p.data.meta?.description || '', chain: p.data.meta?.chain || [], body: p.data.body || '' };
        cache.set(k, item);
        return item;
    }
    return null;
}
function domains() {
    const d = path.join(VANT_ROOT, 'models');
    return fs.readdirSync(d).filter(f => fs.statSync(path.join(d,f)).isDirectory());
}

// Resolve chain item to domain/name
function resolveChainItem(item) {
    // Full vant-{domain}-{name} format
    if (item.match(/^vant-(.+?)-(.+)$/)) {
        const m = item.match(/^vant-(.+?)-(.+)$/);
        return { domain: m[1], name: m[2] };
    }
    // Bare name - infer from heuristics (default to current domain)
    // But better: try skills first, then agents
    return null;
}

async function loadChain(domain, name, loaded = []) {
    const item = domLoad(domain, name);
    if (!item || loaded.find(l => l.name === name && l.domain === domain)) return loaded;
    loaded.push(item);
    
    for (const c of item.chain || []) {
        // Try full vant-{domain}-{name}
        const m = c.match(/^vant-(.+?)-(.+)$/);
        if (m) {
            await loadChain(m[1], m[2], loaded);
            continue;
        }
        // Bare name - check known skills, then agents
        // Try skills (singular)
        if (domLoad('skill', c)) {
            await loadChain('skill', c, loaded);
            continue;
        }
        if (domLoad('agent', c)) {
            await loadChain('agent', c, loaded);
            continue;
        }
    }
    return loaded;
}
module.exports = { list: domList, load: domLoad, loadChain, domains, clearCache: () => cache.clear() };
