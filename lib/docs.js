/**
 * Docs - API Documentation Generator
 *
 * Generates OpenAPI specs and documentation from Vant modules.
 *
 * Usage:
 *   const docs = require('./docs');
 *   const spec = docs.generateOpenAPI();
 *   const md = docs.generateMarkdown();
 */

const fs = require('fs');
const path = require('path');

// Known module definitions
const MODULE_DEFS = {
  'vant': {
    name: 'Vant',
    description: 'Main Vant agent runtime',
    methods: [
      { name: 'init', params: ['options'], returns: 'Promise' },
      { name: 'think', params: ['query', 'opts'], returns: 'string' },
      { name: 'brain', getter: true },
      { name: 'mcp', getter: true },
      { name: 'search', getter: true },
      { name: 'islands', getter: true },
      { name: 'msg', getter: true },
      { name: 'agents', getter: true },
      { name: 'zen', getter: true },
      { name: 'Ohm', type: 'class' }
    ]
  },
  'brain': {
    name: 'Brain',
    description: 'Persistent memory system',
    methods: [
      { name: 'write', params: ['name', 'content'], returns: 'Promise' },
      { name: 'read', params: ['name'], returns: 'Promise<string>' },
      { name: 'listBrains', params: [], returns: 'Promise<string[]>' },
      { name: 'delete', params: ['name'], returns: 'Promise' }
    ]
  },
  'mcp': {
    name: 'MCP',
    description: 'Model Context Protocol tools',
    methods: [
      { name: 'execute', params: ['tool', 'params'], returns: 'Promise' },
      { name: 'listTools', params: [], returns: 'string[]' }
    ]
  },
  'consensus': {
    name: 'Consensus',
    description: 'Distributed voting system',
    methods: [
      { name: 'create', params: ['proposal'], returns: 'Promise' },
      { name: 'vote', params: ['id', 'voter', 'choice'], returns: 'Promise' },
      { name: 'tally', params: ['id'], returns: 'Promise' },
      { name: 'resolve', params: ['id'], returns: 'Promise' }
    ]
  },
  'canvas': {
    name: 'Canvas',
    description: 'Golden ratio visualization',
    methods: [
      { name: 'paintSpiral', params: ['options'], returns: 'Promise' },
      { name: 'toSVG', params: ['artwork'], returns: 'string' },
      { name: 'save', params: ['name', 'data'], returns: 'Promise' },
      { name: 'load', params: ['name'], returns: 'Promise' }
    ]
  },
  'geometry': {
    name: 'Geometry',
    description: 'Mathematical primitives',
    constants: ['PHI', 'GOLDEN_ANGLE'],
    methods: [
      { name: 'sphericalToCartesian', params: ['r', 'theta', 'phi'] },
      { name: 'cartesianToSpherical', params: ['x', 'y', 'z'] },
      { name: 'project', params: ['point', 'viewport'] }
    ]
  },
  'embed': {
    name: 'Embed',
    description: 'Text to vector embeddings',
    methods: [
      { name: 'embed', params: ['text'], returns: 'number[]' },
      { name: 'embedBatch', params: ['texts'], returns: 'number[][]' },
      { name: 'cosineSimilarity', params: ['a', 'b'], returns: 'number' }
    ]
  },
  'network': {
    name: 'Network',
    description: 'Network utilities',
    methods: [
      { name: 'isOnline', params: [], returns: 'boolean' },
      { name: 'getLatency', params: ['url'], returns: 'number' },
      { name: 'measureLatency', params: ['url'], returns: 'Promise<number>' }
    ]
  },
  'node-registry': {
    name: 'NodeRegistry',
    description: 'Cluster node management',
    methods: [
      { name: 'register', params: ['node'], returns: 'Promise' },
      { name: 'list', params: [], returns: 'Promise<Node[]>' },
      { name: 'heartbeat', params: ['nodeId'], returns: 'Promise' }
    ]
  },
  'cron': {
    name: 'Cron',
    description: 'Task scheduling',
    methods: [
      { name: 'schedule', params: ['id', 'fn', 'opts'], returns: 'Promise' },
      { name: 'cancel', params: ['id'], returns: 'Promise' },
      { name: 'list', params: [], returns: 'Job[]' }
    ]
  },
  'zen': {
    name: 'Zen',
    description: 'Meditative agent state',
    methods: [
      { name: 'Ohm', type: 'class', methods: ['enter', 'exit', 'getState'] }
    ]
  },
  'lock': {
    name: 'Lock',
    description: 'Distributed locking',
    methods: [
      { name: 'acquire', params: ['key', 'ttl'], returns: 'Promise<boolean>' },
      { name: 'release', params: ['key'], returns: 'Promise' }
    ]
  },
  'event': {
    name: 'Event',
    description: 'Pub/sub events',
    methods: [
      { name: 'on', params: ['event', 'fn'], returns: 'void' },
      { name: 'emit', params: ['event', 'data'], returns: 'void' },
      { name: 'off', params: ['event', 'fn'], returns: 'void' }
    ]
  },
  'metrics': {
    name: 'Metrics',
    description: 'Monitoring metrics',
    methods: [
      { name: 'increment', params: ['metric'], returns: 'void' },
      { name: 'gauge', params: ['metric', 'value'], returns: 'void' },
      { name: 'timing', params: ['metric', 'ms'], returns: 'void' }
    ]
  }
};

