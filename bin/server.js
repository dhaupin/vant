#!/usr/bin/env node
/**
 * Vant Server Command
 * HTTP/HTTPS server with security chain
 * 
 * Usage:
 *   vant server [--port <port>] [--host <host>] [--cert <path>] [--key <path>]
 *   vant server --help
 */

const { Server } = require('../lib/server');

// Parse args
const args = process.argv.slice(2);
const options = {};

// Parse flags
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    if (arg === '--port' || arg === '-p') {
        options.port = parseInt(next, 10);
        i++;
    } else if (arg === '--host' || arg === '-h') {
        options.host = next;
        i++;
    } else if (arg === '--cert' || arg === '-c') {
        options.cert = next;
        i++;
    } else if (arg === '--key' || arg === '-k') {
        options.key = next;
        i++;
    } else if (arg === '--insecure' || arg === '-i') {
        options.allowInsecure = true;
    } else if (arg === '--auth' || arg === '-a') {
        options.authRequired = true;
    } else if (arg === '--help') {
        showHelp();
        process.exit(0);
    }
}

function showHelp() {
    console.log(`
Vant Server - HTTP/HTTPS server with security chain

Usage:
  vant server [options]

Options:
  -p, --port <port>    Server port (default: 3456)
  -h, --host <host>    Bind address (default: 127.0.0.1)
  -c, --cert <path>    TLS certificate path
  -k, --key <path>    TLS key path
  -i, --insecure      Allow HTTP (dev only)
  -a, --auth          Require API key

Environment:
  VANT_SERVER_PORT       Server port
  VANT_SERVER_BIND       Bind address
  VANT_SERVER_CERT      TLS certificate path
  VANT_SERVER_KEY       TLS key path
  VANT_SERVER_INSECURE  Allow HTTP (set to 1)
  VANT_SERVER_AUTH_REQUIRED  Require API key
  VANT_API_KEY          API key for authentication

Examples:
  # Development (HTTP)
  vant server --insecure
  
  # Production with TLS
  vant server --cert /path/to/cert.pem --key /path/to/key.pem
  
  # Remote with auth
  VANT_SERVER_AUTH_REQUIRED=1 VANT_API_KEY=mykey vant server

Endpoints:
  GET /tools  - List available tools
  GET /health - Server health
  POST /call  - Call tool (JSON-RPC)
`);
}

// Start server
async function main() {
    const server = new Server(options);
    
    server.on('listening', () => {
        const addr = server.address();
        console.log(`Vant server running on ${addr.host}:${addr.port}`);
    });
    
    server.on('error', (err) => {
        console.error('Server error:', err.message);
        process.exit(1);
    });
    
    await server.listen();
}

main().catch(err => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
});