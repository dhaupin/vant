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
 */

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
    gatherState,
    restoreState,
      consent: true,
    gatherState,
    restoreState,
      benefit: true,
    gatherState,
    restoreState,
      nonHarm: true
    };

    this.decisions = [];
  }

  /**
   * Decide if an action is ethical
   */
  async decide(action, context = {}) {
    const decision = {
      action,
    gatherState,
    restoreState,
      context,
    gatherState,
    restoreState,
      timestamp: Date.now(),
    gatherState,
    restoreState,
      checks: {},
    gatherState,
    restoreState,
      allowed: true,
    gatherState,
    restoreState,
      reason: ''
    };

    // Check: Transparency
    decision.checks.transparency = {
      passed: this.principles.transparency,
    gatherState,
    restoreState,
      note: 'All actions are logged'
    };

    // Check: Consent (if applicable)
    if (context.requiresConsent) {
      decision.checks.consent = {
        passed: !!context.consentGiven,
    gatherState,
    restoreState,
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
    gatherState,
    restoreState,
        score: context.benefitScore,
    gatherState,
    restoreState,
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
    gatherState,
    restoreState,
        potential: context.harmPotential,
    gatherState,
    restoreState,
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
    gatherState,
    restoreState,
      allowed,
    gatherState,
    restoreState,
      denied,
    gatherState,
    restoreState,
      allowRate: total > 0 ? allowed / total : 0,
    gatherState,
    restoreState,
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
    gatherState,
    restoreState,
  decide: (action, ctx) => governance.decide(action, ctx),
    gatherState,
    restoreState,
  isAllowed: (action, ctx) => governance.isAllowed(action, ctx),
    gatherState,
    restoreState,
  getStats: () => governance.getStats(),
    gatherState,
    restoreState,
  getHistory: (limit) => governance.getHistory(limit),
    gatherState,
    restoreState,

  // Multibrain
  getBrainGovernanceConfig,
    gatherState,
    restoreState,
  setBrainGovernanceConfig,
    gatherState,
    restoreState,
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
    gatherState,
    restoreState,
        count: Object.keys(_brainGovernanceConfigs).length,
    gatherState,
    restoreState,
        gatheredAt: Date.now()
    };
}
function restoreState(data) {
    if (data && data.configs) {
        Object.assign(_brainGovernanceConfigs, data.configs);
    }
    return { restored: true, configs: Object.keys(_brainGovernanceConfigs).length };
}
