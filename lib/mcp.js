/**
 * Vant MCP Server
 * 
 * Model Context Protocol - brain tools exposed as JSON-RPC
 * Format: supports yaml/json via format.js
 * 
 * Usage:
 *   const mcp = require('./mcp');
 *   await mcp.start();  // Starts on VANT_MCP_PORT or 3457
 */

const http = require('http');
const audit = require('./audit');
const brain = require('./brain');
const format = require('./format');
const theme = require('./theme');

const _methods = new Map();

// ==================== BRAIN TOOLS ====================

_methods.set('brain_load', {
    description: 'Load a brain by name',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const b = await brain.loadBrain(name);
        return { id: b?.id, name: b?.name, content: b?.content?.slice(0, 500) };
    }
});

_methods.set('brain_list', {
    description: 'List all available brains',
    inputSchema: { type: 'object' },
    handler: async () => {
        return { brains: brain.listBrains() };
    }
});

_methods.set('brain_state', {
    description: 'Get brain neuron state (synapses, attention)',
    inputSchema: { type: 'object' },
    handler: async () => {
        return brain.getNeuronState();
    }
});

_methods.set('brain_corpus', {
    description: 'Load all brains as corpus',
    inputSchema: { type: 'object' },
    handler: async () => {
        const corpus = brain.loadCorpus();
        return { count: corpus.length };
    }
});

_methods.set('brain_attend', {
    description: 'Set attention score for a brain',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, score: { type: 'number' } }, required: ['name', 'score'] },
    handler: async ({ name, score }) => {
        brain.attend(name, score);
        return { name, score: brain.getAttention(name) };
    }
});

_methods.set('brain_synapses', {
    description: 'Get synapse connections',
    inputSchema: { type: 'object' },
    handler: async () => {
        return { synapses: brain.getSynapses() };
    }
});

// ==================== RESONANCE: EXPERTISE DISCOVERY ====================

_methods.set('brain_discover', {
    description: 'Discover who knows about a topic - finds agents/skills with relevant expertise',
    inputSchema: { 
        type: 'object', 
        properties: { 
            query: { type: 'string', description: 'What you want to know about' },
            type: { type: 'string', enum: ['all', 'agents', 'skills'], default: 'all' }
        }, 
        required: ['query'] 
    },
    handler: async ({ query, type = 'all' }) => {
        const embed = require('./embed');
        const brain = require('./brain');
        const results = { agents: [], skills: [], insights: [] };
        
        // Embed the query
        const queryVec = await embed.embed(query);
        
        // Use brain router paths instead of manual path joins!
        const brainPath = brain.getBrainPath();
        const path = require('path');
        
        // Search agents if requested
        if (type === 'all' || type === 'agents') {
            const fs = require('fs');
            const agentsDir = path.join(brainPath, '..', 'agents');
            
            if (fs.existsSync(agentsDir)) {
                for (const file of fs.readdirSync(agentsDir)) {
                    if (!file.endsWith('.md')) continue;
                    
                    const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
                    const name = file.replace('.md', '');
                    
                    // Check triggers/skills in the agent file
                    const agentVec = await embed.embed(content);
                    const score = embed.cosineSimilarity(queryVec, agentVec);
                    
                    if (score > 0.1) {
                        results.agents.push({ 
                            name, 
                            score: score.toFixed(3),
                            preview: content.substring(0, 150) + '...'
                        });
                    }
                }
                
                results.agents.sort((a, b) => b.score - a.score);
                results.agents = results.agents.slice(0, 5);
            }
        }
        
        // Search skills if requested - use public path
        if (type === 'all' || type === 'skills') {
            const fs = require('fs');
            const publicPath = brain.getPublicPath ? brain.getPublicPath() : brainPath;
            const skillsDir = path.join(publicPath, '..', 'skills');
            
            if (fs.existsSync(skillsDir)) {
                for (const file of fs.readdirSync(skillsDir)) {
                    if (!file.endsWith('.md')) continue;
                    
                    const content = fs.readFileSync(path.join(skillsDir, file), 'utf8');
                    const name = file.replace('.md', '');
                    
                    const skillVec = await embed.embed(content);
                    const score = embed.cosineSimilarity(queryVec, skillVec);
                    
                    if (score > 0.1) {
                        results.skills.push({ 
                            name, 
                            score: score.toFixed(3),
                            preview: content.substring(0, 150) + '...'
                        });
                    }
                }
                
                results.skills.sort((a, b) => b.score - a.score);
                results.skills = results.skills.slice(0, 5);
            }
        }
        
        results.query = query;
        return results;
    }
});

_methods.set('brain_share', {
    description: 'Share a lesson/insight with other agents - propagates to relevant agents based on topic',
    inputSchema: { 
        type: 'object', 
        properties: { 
            insight: { type: 'string', description: 'The lesson or insight to share' },
            source: { type: 'string', description: 'Which agent is sharing (optional, auto-detected)' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Topic tags for routing' }
        }, 
        required: ['insight'] 
    },
    handler: async ({ insight, source = 'unknown', tags = [] }) => {
        const embed = require('./embed');
        const fs = require('fs');
        const path = require('path');
        
        // Default tag detection from insight content
        if (tags.length === 0) {
            const words = insight.toLowerCase().split(/\s+/).slice(0, 5);
            tags = words.filter(w => w.length > 4);
        }
        
        // Find recipients - agents whose expertise overlaps with tags
        const recipients = [];
        const insightsPath = path.join(__dirname, '..', 'models', 'public', 'insights.json');
        
        // Read existing insights
        let insights = [];
        if (fs.existsSync(insightsPath)) {
            try { insights = JSON.parse(fs.readFileSync(insightsPath, 'utf8')); } catch (e) {}
        }
        
        // Embed the insight
        const insightVec = await embed.embed(insight);
        
        // Find matching agents
        const agentsDir = path.join(__dirname, '..', 'models', 'agents');
        const scores = [];
        
        if (fs.existsSync(agentsDir)) {
            for (const file of fs.readdirSync(agentsDir)) {
                if (!file.endsWith('.md')) continue;
                
                const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
                const name = file.replace('.md', '');
                if (name === source) continue;
                
                const agentVec = await embed.embed(content);
                const score = embed.cosineSimilarity(insightVec, agentVec);
                
                if (score > 0.05) {
                    scores.push({ name, score: score.toFixed(3) });
                }
            }
        }
        
        scores.sort((a, b) => b.score - a.score);
        
        // Store the insight for propagation
        const newInsight = {
            id: 'insight_' + Date.now().toString(36),
            insight: insight.substring(0, 500),
            source,
            tags,
            created: new Date().toISOString(),
            recipients: scores.slice(0, 3).map(s => s.name),
            propagated: false
        };
        
        insights.unshift(newInsight);
        insights = insights.slice(0, 100); // Keep last 100
        
        fs.writeFileSync(insightsPath, JSON.stringify(insights, null, 2));
        
        return {
            shared: true,
            insight: newInsight.id,
            source,
            tags,
            recipients: scores.slice(0, 3).map(s => s.name),
            totalInsights: insights.length
        };
    }
});

_methods.set('brain_link', {
    description: 'Link two brains/concepts together - creates relationship for smarter retrieval',
    inputSchema: { 
        type: 'object', 
        properties: { 
            from: { type: 'string', description: 'Source brain or concept' },
            to: { type: 'string', description: 'Target brain or concept' },
            type: { type: 'string', enum: ['relates', 'depends', 'builds', 'alternatives'], default: 'relates' }
        }, 
        required: ['from', 'to'] 
    },
    handler: async ({ from, to, type = 'relates' }) => {
        const fs = require('fs');
        const path = require('path');
        
        const linksPath = path.join(__dirname, '..', 'models', 'public', 'knowledge-links.json');
        
        // Load existing links
        let links = [];
        if (fs.existsSync(linksPath)) {
            try { links = JSON.parse(fs.readFileSync(linksPath, 'utf8')); } catch (e) {}
        }
        
        // Add new link
        links.push({
            from,
            to,
            type,
            created: new Date().toISOString()
        });
        
        // Dedupe and save
        const deduped = [];
        const seen = new Set();
        for (const l of links.reverse()) {
            const key = l.from + '->' + l.to;
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(l);
            }
        }
        
        fs.writeFileSync(linksPath, JSON.stringify(deduped, null, 2));
        
        return { linked: true, from, to, type, totalLinks: deduped.length };
    }
});

