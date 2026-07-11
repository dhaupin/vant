/**
 * Governance - Ethics & Decision Making
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

const audit = require('./audit');

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
    
    // Log decision
    await audit.log('governance:decide', decision);
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
  getHistory: (limit) => governance.getHistory(limit)
};
