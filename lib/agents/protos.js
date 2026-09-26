/**
 * Vant Agents — agent protos (P3 #32 split)
 *
 * Agent prototype definitions: unified loader (brain priority → folder →
 * flat + YAML frontmatter parse), folder format, enumeration across the
 * brain stack, chain resolution, MCP bridge, and the proto cache. Moved
 * VERBATIM from the agents.js monolith — the two mechanical adjustments:
 * requires went one level deeper (./x → ../x) and the __dirname models
 * anchors gained a level (../.. → this file lives one dir deeper).
 *
 * Cache lifecycle: the monolith defined _initCache() to clear _protoCache on
 * brain afterSave/brainChanged events, but ZERO callers ever invoked it, so
 * the invalidation hook never actually registered. This module registers the
 * listener at load time instead — making the documented intent REAL for the
 * first time (with a try/catch so a broken brain module can't kill the load).
 */

const internal = require('./internal');

const path = require('path');

const { _messages } = internal;

// Module-level cache (owned here — structural pin)
const _protoCache = new Map();
const _protoTTL = 30000;

// Register the invalidation listener the monolith forgot to call.
try {
    const brain = require('../brain');
    brain.on('afterSave', () => _protoCache.clear());
    brain.on('brainChanged', () => _protoCache.clear());
} catch (e) { console.warn("[agents/protos] Cache invalidation init failed:", e.message); }