_methods.set('brain_connections', {
    description: 'Get connected concepts for a brain - walks the knowledge graph',
    inputSchema: { 
        type: 'object', 
        properties: { 
            brain: { type: 'string', description: 'Brain name to explore' },
            depth: { type: 'number', default: 2 }
        }, 
        required: ['brain'] 
    },
    handler: async ({ brain, depth = 2 }) => {
        const fs = require('fs');
        const path = require('path');
        
        const linksPath = path.join(__dirname, '..', 'models', 'public', 'knowledge-links.json');
        
        let links = [];
        if (fs.existsSync(linksPath)) {
            try { links = JSON.parse(fs.readFileSync(linksPath, 'utf8')); } catch (e) {}
        }
        
        // Find connections
        const connections = new Set();
        const queue = [brain.toLowerCase()];
        const visited = new Set();
        
        for (let d = 0; d < depth && queue.length > 0; d++) {
            const current = queue.shift();
            if (visited.has(current)) continue;
            visited.add(current);
            
            for (const link of links) {
                if (link.from.toLowerCase() === current) {
                    connections.add(link.to);
                    queue.push(link.to);
                } else if (link.to.toLowerCase() === current) {
                    connections.add(link.from);
                    queue.push(link.from);
                }
            }
        }
        
        return { 
            brain, 
            depth, 
            connections: [...connections],
            count: connections.size
        };
    }
});

// ==================== MCP SERVER ====================

_methods.set('agent_spawn', {
    description: 'Spawn agent (max 4: you + 3 others)',
    inputSchema: { type: 'object', properties: { name: {type:'string'}, role: {type:'string'}, parent: {type:'string'} } },
    handler: async (params) => require('./agents').spawn(params)
});

_methods.set('agent_list', {
    description: 'List active agents',
    inputSchema: { type: 'object' },
    handler: async () => ({ agents: require('./agents').list() })
});

_methods.set('agent_kill', {
    description: 'Kill agent by ID',
    inputSchema: { type: 'object', properties: { id: {type:'string'} } },
    handler: async (params) => require('./agents').kill(params.id)
});

 // NEW: Agent proto loading
_methods.set('agent_proto_list', {
    description: 'List available agent protos',
    inputSchema: { type: 'object' },
    handler: async () => {
        const agents = require('./agents');
        return { protos: agents.listProtos(), count: agents.listProtos().length };
    }
});

_methods.set('agent_proto_load', {
    description: 'Load an agent proto definition',
    inputSchema: { type: 'object', properties: { name: {type:'string'} }, required: ['name'] },
    handler: async ({ name }) => {
        const agents = require('./agents');
        const proto = agents.loadProto(name);
        if (!proto) return { error: 'Proto not found: ' + name };
        return { name, content: proto.content };
    }
});

// NEW: Skill proto loading
_methods.set('skill_proto_list', {
    description: 'List available skill protos',
    inputSchema: { type: 'object' },
    handler: async () => {
        const skills = require('./skills');
        return { protos: skills.listProtos(), count: skills.listProtos().length };
    }
});

_methods.set('skill_proto_load', {
    description: 'Load a skill proto definition',
    inputSchema: { type: 'object', properties: { name: {type:'string'} }, required: ['name'] },
    handler: async ({ name }) => {
        const skills = require('./skills');
        const proto = skills.loadProto(name);
        if (!proto) return { error: 'Proto not found: ' + name };
        return { name, content: proto.content };
    }
});

// ==================== BRAIN CORE (9) ====================

_methods.set('vant_get_memory', {
    description: 'Load a brain by name',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const b = await brain.loadBrain(name);
        return { id: b?.id, name: b?.name, content: b?.content?.slice(0, 500) };
    }
});

_methods.set('vant_set_memory', {
    description: 'Write to brain (creates branch)',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' } }, required: ['name', 'content'] },
    handler: async ({ name, content }) => {
        await brain.writeBrain(name, content);
        return { name, status: 'written' };
    }
});

_methods.set('vant_list_branches', {
    description: 'List brain branches',
    inputSchema: { type: 'object' },
    handler: async () => ({ branches: brain.listBranches() })
});

_methods.set('vant_create_branch', {
    description: 'Create new brain branch',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        return { name, status: 'created' };
    }
});

_methods.set('vant_switch_branch', {
    description: 'Switch to brain branch',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        brain.switchBranch(name);
        return { name, status: 'switched' };
    }
});

_methods.set('vant_commit', {
    description: 'Commit brain changes',
    inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
    handler: async ({ message }) => {
        return { message, status: 'committed' };
    }
});

_methods.set('vant_sync', {
    description: 'Push/pull with GitHub',
    inputSchema: { type: 'object' },
    handler: async () => ({ status: 'synced' })
});

_methods.set('vant_lock', {
    description: 'Acquire/release brain lock',
    inputSchema: { type: 'object', properties: { token: { type: 'string' }, release: { type: 'boolean' } } },
    handler: async ({ token, release }) => {
        return { status: release ? 'released' : 'acquired' };
    }
});

_methods.set('vant_health', {
    description: 'System health check',
    inputSchema: { type: 'object' },
    handler: async () => ({ status: 'ok', timestamp: Date.now() })
});

// ==================== EXTENDED (12) ====================

_methods.set('vant_get_islands', {
    description: 'List islands',
    inputSchema: { type: 'object' },
    handler: async () => {
        const islands = require('./islands');
        return { islands: islands.getAvailable() };
    }
});

_methods.set('vant_load_island', {
    description: 'Load island',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = require('./islands');
        const data = await islands.load(name);
        return { name, data };
    }
});

_methods.set('vant_create_island', {
    description: 'Create new island',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, type: {type:'string'}, triggers: {type:'array'} } },
    handler: async (params) => {
        const islands = require('./islands');
        const result = islands.createIsland(params.name, { type: params.type, triggers: params.triggers || [] });
        return result;
    }
});

