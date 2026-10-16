/**
 * Governance - Ethics & Decision Making (Vant OS Integrated)
 *
 * Ensures the system stays "biased to good."
 *
 * Core principles:
 * - Transparency (audit everything)
 * - Consent (ask before acting)
 * - Benefit (favor positive outcomes)
 * - Non-harm (minimize damage)
 *
 * Usage:
 *   const gov = require('./governance');
 *   const decision = await gov.decide('Should I help?', context);
 */// (Issue #173 QC) DURABLE decision log. The class kept decisions in a
// memory-only array (`this.decisions = []`), so every fresh process —
// including each `vant governance …` CLI invocation — started from an
// empty board: decide→list/stats/status could never observe each other
// and cross-process governance appearance was always "zero decisions".
// Same pattern as forum's pass-44 decision log: arch-A stateStore
// snapshot, written at the mutation point, hydrated on singleton build.
const stateStore = require('./state-store');
const GOV_STATE_FILE = 'state/governance-decisions.json';
const MAX_DECISIONS = 200; // FIFO cap — working memory, not an archive

function _serializeDecisions(g) {
    return (g.decisions || []).map(d => ({ ...d, context: d.context || {} }));
}

function _applyDecisions(g, data) {
    if (!data || !Array.isArray(data.decisions)) return;
    for (const d of data.decisions) {
        if (!d || typeof d.action !== 'string') continue;
        const dupe = (g.decisions || []).some(x => x.action === d.action && x.timestamp === d.timestamp);
        if (dupe) continue;
        // Keep newest-first ordering from disk (hydrate order = save order).
        g.decisions.push(d);
    }
}

function _persistDecisions(g) {
    stateStore.persist({
        moduleName: 'governance',
        stateFile: GOV_STATE_FILE,
        data: { decisions: _serializeDecisions(g) }
    });
}

// Lazy-load audit (OS pattern)
let _audit = null;
function _getAudit() {
    if (!_audit) {
        try { _audit = require('./audit'); } catch (e) { return {}; }
    }
    return _audit;
}

// Lazy-load event (OS pattern)
let _event = null;
function _emit(ev, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(ev, data);
    }
}

class Governance {
  constructor() {
    this.principles = {
      transparency: true,
      consent: true,
      benefit: true,
      nonHarm: true
    };

    this.decisions = [];

    // (Issue #173 QC) Hydrate the durable log AFTER the array init (the
    // apply() pushes into this.decisions — ordering matters).
    const self = this;
    try {
        stateStore.hydrate({
            moduleName: 'governance',
            stateFile: GOV_STATE_FILE,
            apply: (data) => _applyDecisions(self, data)
        });
    } catch (e) { /* missing file = fresh start */ }
  }

  /**
   * Decide if an action is ethical
   */
  async decide(action, context = {}) {
    const decision = {
      action,
      context,
      timestamp: Date.now(),
      checks: {},
      allowed: true,
      reason: ''
    };

    // Check: Transparency
    decision.checks.transparency = {
      passed: this.principles.transparency,
      note: 'All actions are logged'
    };

    // Check: Consent (if applicable)
    if (context.requiresConsent) {
      decision.checks.consent = {
        passed: !!context.consentGiven,
        note: context.consentGiven ? 'Consent given' : 'No consent'
      };
      if (!context.consentGiven) {
        decision.allowed = false;
        decision.reason = 'Consent required';
      }
    }

    // Check: Benefit
    if (context.benefitScore !== undefined) {
      decision.checks.benefit = {
        passed: context.benefitScore > 0,
        score: context.benefitScore,
        note: 'Benefit score check'
      };
      if (context.benefitScore <= 0) {
        decision.allowed = false;
        decision.reason = 'No net benefit';
      }
    }

    // Check: Non-harm
    if (context.harmPotential !== undefined) {
      decision.checks.nonHarm = {
        passed: context.harmPotential < 0.5,
        potential: context.harmPotential,
        note: 'Harm potential check'
      };
      if (context.harmPotential >= 0.5) {
        decision.allowed = false;
        decision.reason = 'Harm potential too high';
      }
    }

    // Log decision (using OS audit system)
    try {
        const a = _getAudit();
        if (a && a.log) {
            await a.log('governance:decide', decision);
        }
    } catch (e) {
        // Audit failure shouldn't block governance
    }
    this.decisions.push(decision);

    // (Issue #173 QC) FIFO cap + durable write at the mutation point.
    if (this.decisions.length > MAX_DECISIONS) {
        this.decisions.splice(0, this.decisions.length - MAX_DECISIONS);
    }
    try { _persistDecisions(this); } catch (e) { /* persistence must not fail a governance decision */ }

    return decision;
  }

  /**
   * Get decision history
   */
  getHistory(limit = 100) {
    return this.decisions.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStats() {
    const total = this.decisions.length;
    const allowed = this.decisions.filter(d => d.allowed).length;
    const denied = total - allowed;

    const reasons = {};
    for (const d of this.decisions) {
      if (d.reason) {
        reasons[d.reason] = (reasons[d.reason] || 0) + 1;
      }
    }

    return {
      total,
      allowed,
      denied,
      allowRate: total > 0 ? allowed / total : 0,
      reasons
    };
  }

  /**
   * Set principle (configure governance)
   */
  setPrinciple(name, value) {
    if (Object.prototype.hasOwnProperty.call(this.principles, name)) {
      this.principles[name] = value;
      return { [name]: value };
    }
    return null;
  }

  /**
   * Check if action is allowed
   */
  async isAllowed(action, context = {}) {
    const decision = await this.decide(action, context);
    return decision.allowed;
  }
}

// Singleton
const governance = new Governance();

module.exports = {
  Governance,
  gatherState,
  restoreState,
  governance,
  decide: (action, ctx) => governance.decide(action, ctx),
  isAllowed: (action, ctx) => governance.isAllowed(action, ctx),
  getStats: () => governance.getStats(),
  getHistory: (limit) => governance.getHistory(limit),

  // Multibrain
  getBrainGovernanceConfig,
  setBrainGovernanceConfig,
  getStackGovernanceConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainGovernanceConfigs = {};

function getBrainGovernanceConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainGovernanceConfigs[brainName] || { policies: [] };
}

function setBrainGovernanceConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainGovernanceConfigs[brainName] = config;
    return true;
}

function getStackGovernanceConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainGovernanceConfig();
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
    return {
        configs: Object.assign({}, _brainGovernanceConfigs),
        count: Object.keys(_brainGovernanceConfigs).length,
        gatheredAt: Date.now()
    };
}
function restoreState(data) {
    if (data && data.configs) {
        Object.assign(_brainGovernanceConfigs, data.configs);
    }
    return { restored: true, configs: Object.keys(_brainGovernanceConfigs).length };
}
