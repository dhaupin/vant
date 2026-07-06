/**
 * Vant Trifecta Server
 * 
 * Starts MCP (3457) + API (3456) sharing the same vant instance
 * 
 * Ports:
 * - 3456: REST API (JWT auth, QoS)
 * - 3457: MCP JSON-RPC (agents)
 * 
 * Usage:
 *   const trifecta = require('./lib/trifecta');
 *   await trifecta.start();
 *   // MCP: ws://localhost:3457 or http://localhost:3457
 *   // API: http://localhost:3456/api/v1/...
 */

const vant = require('./vant');

async function start(options = {}) {
  const mcpPort = options.mcpPort || process.env.VANT_MCP_PORT || 3457;
  const apiPort = options.apiPort || process.env.VANT_SERVER_PORT || 3456;
  
  console.log('Starting Vant Trifecta...');
  console.log(`  API:  http://localhost:${apiPort}`);
  console.log(`  MCP:  http://localhost:${mcpPort}`);
  console.log(`  Vant: shared instance`);
  
  // Start MCP server (JSON-RPC)
  const mcp = require('./mcp');
  await mcp.start({ port: mcpPort });
  
  // Start REST API using Server class
  const { Server } = require('./server');
  const apiServer = new Server({ port: apiPort });
  await apiServer.listen();
  
  return {
    vant,
    mcp,
    api: apiServer,
    ports: { api: apiPort, mcp: mcpPort }
  };
}

module.exports = { start };