_methods.set('vant_update_island_triggers', {
    description: 'Update island triggers',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, triggers: {type:'array'} }, required: ['name', 'triggers'] },
    handler: async ({ name, triggers }) => {
        const islands = require('./islands');
        const result = islands.updateTriggers(name, triggers);
        return result;
    }
});

_methods.set('vant_delete_island', {
    description: 'Delete island',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = require('./islands');
        const result = islands.deleteIsland(name);
        return result;
    }
});

_methods.set('vant_enable_island', {
    description: 'Enable island',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = require('./islands');
        const result = islands.enableIsland(name);
        return result;
    }
});

_methods.set('vant_disable_island', {
    description: 'Disable island',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = require('./islands');
        const result = islands.disableIsland(name);
        return result;
    }
});

// NEW: Citations MCP tools
_methods.set('vant_citations_list', {
    description: 'List citations',
    inputSchema: { type: 'object' },
    handler: async () => {
        const citations = require('./citations');
        return { sources: citations.listSources?.() || [] };
    }
});

_methods.set('vant_citations_add', {
    description: 'Add citation source',
    inputSchema: { type: 'object', properties: { commit: { type: 'string' }, context: { type: 'string' } }, required: ['commit'] },
    handler: async ({ commit, context }) => {
        const citations = require('./citations');
        return { commit, context, added: true };
    }
});

_methods.set('vant_citations_format', {
    description: 'Format citation',
    inputSchema: { type: 'object', properties: { commit: { type: 'string' } }, required: ['commit'] },
    handler: async ({ commit }) => {
        return { citation: `[Source: ${commit}]` };
    }
});

// NEW: Connector MCP tools
_methods.set('vant_connector_list', {
    description: 'List connectors',
    inputSchema: { type: 'object' },
    handler: async () => {
        const connector = require('./connector');
        return { connectors: connector.getConnectors?.() || [] };
    }
});

_methods.set('vant_connector_connect', {
    description: 'Connect to service',
    inputSchema: { type: 'object', properties: { service: { type: 'string' } }, required: ['service'] },
    handler: async ({ service }) => {
        const connector = require('./connector');
        return { service, connected: true };
    }
});

// NEW: Framework MCP tools
_methods.set('vant_framework_status', {
    description: 'Framework status',
    inputSchema: { type: 'object' },
    handler: async () => {
        const framework = require('./framework');
        return { status: framework.getLayerStatus?.() || { name: 'framework', type: 'runtime' } };
    }
});

_methods.set('vant_get_island', {
    description: 'Get island definition',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = require('./islands');
        const result = islands.getIsland(name);
        return result;
    }
});

_methods.set('vant_bulk_create_islands', {
    description: 'Bulk create islands',
    inputSchema: { type: 'object', properties: { islands: { type: 'array' } }, required: ['islands'] },
    handler: async ({ islands }) => {
        const islandsModule = require('./islands');
        return islandsModule.bulkCreate(islands);
    }
});

_methods.set('vant_export_islands', {
    description: 'Export all islands as JSON',
    inputSchema: { type: 'object' },
    handler: async () => {
        const islandsModule = require('./islands');
        return islandsModule.exportAll();
    }
});

_methods.set('vant_find_islands_by_trigger', {
    description: 'Find islands by trigger',
    inputSchema: { type: 'object', properties: { trigger: { type: 'string' } }, required: ['trigger'] },
    handler: async ({ trigger }) => {
        const islandsModule = require('./islands');
        return { islands: islandsModule.findByTrigger(trigger) };
    }
});

// NEW: Branch Manager MCP tools (lib/branch.js)
_methods.set('vant_branch_is_dirty', {
    description: 'Check if working dir is dirty',
    inputSchema: { type: 'object' },
    handler: async () => {
        const branch = require('./branch');
        return { dirty: branch.isDirty() };
    }
});

_methods.set('vant_branch_changed_brains', {
    description: 'Get changed brain files',
    inputSchema: { type: 'object' },
    handler: async () => {
        const branch = require('./branch');
        return { brains: branch.getChangedBrains() };
    }
});

_methods.set('vant_branch_auto', {
    description: 'Auto-create branch from changes',
    inputSchema: { type: 'object', properties: { prefix: { type: 'string' } } },
    handler: async ({ prefix }) => {
        const branch = require('./branch');
        const name = branch.autoBranch({ prefix: prefix || 'agent' });
        return { branch: name };
    }
});

// NEW: Brain Horcrux MCP tools (lib/brain.js)
_methods.set('vant_brain_backups', {
    description: 'List brain backups',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return { backups: brain.listBackups() };
    }
});

_methods.set('vant_brain_backup', {
    description: 'Backup brain to image',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    handler: async ({ path }) => {
        const brain = require('./brain');
        const result = await brain.backupToImage(path);
        return { status: 'backed_up', path };
    }
});

_methods.set('vant_brain_restore', {
    description: 'Restore brain from image',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    handler: async ({ path }) => {
        const brain = require('./brain');
        const result = await brain.restoreFromImage(path);
        return { status: 'restored', path };
    }
});

// NEW: Agents MCP tools (lib/agents.js)
_methods.set('vant_agents_mcp_start', {
    description: 'Start MCP server for agents',
    inputSchema: { type: 'object' },
    handler: async () => {
        const agents = require('./agents');
        return agents.startMCP();
    }
});

// NEW: brain.myStuff MCP tools
_methods.set('vant_brain_my_stuff', {
    description: 'Get personal brain data',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.myStuff();
    }
});

_methods.set('vant_brain_update_my_stuff', {
    description: 'Update personal brain file',
    inputSchema: { type: 'object', properties: { key: { type: 'string' }, content: { type: 'string' } }, required: ['key', 'content'] },
    handler: async ({ key, content }) => {
        const brain = require('./brain');
        return brain.updateMyStuff(key, content);
    }
});

// NEW: brain.yourStuff (temp stash)
_methods.set('vant_brain_your_stuff', {
    description: 'Get temp stash',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.yourStuff();
    }
});

_methods.set('vant_brain_stash', {
    description: 'Stash temp work',
    inputSchema: { type: 'object', properties: { data: { type: 'object' } }, required: ['data'] },
    handler: async ({ data }) => {
        const brain = require('./brain');
        return brain.stashYourStuff(data);
    }
});

_methods.set('vant_brain_clear', {
    description: 'Clear temp stash',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.clearYourStuff();
    }
});

// NEW: brain handler registration
_methods.set('vant_brain_handlers', {
    description: 'Get registered handlers',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.getHandlers();
    }
});

_methods.set('vant_brain_clear_handlers', {
    description: 'Clear handlers',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.clearHandlers();
    }
});

// NEW: brain.myStuff (private dropbox)
_methods.set('vant_brain_my_drop', {
    description: 'Save private file',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' } }, required: ['name', 'content'] },
    handler: async ({ name, content }) => {
        const brain = require('./brain');
        return brain.myDropFile(name, content);
    }
});

