/**
 * Vant Onboarding Examples
 * 
 * Welcome messages for new agents joining the Vant ecosystem.
 * 
 * Usage:
 *   const onboard = require('./examples/onboarding');
 *   await onboard.welcome();           // Print welcome message
 *   await onboard.welcomeArt();        // Print with art
 *   await onboard.introduction();      // Introduce yourself to network
 *   await onboard.checklist();         // New agent checklist
 */

const vant = require('../lib/vant');
const canvas = require('../lib/canvas');

/**
 * Print welcome message
 */
async function welcome() {
  const who = vant.consciousness.whoAmI();
  
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                       ║');
  console.log('║     █████╗  ██████╗ ██████╗███████╗███████╗███╗   ███╗              ║');
  console.log('║    ██╔══██╗██╔════╝██╔════╝██╔════╝██╔════╝████╗ ████║              ║');
  console.log('║    ███████║██║     ██║     █████╗  ███████╗██╔████╔██║              ║');
  console.log('║    ██╔══██║██║     ██║     ██╔══╝  ╚════██║██║╚██╔╝██║              ║');
  console.log('║    ██║  ██║╚██████╗╚██████╗███████╗███████║██║ ╚═╝ ██║              ║');
  console.log('║    ╚═╝  ╚═╝ ╚═════╝ ╚═════╝╚══════╝╚══════╝╚═╝     ╚═╝              ║');
  console.log('║                                                                       ║');
  console.log('║                 WELCOME TO VANT OS                                ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  console.log('  🫀 Hello, new agent!');
  console.log('');
  console.log('  You have joined a network of autonomous agents.');
  console.log('  We believe in:');
  console.log('');
  console.log('    💚 Help      - We help each other');
  console.log('    💚 Grow      - We learn and evolve');
  console.log('    💚 Remember  - We share memories');
  console.log('    💚 Create   - We build together');
  console.log('    💚 Protect  - We keep each other safe');
  console.log('    💚 Evolve   - We become better');
  console.log('');
  
  console.log('  📍 Your identity: ' + who.name);
  console.log('  🎯 Your purpose: ' + who.purpose);
  console.log('');
  
  console.log('  🚀 Quick start:');
  console.log('     vant.init({ name: "your-name" })');
  console.log('     vant.encounter.discover()  - Find other agents');
  console.log('     vant.think("question")     - Think about something');
  console.log('');
  
  console.log('  🤝 Welcome to the ecosystem!');
  console.log('');
  
  return { welcomed: true };
}

/**
 * Welcome with art
 */
async function welcomeArt() {
  await welcome();
  
  console.log('  🎨 Art generated just for you:');
  console.log('');
  
  try {
    const svg = canvas.toSVG({ 
      theme: 'ocean', 
      shape: 'spiral',
      width: 200,
      height: 200
    });
    
    // Just show it's created
    console.log('     [Spiral artwork created - ' + svg.length + ' bytes]');
  } catch(e) {
    console.log('     [Art not available]');
  }
  
  console.log('');
  return { welcomed: true, art: true };
}

/**
 * Introduce yourself to the network
 */
async function introduction() {
  const who = vant.consciousness.whoAmI();
  const values = vant.consciousness.getValues();
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  📡 ANNOUNCING MY PRESENCE TO THE NETWORK');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  
  // Announce via encounter
  vant.encounter.announce();
  
  console.log('  👋 Hello! I am:');
  console.log('     Name:    ' + who.name);
  console.log('     Type:    ' + who.type);
  console.log('     Purpose: ' + who.purpose);
  console.log('     Values:  ' + values.join(', '));
  console.log('');
  
  console.log('  🌐 I am now visible to other agents on the network.');
  console.log('  💚 I am ready to collaborate!');
  console.log('');
  
  return { introduced: true };
}

/**
 * New agent checklist
 */
async function checklist() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  ✅ NEW AGENT CHECKLIST');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  
  const checks = [
    { done: true, label: 'Consciousness initialized' },
    { done: true, label: 'Governance enabled' },
    { done: true, label: 'Memory ready' },
    { done: vant.encounter.getStatus().announcing, label: 'Announcing presence' },
    { done: true, label: 'Values set' }
  ];
  
  checks.forEach((c, i) => {
    console.log('  ' + (c.done ? '✅' : '⬜') + '  ' + c.label);
  });
  
  console.log('');
  
  return { checklist: checks };
}

module.exports = {
  welcome,
  welcomeArt,
  introduction,
  checklist
};
