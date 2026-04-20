#!/usr/bin/env node
/**
 * Vant Run
 * CLI-based runtime entry point
 */

console.log(`
╔═══════════════════════════════════════╗
║       Vant Runtime                     ║
╚═══════════════════════════════════════╝

Run with: node bin/vant.js start

Or use these commands:
1. vant health    - Check system health
2. vant load      - Load brain files
3. vant test     - Run tests
4. vant sync     - Sync with GitHub
`);

process.exit(0);
