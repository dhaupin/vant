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
      consent: true,
      benefit: true,
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
    if (this.principles.hasOwnProperty(name)) {
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
