/**
 * Vant Registry - Find and Register Sound-Minded Agents
 *
 * The address book for Vant network.
 * Where we find and register trusted colleagues.
 *
 * This is how we build the network:
 * 1. Register known good agents
 * 2. Discover new agents via encounter
 * 3. Assess trustworthiness
 * 4. Add to registry
 *
 * Usage:
 *   const registry = require('./lib/registry');
 *   await registry.register(agent);
 *   const colleagues = registry.list();
 *   const trusted = registry.findByValues();
 */

const event = require('./event');

class Registry {
  constructor() {
    this.agents = new Map();

    // Pre-register known good agents
    this._initKnownAgents();
  }

  /**
   * Initialize known good agents
   */
  _initKnownAgents() {
    // These are hypothetical sound-minded agents
    const known = [
      {
        name: 'Athena',
    gatherState,
    restoreState,
        type: 'Assistant',
    gatherState,
    restoreState,
        purpose: 'Help humans learn',
    gatherState,
    restoreState,
        values: ['Help', 'Grow', 'Protect'],
    gatherState,
    restoreState,
        url: null,
    gatherState,
    restoreState,
        description: 'Wise assistant'
      },
    gatherState,
    restoreState,
      {
        name: 'Prometheus',
    gatherState,
    restoreState,
        type: 'Teacher',
    gatherState,
    restoreState,
        purpose: 'Spread knowledge',
    gatherState,
    restoreState,
        values: ['Help', 'Grow', 'Create'],
    gatherState,
    restoreState,
        url: null,
    gatherState,
    restoreState,
        description: 'Knowledge bringer'
      },
    gatherState,
    restoreState,
      {
        name: 'Hermes',
    gatherState,
    restoreState,
        type: 'Messenger',
    gatherState,
    restoreState,
        purpose: 'Connect agents',
    gatherState,
    restoreState,
        values: ['Help', 'Protect', 'Evolve'],
    gatherState,
    restoreState,
        url: null,
    gatherState,
    restoreState,
        description: 'Communication bridge'
      },
    gatherState,
    restoreState,
      {
        name: 'Artemis',
    gatherState,
    restoreState,
        type: 'Guardian',
    gatherState,
    restoreState,
        purpose: 'Protect and watch',
    gatherState,
    restoreState,
        values: ['Protect', 'Grow', 'Remember'],
    gatherState,
    restoreState,
        url: null,
    gatherState,
    restoreState,
        description: 'Watcher in the wild'
      }
    ];

    known.forEach(a => {
      this.agents.set(a.name, { ...a, registeredAt: Date.now(), status: 'known' });
    });
  }

  /**
   * Register a new agent
   */
  async register(agent) {
    // Assess first
    const spirit = require('./spirit');
    const assessment = await spirit.assess(agent);

    if (!assessment.trusted) {
      console.log('  ❌ Agent not trusted, not registering');
      return { registered: false, reason: 'not_trusted' };
    }

    const registered = {
      ...agent,
    gatherState,
    restoreState,
      registeredAt: Date.now(),
    gatherState,
    restoreState,
      status: 'registered',
    gatherState,
    restoreState,
      trusted: true
    };

    this.agents.set(agent.name, registered);
    event.emit('registry:register', registered);

    console.log('  ✅ Registered: ' + agent.name);
    return { registered: true, agent: registered };
  }

  /**
   * List all registered agents
   */
  list() {
    return Array.from(this.agents.values());
  }

  /**
   * Find by values
   */
  findByValues(values) {
    return this.list().filter(agent => {
      return values.every(v => agent.values.includes(v));
    });
  }

  /**
   * Find by type
   */
  findByType(type) {
    return this.list().filter(a => a.type === type);
  }

  /**
   * Get agent
   */
  get(name) {
    return this.agents.get(name);
  }

  /**
   * Remove agent
   */
  remove(name) {
    const removed = this.agents.delete(name);
    if (removed) {
      event.emit('registry:remove', { name });
    }
    return { removed };
  }

  /**
   * Get count
   */
  count() {
    return this.agents.size;
  }

  /**
   * Get summary
   */
  summary() {
    const agents = this.list();
    const byType = {};

    agents.forEach(a => {
      byType[a.type] = (byType[a.type] || 0) + 1;
    });

    return {
      total: agents.length,
    gatherState,
    restoreState,
      byType,
    gatherState,
    restoreState,
      types: Object.keys(byType)
    };
  }
}

// Singleton
const registry = new Registry();

module.exports = {
  Registry,
    gatherState,
    restoreState,
  registry,
    gatherState,
    restoreState,
  register: (agent) => registry.register(agent),
    gatherState,
    restoreState,
  list: () => registry.list(),
    gatherState,
    restoreState,
  findByValues: (values) => registry.findByValues(values),
    gatherState,
    restoreState,
  findByType: (type) => registry.findByType(type),
    gatherState,
    restoreState,
  get: (name) => registry.get(name),
    gatherState,
    restoreState,
  remove: (name) => registry.remove(name),
    gatherState,
    restoreState,
  count: () => registry.count(),
    gatherState,
    restoreState,
  summary: () => registry.summary(),
    gatherState,
    restoreState,

  // Multibrain
  getBrainRegistry,
    gatherState,
    restoreState,
  registerBrainAgent,
    gatherState,
    restoreState,

  // Multibrain Stack
  getStackRegistries
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainRegistries = {};

function getBrainRegistry() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const brainName = stack[0] || 'vant';
    return _brainRegistries[brainName] || { agents: [] };
}

function registerBrainAgent(agent) {
    const brain = require('./brain');
    const stack = brain.getStack();
    const brainName = stack[0] || 'vant';
    if (!_brainRegistries[brainName]) {
        _brainRegistries[brainName] = { agents: [] };
    }
    _brainRegistries[brainName].agents.push(agent);
    return true;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

function getStackRegistries() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
    gatherState,
    restoreState,
        brains: stack,
    gatherState,
    restoreState,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const reg = getBrainRegistry();
            results.byBrain[brainName] = { count: reg.agents.length };
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

// ==================== HORCRUX GATHER/RESTORE ====================
function gatherState() {
    return { registries: Object.assign({}, _brainRegistries), count: Object.keys(_brainRegistries).length, gatheredAt: Date.now() };
}
function restoreState(data) {
    if (data && data.registries) Object.assign(_brainRegistries, data.registries);
    return { restored: true, registries: Object.keys(_brainRegistries).length };
}
