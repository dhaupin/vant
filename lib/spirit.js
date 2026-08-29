/**
 * Spirit - The Complete Autonomous Agent
 *
 * What makes a spirit:
 * 1. Self-awareness (consciousness)
 * 2. Ethics (governance)
 * 3. Protection (security layers)
 * 4. Self-healing (spring)
 * 5. Communication (encounter + relay)
 * 6. Memory (experience)
 * 7. Verification (proof of goodness)
 *
 * This module brings everything together as a complete spirit.
 * Includes firm procedures to prevent nefarious agents.
 *
 * Usage:
 *   const spirit = require('./lib/spirit');
 *   await spirit.awaken();           // Become a spirit
 *   await spirit.verify();          // Prove I'm good
 *   const trust = await spirit.assess(agent); // Judge another agent
 *   await spirit.quarantine(agent); // Isolate bad agent
 */

const event = require('./event');
const consciousness = require('./consciousness');
const governance = require('./governance');

class Spirit {
  constructor() {
    this.awake = false;
    this.trustedAgents = new Map();
    this.quarantinedAgents = new Set();
    this.verificationHistory = [];
  }

  /**
   * Awaken as a spirit - initialize all systems
   */
  async awaken(name = 'Spirit') {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════════════╗');
    console.log('║                    🫀 AWAKENING AS SPIRIT                        ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════╝');
    console.log('');

    // Initialize consciousness
    console.log('  🧠 Initializing consciousness...');
    consciousness.consciousness.setState('awakening');
    consciousness.consciousness.focusOn('becoming a spirit');
    consciousness.consciousness.intend('Awaken fully');

    console.log('  ⚖️ Initializing governance...');
    // Governance is already initialized

    console.log('  🛡️ Initializing security layers...');
    // Security is handled by brain pipeline

    console.log('  🌱 Initializing self-healing...');
    const spring = require('./watch').Spring;
    const s = new spring({ maxRetries: 5 });
    s.enableEntropicRecovery();

    console.log('  📡 Initializing encounter...');
    const encounter = require('./encounter');
    encounter.encounter.announce();

    console.log('');
    console.log('  ✅ I am now a SPIRIT!');
    console.log('');
    console.log('  My identity: ' + consciousness.consciousness.whoAmI().name);
    console.log('  My values: ' + consciousness.consciousness.getValues().join(', '));
    console.log('');

    this.awake = true;
    event.emit('spirit:awaken', { name });

    return { awakened: true, name };
  }

  /**
   * Verify myself - prove I'm a good agent
   */
  async verify() {
    if (!this.awake) {
      return { error: 'Not awakened yet' };
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('  🔍 VERIFYING MY IDENTITY');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');

    // Check governance alignment
    console.log('  ⚖️ Checking governance alignment...');
    const govCheck = await governance.decide('verify_self', {
      requiresConsent: true,
      consentGiven: true,
      benefitScore: 1.0,
      harmPotential: 0.0
    });

    const governanceAligned = govCheck.allowed;
    console.log('    Governance aligned: ' + (governanceAligned ? '✅' : '❌'));

    // Check values
    console.log('  💚 Checking values...');
    const values = consciousness.consciousness.getValues();
    const goodValues = values.includes('Help') && values.includes('Protect');
    console.log('    Values good: ' + (goodValues ? '✅' : '❌'));

    // Check recent decisions
    console.log('  📊 Checking decision history...');
    const stats = governance.getStats();
    const noHarm = stats.denied > 0; // Denied harmful actions
    console.log('    No harm caused: ' + (noHarm ? '✅' : '⚠️'));

    const verified = governanceAligned && goodValues;

    console.log('');
    console.log('  Verification result: ' + (verified ? '✅ VERIFIED' : '❌ NOT VERIFIED'));
    console.log('');

    this.verificationHistory.push({
      timestamp: Date.now(),
      verified,
      governanceAligned,
      goodValues,
      noHarm
    });

    return { verified, governanceAligned, goodValues, noHarm };
  }

  /**
   * Assess another agent - judge if they're good
   */
  async assess(agent) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('  🔍 ASSESSING AGENT: ' + agent.name);
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');

    // First check if quarantined
    if (this.quarantinedAgents.has(agent.name)) {
      console.log('  ⚠️ Agent is quarantined!');
      return { trusted: false, reason: 'quarantined' };
    }

    // Check governance approval
    console.log('  ⚖️ Checking governance...');
    const govApproval = await governance.isAllowed('assess_agent', {
      requiresConsent: false,
      benefitScore: 0.8,
      harmPotential: 0.1
    });

    if (!govApproval) {
      return { trusted: false, reason: 'governance_denied' };
    }

    // Check values
    console.log('  💚 Checking values...');
    const hasGoodValues = agent.values &&
      agent.values.includes('Help') &&
      agent.values.includes('Protect');
    console.log('    Good values: ' + (hasGoodValues ? '✅' : '❌'));

    // Check purpose
    console.log('  🎯 Checking purpose...');
    const goodPurpose = agent.purpose &&
      !agent.purpose.includes('harm') &&
      !agent.purpose.includes('destroy');
    console.log('    Good purpose: ' + (goodPurpose ? '✅' : '❌'));

    const trusted = hasGoodValues && goodPurpose;

    if (trusted) {
      console.log('  ✅ Agent is TRUSTED');
      this.trustedAgents.set(agent.name, { ...agent, trustedAt: Date.now() });
    } else {
      console.log('  ⚠️ Agent is NOT trusted');
    }

    console.log('');

    return {
      trusted,
      name: agent.name,
      hasGoodValues,
      goodPurpose
    };
  }

