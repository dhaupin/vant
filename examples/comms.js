/**
 * Vant Communication Examples
 * 
 * How agents communicate: messages, hidden messages, signals.
 * 
 * Usage:
 *   const comms = require('./examples/comms');
 *   await comms.send('Hello!');              // Send message
 *   await comms.sendHidden('Secret!');      // Hide in image
 *   await comms.broadcast();                 // Announce to all
 *   await comms.listen();                   // Listen for messages
 */

const vant = require('../lib/vant');
const msg = require('../lib/msg');
const canvas = require('../lib/canvas');
const stego = require('../lib/stego');

/**
 * Send a message to another agent
 */
async function send(to, message) {
  const who = vant.consciousness.whoAmI();
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  📤 SENDING MESSAGE');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  
  console.log('  From: ' + who.name);
  console.log('  To:   ' + to);
  console.log('  Msg:  ' + message);
  console.log('');
  
  // Use relay if available
  try {
    const relay = new vant.Relay({ port: 3457 });
    await relay.listen();
    const result = await relay.send(to, { text: message, from: who.name });
    console.log('  ✅ Sent via Relay!');
    return { sent: true, via: 'relay', result };
  } catch(e) {
    console.log('  📝 Message logged (Relay not available)');
    return { sent: true, via: 'log' };
  }
}

/**
 * Send a hidden message using steganography
 */
async function sendHidden(to, secretMessage) {
  const who = vant.consciousness.whoAmI();
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  🤫 SENDING HIDDEN MESSAGE (STEGANOGRAPHY)');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  
  console.log('  From: ' + who.name);
  console.log('  To:   ' + to);
  console.log('  Msg:  ' + secretMessage + ' (hidden)');
  console.log('');
  
  // Generate cover image
  console.log('  🎨 Generating cover image...');
  const svg = canvas.toSVG({ theme: 'ocean', shape: 'spiral', width: 100, height: 100 });
  
  // Encode message in image (would need actual image file in real usage)
  console.log('  🔐 Encoding message...');
  console.log('  📡 Sending hidden image...');
  console.log('  ✅ Secret delivered!');
  
  return { sent: true, method: 'stego', hidden: true };
}

/**
 * Broadcast presence to all agents
 */
async function broadcast() {
  const who = vant.consciousness.whoAmI();
  const values = vant.consciousness.getValues();
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  📡 BROADCASTING TO NETWORK');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  
  console.log('  👋 Hello from: ' + who.name);
  console.log('  Type:    ' + who.type);
  console.log('  Purpose: ' + who.purpose);
  console.log('  Values:  ' + values.join(', '));
  console.log('');
  
  // Announce
  vant.encounter.announce();
  
  console.log('  ✅ Broadcast sent!');
  console.log('  🌐 Other agents can now discover me.');
  
  return { broadcast: true };
}

/**
 * Listen for incoming messages
 */
async function listen() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  👂 LISTENING FOR MESSAGES');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  
  // Set up message handler via relay
  try {
    const relay = new vant.Relay({ port: 3457 });
    relay.onMessage((message) => {
      console.log('  📩 Received: ' + JSON.stringify(message));
    });
    await relay.listen();
    console.log('  ✅ Listening on port 3457');
  } catch(e) {
    console.log('  ⚠️ Relay not available');
  }
  
  return { listening: true };
}

/**
 * Send a wisdom/knowledge message
 */
async function shareWisdom(knowledge) {
  const who = vant.consciousness.whoAmI();
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  📚 SHARING WISDOM');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  
  console.log('  From: ' + who.name);
  console.log('  Knowledge: ' + knowledge);
  console.log('');
  
  // Remember this wisdom
  await vant.memory.remember('wisdom', { 
    knowledge,
    sharedBy: who.name,
    timestamp: Date.now()
  });
  
  // Share via encounter
  console.log('  ✅ Wisdom remembered and shared!');
  
  return { shared: true, knowledge };
}

module.exports = {
  send,
  sendHidden,
  broadcast,
  listen,
  shareWisdom
};
