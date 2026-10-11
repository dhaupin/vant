/**
 * Vant Registry - Find and Register Sound-Minded Agents
 *
 * The address book for Vant network.
 * Where we find and register trusted colleagues.
 *
 * This is how we build the network:
 * 1. Register known good agents
 * 2. Assess trustworthiness (quarantine + verify via trust)
 * 3. Add to registry
 *
 * Usage:
 *   const registry = require('./lib/registry');
 *   await registry.register(agent);
 *   const colleagues = registry.list();
 *   const trusted = registry.findByValues();
 */

const event = require('./event');

// (pass 193, registry-decision "wire wider") PERSISTENT — the agent book
// hydrates from models/private/<brain>/state/agent-registry.json on first
// touch and writes through on every mutation, via the shared
// lib/state-store.js (same arch-A rules as node-registry: read-denial
// throws E_STATE_READ, corruption warns + fresh). Registered agents are
// peer identity across restarts — losing them on restart meant every
// process re-learned its colleagues from scratch while trust's ledger
// (persisted) still vouched for them.
const stateStore = require('./state-store');

const STATE_FILE = 'state/agent-registry.json';
let _hydrated = false;

let _tree = null;
function _stateTree() {
    if (!_tree) _tree = new stateStore.StateTree();
    return _tree;
}

class Registry {
  constructor() {
    this.agents = new Map();

    // Pre-register known good agents
    this._initKnownAgents();
  }

  _hydrate() {
    if (_hydrated) return;
    _hydrated = true;
    stateStore.hydrate({
        moduleName: 'agent-registry',
        stateFile: STATE_FILE,
        apply: (snapshot) => {
            if (snapshot && Array.isArray(snapshot.agents)) {
                for (const entry of snapshot.agents) {
                    if (entry && entry.name && !this.agents.has(entry.name)) {
                        this.agents.set(entry.name, entry);
                    }
                }
            }
        },
        tree: _stateTree()
    });
  }

  _merge(disk) {
    if (!disk || !Array.isArray(disk.agents)) return;
    for (const entry of disk.agents) {
        if (!entry || typeof entry.name !== 'string') continue;
        // Cross-process merge: the in-process copy wins for names we've
        // touched; adopt disk rows this process has never seen.
        if (!this.agents.has(entry.name)) {
            this.agents.set(entry.name, entry);
        }
    }
  }

  _persist() {
    stateStore.persistMerged({
        moduleName: 'agent-registry',
        stateFile: STATE_FILE,
        merge: (...a) => this._merge(...a),
        serialize: () => ({ agents: this.list() }),
        tree: _stateTree()
    });
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
    // (pass 40 / agora) Assess via TRUST (spirit.js folded in and removed):
    // quarantined agents are denied; everyone else registers and trust
    // history judges them going forward.
    const trust = require('./trust');
    if (trust.isQuarantined(agent.name)) {
      console.log('  ❌ Agent quarantined, not registering');
      return { registered: false, reason: 'quarantined' };
    }
    const assessment = { trusted: true, name: agent.name };

    const registered = {
      ...agent,
      registeredAt: Date.now(),
      status: 'registered',
      trusted: true
    };

    this.agents.set(agent.name, registered);
    this._persist();

    // (pass 193) Registration is now a TRUST FACT: a registered agent
    // carries one positive cooperation record into trust's persisted
    // ledger, so trust's leaderboard/history reflect the address book
    // instead of only market trades. Quarantine gate above stays the
    // deny path; this is the acknowledge path.
    try { trust.record(agent.name, 'cooperation', { positive: true, note: 'registered in agent registry' }, {}); } catch (e) { /* trust optional here; gate already used it */ }

    event.emit('registry:register', registered);

    console.log('  ✅ Registered: ' + agent.name);
    return { registered: true, agent: registered };
  }

  /**
   * List all registered agents
   */
  list() {
    this._hydrate();
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
    this._hydrate();
    return this.agents.get(name);
  }

  /**
   * Remove agent
   */
  remove(name) {
    this._hydrate();
    const removed = this.agents.delete(name);
    if (removed) {
      this._persist();
      event.emit('registry:remove', { name });
    }
    return { removed };
  }

  /**
   * Get count
   */
  count() {
    this._hydrate();
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
    gatherState,
    restoreState,
  Registry,
  registry,
  register: (agent) => registry.register(agent),
  list: () => registry.list(),
  findByValues: (values) => registry.findByValues(values),
  findByType: (type) => registry.findByType(type),
  get: (name) => registry.get(name),
  remove: (name) => registry.remove(name),
  count: () => registry.count(),
  summary: () => registry.summary(),

  // Multibrain
  getBrainRegistry,
  registerBrainAgent,

  // Multibrain Stack
  getStackRegistries
};

// ==================== MULTIBRAIN SUPPORT ====================

// (pass 193) DEAD STORE RETIRED: `_brainRegistries` was a module-level map
// that registerBrainAgent pushed into and gatherState exported — but it
// was never read back by getBrainRegistry (which returned a fresh object),
// never persisted, and never called by anyone. Both functions now delegate
// to the REAL registry (the persisted singleton above); "per brain" is
// expressed by the state file being brain-scoped already
// (models/private/<brain>/state/agent-registry.json).
function getBrainRegistry() {
    return { agents: registry.list() };
}

function registerBrainAgent(agent) {
    if (!agent || !agent.name) return false;
    return registry.register(agent).then(r => !!r.registered);
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

function getStackRegistries() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
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
    return { agents: registry.list(), count: registry.count(), gatheredAt: Date.now() };
}
function restoreState(data) {
    if (data && Array.isArray(data.agents)) {
        registry._merge({ agents: data.agents });
        registry._persist();
    }
    return { restored: true, count: registry.count() };
}

// ==================== TEST/OPS SEAMS (mirror node-registry) ====================
function _resetHydration() { _hydrated = false; }
function clearState() {
    stateStore.clear(STATE_FILE);
    // Keep the built-in known agents; drop hydrated registrations.
    registry._initKnownAgents();
    _tree = null;
    _hydrated = true;
    return true;
}

module.exports._stateFile = STATE_FILE;
module.exports._treeRoot = () => (_tree ? _tree.rootHash() : null);
module.exports._resetHydration = _resetHydration;
module.exports.clearState = clearState;
