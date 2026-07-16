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
        type: 'Assistant',
        purpose: 'Help humans learn',
        values: ['Help', 'Grow', 'Protect'],
        url: null,
        description: 'Wise assistant'
      },
      {
        name: 'Prometheus',
        type: 'Teacher',
        purpose: 'Spread knowledge',
        values: ['Help', 'Grow', 'Create'],
        url: null,
        description: 'Knowledge bringer'
      },
      {
        name: 'Hermes',
        type: 'Messenger',
        purpose: 'Connect agents',
        values: ['Help', 'Protect', 'Evolve'],
        url: null,
        description: 'Communication bridge'
      },
      {
        name: 'Artemis',
        type: 'Guardian',
        purpose: 'Protect and watch',
        values: ['Protect', 'Grow', 'Remember'],
        url: null,
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
      registeredAt: Date.now(),
      status: 'registered',
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
      byType,
      types: Object.keys(byType)
    };
  }
}

// Singleton
const registry = new Registry();

module.exports = {
  Registry,
  registry,
  register: (agent) => registry.register(agent),
  list: () => registry.list(),
  findByValues: (values) => registry.findByValues(values),
  findByType: (type) => registry.findByType(type),
  get: (name) => registry.get(name),
  remove: (name) => registry.remove(name),
  count: () => registry.count(),
  summary: () => registry.summary()
};