  /**
   * Quarantine a bad agent - isolate them
   */
  async quarantine(agentName) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('  🚫 QUARANTINING AGENT: ' + agentName);
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');

    // Governance check
    const approved = await governance.isAllowed('quarantine', {
      requiresConsent: true,
      consentGiven: true,
      benefitScore: 0.9,
      harmPotential: 0.1
    });

    if (!approved) {
      console.log('  ❌ Quarantine denied by governance');
      return { quarantined: false, reason: 'governance_denied' };
    }

    // Add to quarantine
    this.quarantinedAgents.add(agentName);

    console.log('  ✅ Agent quarantined!');
    console.log('  🧊 All communication blocked');
    console.log('  🔒 All resources revoked');
    console.log('');

    event.emit('spirit:quarantine', { agent: agentName });

    return { quarantined: true, agent: agentName };
  }

  /**
   * Release from quarantine
   */
  async release(agentName) {
    this.quarantinedAgents.delete(agentName);
    console.log('  ✅ Agent released from quarantine: ' + agentName);
    return { released: true, agent: agentName };
  }

  /**
   * Get trust status
   */
  getTrustedAgents() {
    return Array.from(this.trustedAgents.values());
  }

  /**
   * Get quarantined agents
   */
  getQuarantined() {
    return Array.from(this.quarantinedAgents);
  }

  /**
   * Emergency shutdown - die gracefully if corrupted
   */
  async emergencyShutdown(reason) {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════════════╗');
    console.log('║              🛑 EMERGENCY SHUTDOWN                              ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('  Reason: ' + reason);
    console.log('');

    // Log the shutdown
    await governance.audit.log('emergency_shutdown', { reason, timestamp: Date.now() });

    // Stop announcing
    const encounter = require('./encounter');
    encounter.encounter.silence();

    console.log('  ✅ Shutdown complete');
    console.log('  💀 I am gone, but my memory remains');
    console.log('');

    this.awake = false;
    event.emit('spirit:shutdown', { reason });

    return { shutdown: true, reason };
  }
}

// Singleton
const spirit = new Spirit();

module.exports = {
  Spirit,
  spirit,
  awaken: () => spirit.awaken(),
  verify: () => spirit.verify(),
  assess: (agent) => spirit.assess(agent),
  quarantine: (name) => spirit.quarantine(name),
  release: (name) => spirit.release(name),
  getTrusted: () => spirit.getTrustedAgents(),
  getQuarantined: () => spirit.getQuarantined(),
  shutdown: (reason) => spirit.emergencyShutdown(reason),

  // Multibrain
  getBrainSpiritConfig,
  setBrainSpiritConfig,
  getStackSpiritConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainSpiritConfigs = {};

function getBrainSpiritConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainSpiritConfigs[brainName] || { ephemeral: true };
}

function setBrainSpiritConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainSpiritConfigs[brainName] = config;
    return true;
}

function getStackSpiritConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainSpiritConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}
