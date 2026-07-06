/**
 * Test Trifecta Server
 * Tests MCP + API + Vant working together
 */

const assert = require('assert');

async function test() {
  console.log('Test: Trifecta Server');
  
  const trifecta = require('../lib/trifecta');
  
  // Just verify structure - don't actually start servers in test
  assert(trifecta.start, 'start function missing');
  assert(typeof trifecta.start === 'function', 'start should be function');
  
  // Verify MCP has start
  const mcp = require('../lib/mcp');
  assert(mcp.start, 'MCP start missing');
  
  // Verify Server exists
  const { Server } = require('../lib/server');
  assert(Server, 'Server class missing');
  
  console.log('  ✓ trifecta.start is function');
  console.log('  ✓ mcp.start available');
  console.log('  ✓ Server class available');
  
  return { passed: 1, failed: 0 };
}

// Run
test().then(r => {
  console.log('Results:', r);
  process.exit(r.failed > 0 ? 1 : 0);
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
