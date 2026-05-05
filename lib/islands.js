/**
 * Vant Islands - Componentized Brain Architecture
 *
 * Lazy-loadable skill/knowledge blocks.
 * Implements Prestruct's "Islands of Interactivity".
 */

const fs = require('fs');
const path = require('path');
const vaf = require('./vaf');

const MODELS_PATH = path.join(__dirname, '..', 'models');
const MAX_ISLAND_SIZE = 100 * 1024;

const DEFAULT_ISLANDS = {
    identity: { name: 'Identity', type: 'static', autoLoad: true, triggers: [] },
    learnings: { name: 'Learnings', type: 'static', autoLoad: true, triggers: [] },
    decisions: { name: 'Decisions', type: 'static', autoLoad: true, triggers: [] },
    github: { name: 'GitHub', type: 'lazy', autoLoad: false, triggers: ['github', 'pr', 'issue', 'repo'] },
    gitlab: { name: 'GitLab', type: 'lazy', triggers: ['gitlab', 'merge'] },
    bitbucket: { name: 'Bitbucket', type: 'lazy', triggers: ['bitbucket'] },
    herbalism: { name: 'Herbalism', type: 'lazy', triggers: ['herb', 'plant', 'medicine'] },
    vesc: { name: 'VESC', type: 'lazy', triggers: ['vesc', 'skateboard', 'motor'] },
    linear: { name: 'Linear', type: 'lazy', triggers: ['linear', 'project'] },
    automation: { name: 'Automation', type: 'lazy', triggers: ['cron', 'automation', 'schedule'] }
};

const MANIFEST_FILE = 'islands.json';

function getManifest() {
    const p = path.join(MODELS_PATH, MANIFEST_FILE);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    return { version: '1.0', islands: DEFAULT_ISLANDS, loaded: [], hydrated: [] };
}

function saveManifest(m) {
    fs.writeFileSync(path.join(MODELS_PATH, MANIFEST_FILE), JSON.stringify(m, null, 2));
}

function load(name) {
    vaf.check(name, { type: 'string', name: 'island', maxLength: 50 });
    const p = path.join(MODELS_PATH, name + '.json');
    if (!fs.existsSync(p)) return require('./brain').get(name) || null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function save(name, data) {
    const m = getManifest();
    if (!m.islands[name]) throw new Error('Unknown: ' + name);
    const json = JSON.stringify(data);
    if (json.length > MAX_ISLAND_SIZE) throw new Error('Too big');
    fs.writeFileSync(path.join(MODELS_PATH, name + '.json'), json);
    if (!m.loaded.includes(name)) m.loaded.push(name);
    saveManifest(m);
    return { success: true, size: json.length };
}

function hydrate(name) {
    const m = getManifest();
    const c = m.islands[name];
    if (!c) throw new Error('Unknown: ' + name);
    if (c.type === 'static') return { success: true, alreadyLoaded: true };
    if (m.hydrated.includes(name)) return { success: true, alreadyLoaded: true };
    const data = load(name);
    if (!m.hydrated.includes(name)) { m.hydrated.push(name); saveManifest(m); }
    return { success: true, data };
}

function dehydrate(name) {
    const m = getManifest();
    const c = m.islands[name];
    if (!c) throw new Error('Unknown: ' + name);
    if (c.type === 'static') return { success: false, reason: 'static' };
    m.hydrated = m.hydrated.filter(n => n !== name);
    saveManifest(m);
    return { success: true };
}

function findTriggers(prompt) {
    const m = getManifest();
    const found = [];
    prompt = prompt.toLowerCase();
    for (const [n, c] of Object.entries(m.islands)) {
        if (c.triggers && c.triggers.some(t => prompt.includes(t.toLowerCase()))) found.push(n);
    }
    return found;
}

function autoHydrate(prompt) {
    const m = getManifest();
    const toLoad = [];
    for (const [n, c] of Object.entries(m.islands)) {
        if (c.autoLoad || c.type === 'static') toLoad.push(n);
    }
    const triggered = findTriggers(prompt);
    for (const n of triggered) if (!toLoad.includes(n)) toLoad.push(n);
    for (const n of toLoad) hydrate(n);
    return toLoad;
}

function getHydrated() { return getManifest().hydrated || []; }
function getAvailable() { return Object.keys(getManifest().islands); }

module.exports = { getManifest, load, save, hydrate, dehydrate, findTriggers, autoHydrate, getHydrated, getAvailable, DEFAULT_ISLANDS };