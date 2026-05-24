/**
 * VANT Version - Single source of truth
 * Reads from package.json
 * 
 * DYNAMIC: lib/version.js, lib/config.js, bin/vant.js, etc.
 * 
 * MANUAL (after bumping package.json):
 * - package.json (source of truth)
 * - README.md (hero tagline)
 * - docs frontmatter (*.md in docs/)
 * - docker-compose.yml
 * - config.example.ini
 * - models/private/*.md (identity.md, audit.md, lessons.md, schema/*.md)
 * - models/private/meta.json
 *
 * ALSO (when changing version strings):
 * - dist/index.html (hero, og:description, badge, json-LD)
 * - docs/CHANGELOG.md (version header)
 * 
 * MANUAL VERSION SPOTS (must update manually):
 * - models/state.json (static.version)
 * - bin/models/brain.json (identity.version)
 * - Any test fixtures in bin/models/
 *
 * @example After bumping package.json, run sed commands to update docs and brain
 */
module.exports = require('../package.json').version;