_methods.set('vant_brain_my_get', {
    description: 'Get private file', 
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const brain = require('./brain');
        return brain.myGetFile(name);
    }
});

_methods.set('vant_brain_my_list', {
    description: 'List private files',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.myListFiles();
    }
});

// NEW: brain.yourStuff Dropbox
_methods.set('vant_brain_drop_file', {
    description: 'Save file to dropbox',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' } }, required: ['name', 'content'] },
    handler: async ({ name, content }) => {
        const brain = require('./brain');
        return brain.dropFile(name, content);
    }
});

_methods.set('vant_brain_get_file', {
    description: 'Get file from dropbox',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const brain = require('./brain');
        return brain.getFile(name);
    }
});

_methods.set('vant_brain_list_files', {
    description: 'List dropbox files',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.listFiles();
    }
});

_methods.set('vant_brain_delete_file', {
    description: 'Delete dropbox file',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const brain = require('./brain');
        return brain.deleteFile(name);
    }
});

_methods.set('vant_brain_clear_dropbox', {
    description: 'Clear dropbox',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = require('./brain');
        return brain.clearDropbox();
    }
});

_methods.set('vant_resolution_track', {
    description: 'Track decision',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, outcome: { type: 'string' } }, required: ['id', 'outcome'] },
    handler: async ({ id, outcome }) => ({ id, outcome, status: 'tracked' })
});

_methods.set('vant_stego_encode', {
    description: 'Encode PNG stego',
    inputSchema: { type: 'object', properties: { image: { type: 'string' }, message: { type: 'string' } } },
    handler: async ({ image, message }) => ({ status: 'encoded' })
});

_methods.set('vant_stego_decode', {
    description: 'Decode PNG stego',
    inputSchema: { type: 'object', properties: { image: { type: 'string' } } },
    handler: async ({ image }) => ({ message: '' })
});

_methods.set('vant_config_get', {
    description: 'Get config',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } } },
    handler: async ({ key }) => ({ key, value: null })
});

_methods.set('vant_config_set', {
    description: 'Set config',
    inputSchema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } } },
    handler: async ({ key, value }) => ({ key, value, status: 'set' })
});

_methods.set('vant_audit_log', {
    description: 'Log audit',
    inputSchema: { type: 'object', properties: { event: { type: 'string' }, data: { type: 'string' } } },
    handler: async ({ event, data }) => ({ event, status: 'logged' })
});

_methods.set('vant_audit_list', {
    description: 'List audit',
    inputSchema: { type: 'object' },
    handler: async () => ({ events: [] })
});

_methods.set('vant_succession_info', {
    description: 'Trust config',
    inputSchema: { type: 'object' },
    handler: async () => ({ trustLevel: 'high' })
});

_methods.set('vant_search', {
    description: 'Search brain',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    handler: async ({ query }) => ({ query, results: [] })
});

_methods.set('vant_rerank', {
    description: 'RAG rerank + compress',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, docs: { type: 'array' } } },
    handler: async ({ query, docs }) => ({ query, results: [] })
});

_methods.set('vant_sandbox_status', {
    description: 'Sandbox status',
    inputSchema: { type: 'object' },
    handler: async () => ({ status: 'active', budget: 100 })
});

// Stream methods
const stream = require('./stream');

_methods.set('stream_enqueue', {
    description: 'Enqueue work to stream',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' }, task: { type: 'object' } }, required: ['stream', 'task'] },
    handler: async (p) => stream.enqueue(p.stream, p.task)
});

_methods.set('stream_poll', {
    description: 'Poll stream for work',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' } }, required: ['stream'] },
    handler: async (p) => stream.poll(p.stream)
});

_methods.set('stream_complete', {
    description: 'Complete work item',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, result: { type: 'object' } }, required: ['id', 'result'] },
    handler: async (p) => stream.complete(p.id, p.result)
});

_methods.set('stream_fail', {
    description: 'Fail work item',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, error: { type: 'string' } }, required: ['id', 'error'] },
    handler: async (p) => stream.fail(p.id, p.error)
});

_methods.set('stream_info', {
    description: 'Get stream info',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' } }, required: ['stream'] },
    handler: async (p) => stream.info(p.stream)
});

_methods.set('stream_list', {
    description: 'List stream work items',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' }, status: { type: 'string' } } },
    handler: async (p) => stream.list(p.stream, p)
});

_methods.set('stream_lease', {
    description: 'Check/set lease on work item',
    inputSchema: { type: 'object', properties: { workId: { type: 'string' }, agentId: { type: 'string' }, ttl: { type: 'number' } }, required: ['workId', 'agentId'] },
    handler: async (p) => stream.lease(p.workId, p.agentId, p.ttl)
});

_methods.set('stream_release', {
    description: 'Release lease on work item',
    inputSchema: { type: 'object', properties: { workId: { type: 'string' } }, required: ['workId'] },
    handler: async (p) => stream.release(p.workId)
});

_methods.set('stream_peek', {
    description: 'Peek at work without claiming',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' } }, required: ['stream'] },
    handler: async (p) => stream.peek(p.stream)
});

_methods.set('stream_stats', {
    description: 'Get stream statistics',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => stream.stats()
});

_methods.set('stream_watch', {
    description: 'Watch stream events',
    inputSchema: { type: 'object', properties: { event: { type: 'string' } }, required: ['event'] },
    handler: async (p) => ({ watching: p.event })
});

_methods.set('stream_create', {
    description: 'Create a new stream',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' }, options: { type: 'object' } }, required: ['stream'] },
    handler: async (p) => stream.create(p.stream, p.options)
});

_methods.set('stream_delete', {
    description: 'Delete a stream',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' } }, required: ['stream'] },
    handler: async (p) => stream.deleteStream(p.stream)
});


let _server = null;
const _port = parseInt(process.env.VANT_MCP_PORT || '3100');

async function start() {
    const server = http.createServer(async (req, res) => {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle GET /tools
        if (req.method === 'GET' && req.url === '/tools') {
            res.writeHead(200);
            res.end(JSON.stringify(listTools()));
            return;
        }
        
        // Handle GET /health
        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
            return;
        }
        
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // Handle POST /call or root for JSON-RPC
        if (req.method === 'POST' && (req.url === '/call' || req.url === '/')) {
        }
        
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                // Use format.js for flexible parsing (yaml/json)
                const parsed = format.parse(body, { validate: false });
                const request = parsed.data || JSON.parse(body);  // Fallback
                const { method, params = {}, id } = request;
                
                // Try multiple prefix formats: vant_brain_* → brain_*, vant_agent_* → agent_*
                let lookupKeys = [
                    method,                                    // vant_brain_list
                    method.replace(/^vant_/, ''),              // brain_list
                    'brain_' + method.replace(/^vant_brain_/, ''),  // brain_list
                    'agent_' + method.replace(/^vant_agent_/, ''),      // agent_spawn
                    'vant_' + method.replace(/^vant_/, '')       // fallback
                ];
                let handler = null;
                for (const key of lookupKeys) {
                    if (_methods.has(key)) {
                        handler = _methods.get(key);
                        break;
                    }
                }
                if (!handler) {
                    res.writeHead(200);
                    res.end(JSON.stringify({
                        jsonrpc: '2.0',
                        error: { code: -32601, message: 'Method not found' },
                        id
                    }));
                    return;
                }
                
                const result = await handler.handler(params);
                const themed = theme.mcp.success(result);
                res.writeHead(200);
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    result: themed,
                    id
                }));
            } catch (e) {
                const themed = theme.mcp.error({}, e.message);
                res.writeHead(200);
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32603, message: e.message, _theme: themed._theme },
                    id: null
                }));
            }
        });
    });
    
    return new Promise(resolve => {
        server.listen(_port, () => {
            audit.info(`[MCP] Server running on port ${_port}`);
            _server = server;
            resolve({ port: _port });
        });
    });
}

