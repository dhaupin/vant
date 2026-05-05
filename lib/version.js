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
 *   - bin/vant.js, bot.js, setup.js
 *   - .github/workflows/docker.yml (uses --build-arg)
 *   - Dockerfile (uses ARG VERSION)
 * 
 * MANUAL (must edit directly for version bump):
 *   - package.json (version field) - SOURCE OF TRUTH
 *   - CHANGELOG.md (new version header)
 *   - RELEASE.md (title)
 *   - docs/*/*.md (version frontmatter) - 42 files
 *   - docker-compose.yml (VANT_VERSION env)
 *   - config.example.ini (VANT_VERSION)
 *   - Brain files (bot-managed):
 *     - models/public/identity.md (VERSION line)
 *     - models/public/meta.json (version)
 *     - models/public/succession.md (version header)
 *     - models/public/_succession.json (version)
 *     - models/.ledger.json (version, from, to, active)
 *     - models/public/lessons.md (version dates)
 * 
 * RUN: After bumping package.json:
 *   sed -i 's/0\.8\.[0-9]/0.8.NEW/g' docs/*.md docs/*/*.md
 *   sed -i 's/"version": "0.8\.[0-9]"/"version": "0.8.NEW"/g' *.json models/*.json
 *   sed -i 's/VANT_VERSION=0\.8\.[0-9]/VANT_VERSION=0.8.NEW/g' docker-compose.yml config.example.ini
 */
module.exports = require('../package.json').version;// VAF check
