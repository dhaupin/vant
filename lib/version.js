/**
 * VANT Version - Single source of truth
 * Reads from package.json
 * 
 * TOTAL VERSION SOURCES - Update package.json, everything else dynamic:
 * 
 * DYNAMIC (auto-reads package.json):
 *   - lib/version.js (this file) → main source
 *   - lib/config.js
 *   - lib/notifications.js
 *   - lib/health.js
 *   - bin/vant.js, bot.js, setup.js, build-test.js
 *   - .github/workflows/docker.yml (uses --build-arg)
 *   - Dockerfile (uses ARG VERSION)
 * 
 * MANUAL (must edit directly):
 *   - package.json (version field) - SOURCE OF TRUTH
 *   - CHANGELOG.md (new version header)
 *   - RELEASE.md (title)
 *   - Brain files (bot-managed, update at release):
 *     - models/public/identity.md
 *     - models/public/meta.json
 *     - models/public/succession.md
 *     - models/public/_succession.json
 *     - models/.ledger.json
 */
module.exports = require('../package.json').version;