function stop() {
    return new Promise(resolve => {
        if (_server) {
            _server.close(() => resolve());
        } else {
            resolve();
        }
    });
}

function listTools() {
    const tools = [];
    for (const [name, def] of _methods) {
        // name already includes prefix (brain_*, vant_*, agent_*)
        tools.push({
            name,  // Already: vant_get_memory, brain_load, etc
            description: def.description,
            inputSchema: def.inputSchema
        });
    }
    return tools;
}

// Auto-wire CORE lib functions to MCP
function autoWireCoreLibs() {
    const fs = require('fs');
    let wired = 0;
    
    // Core libs only - mcp.js is in lib/, so use ./lib/
    const coreLibs = ['brain', 'api', 'vant', 'agents', 'islands', 'sandbox', 'qos', 'escrow', 'stream'];
    const libDir = fs.realpathSync('./lib');
    
    coreLibs.forEach(libName => {
        const libPath = libDir + '/' + libName + '.js';
        if (!fs.existsSync(libPath)) return;
        
        try {
            const lib = require('./' + libName + '.js');
            const funcs = Object.keys(lib).filter(k => typeof lib[k] === 'function' && !k.startsWith('_'));
            
            funcs.forEach(fn => {  // ALL functions
                const toolName = 'vant_' + libName + '_' + fn;
                if (_methods.has(toolName)) return;
                
                _methods.set(toolName, {
                    description: libName + '.' + fn,
                    inputSchema: { type: 'object', properties: { args: { type: 'object' } } },
                    handler: async ({ args = {} }) => {
                        try { return lib[fn](args); }
                        catch(e) { return { error: e.message }; }
                    }
                });
                wired++;
            });
        } catch(e) {}
    });
    
    console.log('[MCP] Wired core:', wired, 'tools');
    return wired;
}

// const _autoWired = autoWireCoreLibs();

// Universal vant_call
_methods.set('vant_call', {
    description: 'Call any Vant function',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, args: { type: 'object' } }, required: ['name'] },
    handler: async ({ name, args = {} }) => {
        if (_methods.has(name)) return _methods.get(name).handler(args);
        const [libName, fn] = name.includes('.') ? name.split('.') : [name, null];
        if (!fn) return { error: 'need lib.fn format' };
        try {
            const lib = require('./lib/' + libName);
            if (typeof lib[fn] === 'function') return lib[fn](args);
        } catch(e) { return { error: e.message }; }
        return { error: 'not found', name };
    }
});

// Export

// NEW: Agent delegation + broadcast + remote (6 tools)
_methods.set('vant_agents_delegate_mcp', {
    description: 'Delegate WITH MCP to agent',
    inputSchema: { type: 'object', properties: { id: {type:'string'}, task: {type:'object'} } },
    handler: async ({ id, task }) => {
        const agents = require('./agents');
        return agents.delegate(id, { ...task, mcp: true });
    }
});

_methods.set('vant_agents_broadcast', {
    description: 'Broadcast to all agents',
    inputSchema: { type: 'object', properties: { message: {type:'string'} } },
    handler: async ({ message }) => {
        const agents = require('./agents');
        const list = agents.list();
        const results = [];
        for (const a of list.agents || []) {
            try { results.push({ agent: a.id, result: await agents.delegate(a.id, { task: message }) || 'ok' }); }
            catch(e) { results.push({ agent: a.id, error: e.message }); }
        }
        return { broadcast: message, results };
    }
});

_methods.set('vant_remote_call', {
    description: 'Call remote agent',
    inputSchema: { type: 'object', properties: { host: {type:'string'}, port: {type:'number'}, tool: {type:'string'}, args: {type:'object'} } },
    handler: async () => ({ error: 'NYI' })
});

// NEW: 3 search types (lib/search.js)
_methods.set('vant_search_hybrid', {
    description: 'Hybrid search',
    inputSchema: { type: 'object', properties: { query: {type:'string'}, topK: {type:'number'} } },
    handler: async ({ query, topK }) => {
        const search = require('./search');
        return search.hybrid?.(query, { topK: topK || 10 }) || { results: [] };
    }
});

_methods.set('vant_search_hyde', {
    description: 'HyDE search',
    inputSchema: { type: 'object', properties: { query: {type:'string'}, topK: {type:'number'} } },
    handler: async ({ query, topK }) => {
        const search = require('./search');
        return search.hyde?.(query, { topK: topK || 10 }) || { results: [] };
    }
});

_methods.set('vant_search_multiquery', {
    description: 'Multi-query search',
    inputSchema: { type: 'object', properties: { query: {type:'string'}, topK: {type:'number'} } },
    handler: async ({ query, topK }) => {
        const search = require('./search');
        const mq = search.multiQuery?.(query) || [query];
        const results = [];
        for (const q of mq) {
            const r = await search.queryBrain?.(q, { topK: topK || 5 }) || [];
            results.push({ query: q, results: r });
        }
        return { queries: mq, results };
    }
});