const protos = {
    // Unified proto loader: brain priority + folder + flat + YAML parse
    loadProto(name) {
        if (!internal._validProtoName(name)) return null;
        const cached = _protoCache.get(name);
        if (cached && Date.now() - cached.ts < _protoTTL) {
            return cached.val;
        }


        const fmt = require('../format');

        const roots = [
            path.join(__dirname, '..', '..', 'models', 'private', 'agents'),
            path.join(__dirname, '..', '..', 'models', 'public', 'agents')
        ];

        let found = null;
        for (const root of roots) {
            const rel = path.relative(root, path.join(root, 'vant-agent-' + name, 'AGENT.md'));
            for (const candidate of [rel, name + '.md']) {
                if (internal._getModelsStore().has(path.relative('models', path.join(root, candidate)))) {
                    found = { p: path.join(root, candidate), rel: path.relative('models', path.join(root, candidate)) };
                    break;
                }
            }
            if (found) break;
        }
        if (!found) return null;

        const content = internal._getModelsStore().read(found.rel);
        const parsed = fmt.parse(content);

        const result = {
            name: parsed.data?.meta?.name || name,
            path: found.p,
            content: content,
            type: 'agent',
            source: found.p.includes('/private/') ? 'private' : 'public',
            description: parsed.data?.meta?.description || '',
            chain: parsed.data?.meta?.chain || [],
            metadata: parsed.data?.meta?.metadata || {},
            format: found.p.includes('vant-agent-') ? 'folder' : 'flat'
        };
        _protoCache.set(name, { val: result, ts: Date.now() });
        return result;
    },

    clearCache() { _protoCache.clear(); },

    // MULTIBRAIN: List agent protos from current brain + fallback to vant brain
    listProtos() {
        const fs = require('fs');
        const s = new Set();

        // Get brain stack (current brain first, then fallback brains)
        let brains = ['vant'];  // Default fallback
        try {
            const brain = require('../brain');
            const stack = brain.getStack?.() || ['vant'];
            brains = stack;  // Current brain + fallbacks
        } catch (e) {}

        // MULTIBRAIN: Search in brain-specific paths FIRST, then fallback
        // Format: models/[public|private]/[brainName]/agents
        // (R-6) brainName becomes a path segment — skip invalid entries
        const searchPaths = [];
        for (const brainName of brains) {
            if (!internal._validProtoName(brainName)) continue;
            searchPaths.push(
                path.join(__dirname, '..', '..', 'models', 'private', brainName, 'agents'),
                path.join(__dirname, '..', '..', 'models', 'public', brainName, 'agents')
            );
        }

        // Also check legacy path for backward compat
        searchPaths.push(
            path.join(__dirname, '..', '..', 'models', 'private', 'agents'),
            path.join(__dirname, '..', '..', 'models', 'public', 'agents'),
            path.join(__dirname, '..', '..', 'models', 'public', 'vant', 'agents')
        );

        // Search all paths
        for (const dir of searchPaths) {
            try {
                if (!fs.existsSync(dir)) continue;
                fs.readdirSync(dir, { withFileTypes: true })
                    .filter(d => d.isDirectory() && d.name.startsWith('vant-agent-'))
                    .forEach(d => s.add(d.name.replace('vant-agent-', '')));
                fs.readdirSync(dir)
                    .filter(f => f.endsWith('.md') && !f.startsWith('vant-') && !f.startsWith('_'))
                    .forEach(f => s.add(f.replace('.md', '')));
            } catch (e) { /* skip inaccessible dirs */ }
        }

        return Array.from(s);
    },

    // NEW: Start MCP server for agents
    startMCP(options = {}) {
        // Start MCP server with agent tools
        const mcp = require('../mcp');
        // Re-export MCP tools with agent context
        return {
            tools: mcp.listTools?.() || [],
            status: 'mcp_started'
        };
    },

    // MULTIBRAIN: Load from folder format - brain-aware
    loadFolder(name) {
        if (!internal._validProtoName(name)) return null;
        const FORMAT = require('../format');

        // Get brain stack
        let brains = ['vant'];
        try {
            const brain = require('../brain');
            brains = brain.getStack?.() || ['vant'];
        } catch (e) {}

        // Search in brain-specific paths
        const searchPaths = [];
        for (const brainName of brains) {
            if (!internal._validProtoName(brainName)) continue;
            searchPaths.push(
                path.join('models', 'private', brainName, 'agents', 'vant-agent-' + name, 'AGENT.md'),
                path.join('models', 'public', brainName, 'agents', 'vant-agent-' + name, 'AGENT.md')
            );
        }
        // (R-6) loadFolder 'name' is validated at entry by _validProtoName

        // Legacy fallback
        searchPaths.push(
            path.join('models', 'public', 'agents', 'vant-agent-' + name, 'AGENT.md'),
            path.join('models', 'public', 'vant', 'agents', 'vant-agent-' + name, 'AGENT.md')
        );

        for (const relPath of searchPaths) {
            try {
                if (internal._getModelsStore().has(relPath)) {
                    const content = internal._getModelsStore().read(relPath);
                    const parsed = FORMAT.parse(content);
                    return {
                        name: parsed.data.meta?.name || name,
                        path: relPath,
                        content: content,
                        description: parsed.data.meta?.description || '',
                        chain: parsed.data.meta?.chain || [],
                        metadata: parsed.data.meta?.metadata || {}
                    };
                }
            } catch (e) { /* skip errors */ }
        }
        return null;
    },

    // MULTIBRAIN: List all agents in folder format - brain-aware
    listFolders() {
        const fs = require('fs');

        // Get brain stack
        let brains = ['vant'];
        try {
            const brain = require('../brain');
            brains = brain.getStack?.() || ['vant'];
        } catch (e) {}

        const s = new Set();

        // Search in brain-specific paths
        for (const brainName of brains) {
            if (!internal._validProtoName(brainName)) continue;  // (R-6) path-segment guard
            ['private', 'public'].forEach(type => {
                const dir = path.join(__dirname, '..', '..', 'models', type, brainName, 'agents');
                try {
                    if (fs.existsSync(dir)) {
                        fs.readdirSync(dir, { withFileTypes: true })
                            .filter(d => d.isDirectory() && d.name.startsWith('vant-agent-'))
                            .forEach(d => s.add(d.name.replace('vant-agent-', '')));
                    }
                } catch (e) { /* skip */ }
            });
        }

        // Legacy fallback
        const legacyDir = path.join(__dirname, '..', '..', 'models', 'public', 'vant', 'agents');
        try {
            if (fs.existsSync(legacyDir)) {
                fs.readdirSync(legacyDir, { withFileTypes: true })
                    .filter(d => d.isDirectory() && d.name.startsWith('vant-agent-'))
                    .forEach(d => s.add(d.name.replace('vant-agent-', '')));
            }
        } catch (e) { /* skip */ }

        return Array.from(s);
    },

    // Load agent chain - recursively load all agents in chain
    async loadChain(name, loaded = []) {
        const agent = this.loadProto(name);
        if (!agent) return loaded;
        if (loaded.find(a => a.name === agent.name)) return loaded;

        loaded.push(agent);

        for (const chainItem of agent.chain || []) {
            const subName = chainItem.replace(/^vant-agent-/, '');
            await this.loadChain(subName, loaded);
        }
        return loaded;
    }
};

module.exports = protos;
