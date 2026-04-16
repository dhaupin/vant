/**
 * Health Server
 * Starts Express server with health endpoints
 * 
 * Usage:
 *   node bin/server.js [port]
 *   vant server [port]
 * 
 * Endpoints:
 *   GET /health        - Basic health
 *   GET /health/ready - Readiness probe
 *   GET /health/live  - Liveness probe
 *   GET /metrics      - Prometheus metrics
 */

const health = require('../lib/health');
const logger = require('../lib/logger');

const port = parseInt(process.argv[2]) || 3000;

async function main() {
    logger.info(`Starting VANT health server on port ${port}...`);
    
    try {
        await health.start(port, { metrics: true });
        logger.info(`✓ Health server running at http://localhost:${port}`);
        logger.info('  Endpoints: /health, /health/ready, /health/live, /metrics');
    } catch (err) {
        logger.error('Failed to start server:', err.message);
        process.exit(1);
    }
}

main();