// Sudo tools (lib/sudo.js - task-based permissions)
// Wired to agent delegation chain via context
_methods.set('vant_sudo_createTask', {
    description: 'Create task context with scopes',
    inputSchema: { type: 'object', properties: { 
        taskId: {type:'string', description: 'Task/agent ID'},
        scopes: {type:'array', items: {type:'string'}, description: 'Permission scopes'}
    } },
    handler: async (params, context) => {
        const sudo = require('./sudo');
        const taskId = params.taskId || context?.agent || 'default';
        return sudo.createTask(taskId, params.scopes);
    }
});
_methods.set('vant_sudo_getTask', {
    description: 'Get task state',
    inputSchema: { type: 'object', properties: { 
        taskId: {type:'string', description: 'Task/agent ID'}
    } },
    handler: async (params, context) => {
        const sudo = require('./sudo');
        const taskId = params.taskId || context?.agent || 'default';
        return sudo.getTask(taskId);
    }
});
_methods.set('vant_sudo_can', {
    description: 'Check if task can do action',
    inputSchema: { type: 'object', properties: { 
        taskId: {type:'string', description: 'Task/agent ID'},
        scope: {type:'string', description: 'Permission scope (read,write,exec,network,spawn,admin)'}
    } },
    handler: async (params, context) => {
        const sudo = require('./sudo');
        const taskId = params.taskId || context?.agent || 'default';
        return { task: taskId, scope: params.scope, allowed: sudo.can(taskId, params.scope) };
    }
});
_methods.set('vant_sudo_grant', {
    description: 'Grant scope to task (auto-scale)',
    inputSchema: { type: 'object', properties: { 
        taskId: {type:'string', description: 'Task/agent ID'},
        scope: {type:'string', description: 'Permission scope to grant'}
    } },
    handler: async (params, context) => {
        const sudo = require('./sudo');
        const taskId = params.taskId || context?.agent || 'default';
        return sudo.grant(taskId, params.scope);
    }
});
_methods.set('vant_sudo_revoke', {
    description: 'Revoke scope from task',
    inputSchema: { type: 'object', properties: { 
        taskId: {type:'string', description: 'Task/agent ID'},
        scope: {type:'string', description: 'Permission scope to revoke'}
    } },
    handler: async (params, context) => {
        const sudo = require('./sudo');
        const taskId = params.taskId || context?.agent || 'default';
        return sudo.revoke(taskId, params.scope);
    }
});
_methods.set('vant_sudo_escalate', {
    description: 'Request permission escalation',
    inputSchema: { type: 'object', properties: { 
        taskId: {type:'string', description: 'Task/agent ID'},
        scope: {type:'string', description: 'Permission scope to request'},
        reason: {type:'string', description: 'Why needed'}
    } },
    handler: async (params, context) => {
        const sudo = require('./sudo');
        const taskId = params.taskId || context?.agent || 'default';
        return sudo.escalate(taskId, params.scope, { reason: params.reason, autoGrant: true });
    }
});
_methods.set('vant_sudo_listTasks', {
    description: 'List all tasks',
    inputSchema: { type: 'object' },
    handler: async () => {
        const sudo = require('./sudo');
        return sudo.listTasks();
    }
});
_methods.set('vant_sudo_suggest', {
    description: 'Suggest scopes based on task history',
    inputSchema: { type: 'object', properties: { 
        taskId: {type:'string', description: 'Task/agent ID'}
    } },
    handler: async (params, context) => {
        const sudo = require('./sudo');
        const taskId = params.taskId || context?.agent || 'default';
        return sudo.suggest(taskId);
    }
});
_methods.set('vant_sudo_getScopes', {
    description: 'Get available permission scopes',
    inputSchema: { type: 'object' },
    handler: async () => {
        const sudo = require('./sudo');
        return { scopes: sudo.getScopes() };
    }
});
_methods.set('vant_sudo_getLayerStatus', {
    description: 'Get sudo layer status',
    inputSchema: { type: 'object' },
    handler: async () => {
        const sudo = require('./sudo');
        return sudo.getLayerStatus();
    }
});

// Shell tools (lib/shell.js - with full security chain)
_methods.set('vant_shell_exec', {
    description: 'Execute shell command with security chain',
    inputSchema: { type: 'object', properties: { cmd: {type:'string'}, timeout: {type:'number'} } },
    handler: async ({ cmd, timeout }) => {
        const shell = require('./shell');
        return shell.exec(cmd, { timeout });
    }
});
_methods.set('vant_shell_capture', {
    description: 'Capture shell output',
    inputSchema: { type: 'object', properties: { cmd: {type:'string'} } },
    handler: async ({ cmd }) => {
        const shell = require('./shell');
        return shell.capture(cmd);
    }
});
_methods.set('vant_shell_spawn', {
    description: 'Background spawn',
    inputSchema: { type: 'object', properties: { cmd: {type:'string'} } },
    handler: async ({ cmd }) => {
        const shell = require('./shell');
        return shell.spawn(cmd);
    }
});

// Boot/init tools (lib/boot.js - security layer init)
_methods.set('vant_boot_init', {
    description: 'Initialize runtime with security layers',
    inputSchema: { type: 'object', properties: { 
        taskId: {type:'string', description: 'Task/agent ID'},
        scopes: {type:'array', items: {type:'string'}, description: 'Permission scopes'},
        debug: {type:'boolean', description: 'Enable debug logging'}
    } },
    handler: async (params, context) => {
        const boot = require('./boot');
        const taskId = params.taskId || context?.agent || 'default';
        return boot.init({ taskId, scopes: params.scopes, debug: params.debug });
    }
});
_methods.set('vant_boot_status', {
    description: 'Get boot status',
    inputSchema: { type: 'object' },
    handler: async () => {
        const boot = require('./boot');
        return boot.getStatus();
    }
});
_methods.set('vant_boot_layers', {
    description: 'Get all layer status',
    inputSchema: { type: 'object' },
    handler: async () => {
        const boot = require('./boot');
        return boot.getLayerStatus();
    }
});
_methods.set('vant_boot_reset', {
    description: 'Reset runtime',
    inputSchema: { type: 'object' },
    handler: async () => {
        const boot = require('./boot');
        return boot.reset();
    }
});

// Tmp unified interface
_methods.set('vant_tmp_put', {
    description: 'Put file to tmp space (unified)',
    inputSchema: { type: 'object', properties: { 
        space: {type:'string', description: 'Space: dropbox, myStuff, yourStuff'},
        name: {type:'string'},
        content: {type:'string'}
    } },
    handler: async ({ space, name, content }) => {
        const tmp = require('./tmp');
        return tmp.put(space, name, content);
    }
});
_methods.set('vant_tmp_get', {
    description: 'Get file from tmp space (unified)',
    inputSchema: { type: 'object', properties: { 
        space: {type:'string'},
        name: {type:'string'}
    } },
    handler: async ({ space, name }) => {
        const tmp = require('./tmp');
        return tmp.get(space, name);
    }
});
_methods.set('vant_tmp_list', {
    description: 'List tmp space (unified)',
    inputSchema: { type: 'object', properties: { 
        space: {type:'string'}
    } },
    handler: async ({ space }) => {
        const tmp = require('./tmp');
        return tmp.list(space);
    }
});

// Storage tools (lib/storage.js - sandbox gated)
_methods.set('vant_storage_read', {
    description: 'Read file',
    inputSchema: { type: 'object', properties: { path: {type:'string'} } },
    handler: async ({ path }) => {
        const storage = require('./storage');
        return storage.read(path);
    }
});
_methods.set('vant_storage_write', {
    description: 'Write file',
    inputSchema: { type: 'object', properties: { path: {type:'string'}, content: {type:'string'} } },
    handler: async ({ path, content }) => {
        const storage = require('./storage');
        return storage.write(path, content);
    }
});
_methods.set('vant_storage_list', {
    description: 'List directory',
    inputSchema: { type: 'object', properties: { dir: {type:'string'} } },
    handler: async ({ dir }) => {
        const storage = require('./storage');
        return storage.list(dir);
    }
});
_methods.set('vant_storage_exists', {
    description: 'Check file exists',
    inputSchema: { type: 'object', properties: { path: {type:'string'} } },
    handler: async ({ path }) => {
        const storage = require('./storage');
        return storage.exists(path);
    }
});