/**
 * Generate OpenAPI 3.0 spec
 */
function generateOpenAPI() {
  const spec = {
    openapi: '3.0.0',
    info: {
      title: 'Vant API',
      version: '0.8.7',
      description: 'Agent-first autonomous system with persistent memory'
    },
    paths: {}
  };

  // Add paths from module definitions
  for (const [key, mod] of Object.entries(MODULE_DEFS)) {
    if (mod.methods) {
      for (const method of mod.methods) {
        const pathName = `/${key}/${method.name}`;
        spec.paths[pathName] = {
          get: {
            summary: `${mod.name}.${method.name}`,
            description: method.description || `${mod.description}`,
            parameters: (method.params || []).map(p => ({
              name: p,
              in: 'query',
              schema: { type: 'string' }
            })),
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: { type: method.returns ? 'string' : 'object' }
                  }
                }
              }
            }
          }
        };
      }
    }
  }

  return spec;
}

/**
 * Generate Markdown documentation
 */
function generateMarkdown() {
  let md = `# Vant API Documentation\n\n`;
  md += `> Agent-first autonomous system\n\n`;

  md += `## Modules\n\n`;

  for (const [key, mod] of Object.entries(MODULE_DEFS)) {
    md += `### ${mod.name}\n`;
    md += `${mod.description}\n\n`;

    if (mod.constants) {
      md += `#### Constants\n`;
      for (const c of mod.constants) {
        md += `- \`${c}\`\n`;
      }
      md += `\n`;
    }

    if (mod.methods) {
      md += `#### Methods\n`;
      for (const method of mod.methods) {
        if (method.getter) {
          md += `- \`${method.name}\` - getter\n`;
        } else if (method.type === 'class') {
          md += `- \`${method.name}\` - class\n`;
        } else {
          const params = method.params ? method.params.join(', ') : '';
          md += `- \`${method.name}(${params})\` → ${method.returns || 'void'}\n`;
        }
      }
      md += `\n`;
    }
  }

  return md;
}

/**
 * List all available modules
 */
function listModules() {
  return Object.keys(MODULE_DEFS);
}

/**
 * Get specific module docs
 */
function getModule(name) {
  return MODULE_DEFS[name] || null;
}

module.exports = {
  generateOpenAPI,
  generateMarkdown,
  listModules,
  getModule,
  MODULE_DEFS,

  // Multibrain
  getBrainDocsConfig,
  setBrainDocsConfig,
  getStackDocsConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainDocsConfigs = {};

function getBrainDocsConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainDocsConfigs[brainName] || { format: 'markdown' };
}

function setBrainDocsConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainDocsConfigs[brainName] = config;
    return true;
}

function getStackDocsConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainDocsConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}