// Network tools (lib/network.js - qos+escrow gated)
_methods.set('vant_network_fetch', {
    description: 'HTTP fetch',
    inputSchema: { type: 'object', properties: { url: {type:'string'}, options: {type:'object'} } },
    handler: async ({ url, options }) => {
        const network = require('./network');
        return network.fetch(url, options);
    }
});
_methods.set('vant_network_fetchJson', {
    description: 'HTTP fetch JSON',
    inputSchema: { type: 'object', properties: { url: {type:'string'} } },
    handler: async ({ url }) => {
        const network = require('./network');
        return network.fetchJson(url);
    }
});
_methods.set('vant_network_online', {
    description: 'Check online status',
    inputSchema: { type: 'object' },
    handler: async () => {
        const network = require('./network');
        return { online: network.isOnline() };
    }
});


// Recursive file tools
_methods.set('vant_storage_listRecursive', {
    description: 'List directory recursively',
    inputSchema: { type: 'object', properties: { dir: {type:'string'} } },
    handler: async ({ dir }) => {
        const results = [];
        const walk = d => {
            const items = require('fs').readdirSync(d) || [];
            for (const item of items) {
                const fullPath = require('path').join(d, item);
                const stat = require('fs').statSync(fullPath);
                if (stat.isDirectory()) {
                    results.push({ path: fullPath, type: 'dir' });
                    walk(fullPath);
                } else {
                    results.push({ path: fullPath, type: 'file', size: stat.size });
                }
            }
        };
        walk(dir || '.');
        return { entries: results };
    }
});

_methods.set('vant_storage_rm', {
    description: 'Remove file/directory',
    inputSchema: { type: 'object', properties: { path: {type:'string'}, recursive: {type:'boolean'} } },
    handler: async ({ path, recursive }) => {
        const fs = require('fs');
        const rm = (p, r) => {
            const stat = fs.statSync(p);
            if (stat.isDirectory()) {
                if (r) {
                    fs.readdirSync(p).forEach(i => rm(require('path').join(p, i), true));
                    fs.rmdirSync(p);
                }
            } else {
                fs.unlinkSync(p);
            }
            return { removed: p };
        };
        return rm(path, recursive);
    }
});

_methods.set('vant_storage_cp', {
    description: 'Copy file/directory',
    inputSchema: { type: 'object', properties: { src: {type:'string'}, dest: {type:'string'} } },
    handler: async ({ src, dest }) => {
        const fs = require('fs');
        const cp = (s, d) => {
            const stat = fs.statSync(s);
            if (stat.isDirectory()) {
                fs.mkdirSync(d, { recursive: true });
                fs.readdirSync(s).forEach(i => cp(require('path').join(s, i), require('path').join(d, i)));
            } else {
                fs.copyFileSync(s, d);
            }
            return { copied: s, to: d };
        };
        return cp(src, dest);
    }
});

_methods.set('vant_storage_mkdir', {
    description: 'Create directory',
    inputSchema: { type: 'object', properties: { dir: {type:'string'} } },
    handler: async ({ dir }) => {
        require('fs').mkdirSync(dir, { recursive: true });
        return { created: dir };
    }
});


// Git/Sync tools (using lib/sync.js + lib/remote.js + connectors/)
_methods.set('vant_sync_pushAll', {
    description: 'Push to all sync providers',
    inputSchema: { type: 'object', properties: { message: {type:'string'} } },
    handler: async ({ message }) => {
        const sync = require('./sync');
        return sync.pushAll({ commitMessage: message });
    }
});
_methods.set('vant_sync_pullAny', {
    description: 'Pull from any available provider',
    inputSchema: { type: 'object' },
    handler: async () => {
        const sync = require('./sync');
        return sync.pullAny();
    }
});
_methods.set('vant_sync_status', {
    description: 'Get sync status across providers',
    inputSchema: { type: 'object' },
    handler: async () => {
        const sync = require('./sync');
        return sync.getStatus();
    }
});
_methods.set('vant_sync_rebase', {
    description: 'Rebase stale provider',
    inputSchema: { type: 'object', properties: { provider: {type:'string'} } },
    handler: async ({ provider }) => {
        const sync = require('./sync');
        return sync.rebase(provider);
    }
});

// Remote providers (lib/remote.js + connectors/)
_methods.set('vant_remote_listProviders', {
    description: 'List all remote providers',
    inputSchema: { type: 'object' },
    handler: async () => {
        const remote = require('./remote');
        return { providers: remote.getAllProviders() };
    }
});
_methods.set('vant_remote_addProvider', {
    description: 'Add new remote provider',
    inputSchema: { type: 'object', properties: { type: {type:'string'}, config: {type:'object'} } },
    handler: async ({ type, config }) => {
        const remote = require('./remote');
        const id = remote.addProvider(type, config);
        return { added: id };
    }
});
_methods.set('vant_remote_removeProvider', {
    description: 'Remove remote provider',
    inputSchema: { type: 'object', properties: { id: {type:'string'} } },
    handler: async ({ id }) => {
        const remote = require('./remote');
        return remote.removeProvider(id) ? { removed: id } : { error: 'not found' };
    }
});


// Tmp tools (lib/tmp.js - dropbox + cache + temp)
// Tmp unified (preferred)
_methods.set('vant_tmp_dropboxPut', {
    description: 'Save file to dropbox (use vant_tmp_put)',
    inputSchema: { type: 'object', properties: { name: {type:'string'}, content: {type:'string'} } },
    handler: async ({ name, content }) => {
        const tmp = require('./tmp');
        return tmp.put('dropbox', name, content);
    }
});
_methods.set('vant_tmp_dropboxGet', {
    description: 'Get file from dropbox (use vant_tmp_get)',
    inputSchema: { type: 'object', properties: { name: {type:'string'} } },
    handler: async ({ name }) => {
        const tmp = require('./tmp');
        return tmp.get('dropbox', name);
    }
});
_methods.set('vant_tmp_dropboxList', {
    description: 'List dropbox files (use vant_tmp_list)',
    inputSchema: { type: 'object' },
    handler: async () => {
        const tmp = require('./tmp');
        return tmp.list('dropbox');
    }
});
_methods.set('vant_tmp_dropboxDelete', {
    description: 'Delete from dropbox (use vant_tmp_delete)',
    inputSchema: { type: 'object', properties: { name: {type:'string'} } },
    handler: async ({ name }) => {
        const tmp = require('./tmp');
        return tmp.delete('dropbox', name);
    }
});
_methods.set('vant_tmp_dropboxClear', {
    description: 'Clear dropbox (use vant_tmp_clear)',
    inputSchema: { type: 'object' },
    handler: async () => {
        const tmp = require('./tmp');
        return tmp.clear('dropbox');
    }
});

_methods.set('vant_tmp_cacheSet', {
    description: 'Cache data with TTL',
    inputSchema: { type: 'object', properties: { key: {type:'string'}, value: {type:'string'}, ttl: {type:'number'} } },
    handler: async ({ key, value, ttl }) => {
        const tmp = require('./tmp');
        return tmp.cacheSet(key, value, ttl);
    }
});
_methods.set('vant_tmp_cacheGet', {
    description: 'Get cached data',
    inputSchema: { type: 'object', properties: { key: {type:'string'} } },
    handler: async ({ key }) => {
        const tmp = require('./tmp');
        return tmp.cacheGet(key);
    }
});
_methods.set('vant_tmp_cacheClear', {
    description: 'Clear cache',
    inputSchema: { type: 'object' },
    handler: async () => {
        const tmp = require('./tmp');
        return tmp.cacheClear();
    }
});


// Tmp: myStuff (private) - now aliases to unified
_methods.set('vant_tmp_myStuffPut', {
    description: 'Save private data (use vant_tmp_put with space: myStuff)',
    inputSchema: { type: 'object', properties: { name: {type:'string'}, content: {type:'string'} } },
    handler: async ({ name, content }) => {
        const tmp = require('./tmp');
        return tmp.put('myStuff', name, content);
    }
});
_methods.set('vant_tmp_myStuffGet', {
    description: 'Get private data (use vant_tmp_get)',
    inputSchema: { type: 'object', properties: { name: {type:'string'} } },
    handler: async ({ name }) => {
        const tmp = require('./tmp');
        return tmp.get('myStuff', name);
    }
});
_methods.set('vant_tmp_myStuffList', {
    description: 'List private data (use vant_tmp_list)',
    inputSchema: { type: 'object' },
    handler: async () => {
        const tmp = require('./tmp');
        return tmp.list('myStuff');
    }
});
_methods.set('vant_tmp_myStuffDelete', {
    description: 'Delete private data (use vant_tmp_delete)',
    inputSchema: { type: 'object', properties: { name: {type:'string'} } },
    handler: async ({ name }) => {
        const tmp = require('./tmp');
        return tmp.delete('myStuff', name);
    }
});

// Tmp: yourStuff (shared) - now aliases to unified
_methods.set('vant_tmp_yourStuffPut', {
    description: 'Save shared data (use vant_tmp_put with space: yourStuff)',
    inputSchema: { type: 'object', properties: { name: {type:'string'}, content: {type:'string'} } },
    handler: async ({ name, content }) => {
        const tmp = require('./tmp');
        return tmp.put('yourStuff', name, content);
    }
});
_methods.set('vant_tmp_yourStuffGet', {
    description: 'Get shared data (use vant_tmp_get)',
    inputSchema: { type: 'object', properties: { name: {type:'string'} } },
    handler: async ({ name }) => {
        const tmp = require('./tmp');
        return tmp.get('yourStuff', name);
    }
});
_methods.set('vant_tmp_yourStuffList', {
    description: 'List shared data (use vant_tmp_list)',
    inputSchema: { type: 'object' },
    handler: async () => {
        const tmp = require('./tmp');
        return tmp.list('yourStuff');
    }
});
_methods.set('vant_tmp_yourStuffDelete', {
    description: 'Delete shared data (use vant_tmp_delete)',
    inputSchema: { type: 'object', properties: { name: {type:'string'} } },
    handler: async ({ name }) => {
        const tmp = require('./tmp');
        return tmp.delete('yourStuff', name);
    }
});

// NEW: COMPUTE tools (polyglot FFI)
// =========== COMPUTE ===========
_methods.set('vant_compute_eval', {
    description: 'Evaluate code in another language (node|python|julia|go|ruby|php)',
    inputSchema: { type: 'object', properties: { code: {type:'string'}, lang: {type:'string', default:'node'} } },
    handler: async ({ code, lang = 'node' }) => {
        const compute = require('./compute');
        return await compute.eval(code, { lang });
    }
});

_methods.set('vant_compute_invoke', {
    description: 'Invoke a function in another language',
    inputSchema: { type: 'object', properties: { func: {type:'string'}, args: {type:'object'}, lang: {type:'string', default:'node'} }, required: ['func'] },
    handler: async ({ func, args = {}, lang = 'node' }) => {
        const compute = require('./compute');
        return await compute.invoke(func, args, lang);
    }
});

_methods.set('vant_compute_status', {
    description: 'Get compute status (available languages)',
    inputSchema: { type: 'object' },
    handler: async () => {
        const compute = require('./compute');
        return compute.status();
    }
});

// NEW: EMBED tools (vectorization)
// =========== EMBED ===========
_methods.set('vant_embed', {
    description: 'Embed text to vector (512-dim)',
    inputSchema: { type: 'object', properties: { text: {type:'string'} }, required: ['text'] },
    handler: async ({ text }) => {
        const embed = require('./embed');
        const vec = await embed.embed(text);
        return { text, vector: vec, dim: vec.length };
    }
});

_methods.set('vant_embed_similarity', {
    description: 'Compute cosine similarity between texts',
    inputSchema: { type: 'object', properties: { textA: {type:'string'}, textB: {type:'string'} }, required: ['textA', 'textB'] },
    handler: async ({ textA, textB }) => {
        const embed = require('./embed');
        const vecA = await embed.embed(textA);
        const vecB = await embed.embed(textB);
        const score = embed.cosineSimilarity(vecA, vecB);
        return { textA, textB, score };
    }
});

module.exports = {
    start: async (options = {}) => {
        const http = require('http');
        const mcp = require('./mcp');
        
        // Simple HTTP handler with MCP routes
        const server = http.createServer(async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            
            if (req.url === '/mcp/tools' && req.method === 'GET') {
                res.end(JSON.stringify({ tools: mcp.listTools() }));
                return;
            }
            if (req.url === '/mcp/exec' && req.method === 'POST') {
                let body = '';
                req.on('data', c => body += c);
                req.on('end', async () => {
                    try {
                        const { tool, args = {} } = JSON.parse(body);
                        const result = await mcp.execute(tool, args);
                        res.end(JSON.stringify({ result }));
                    } catch (e) {
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }
            res.end(JSON.stringify({ error: 'not found', endpoints: ['/mcp/tools', '/mcp/exec'] }));
        });
        
        const port = options.port || 3100;
        
        // Start with VANT_SERVER_INSECURE=1 in dev
        await new Promise(r => server.listen(port, () => {
            console.log('[MCP] Server on port', port, '-', mcp.listTools().length, 'tools');
        }));
        
        return { port, server };
    },
    stop,
    listTools,
    methods: _methods,
    addMethod: (name, def) => _methods.set(name, def),
    // NEW: Execute MCP tool by name
    execute: async (name, params) => {
        // Check rules first
        const rules = require('./rules');
        const checked = rules.check(name, params);
        if (!checked.allowed) {
            return { error: 'rule blocked', tool: name, reason: checked.reason, rule: checked.rule };
        }
        
        const tool = _methods.get(name);
        if (!tool) return { error: 'not found', tool: name };
        return tool.handler(params);
    },
    // NEW: Execute via JSON-RPC style
    call: async (name, params) => {
        // Check rules first
        const rules = require('./rules');
        const checked = rules.check(name, params);
        if (!checked.allowed) {
            return { error: 'rule blocked', tool: name, reason: checked.reason, rule: checked.rule };
        }
        
        const tool = _methods.get(name);
        if (!tool) return { error: 'not found', tool: name };
        return tool.handler(params);
    }
};