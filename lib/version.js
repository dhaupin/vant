/**
 * VANT Version - Single source of truth
 * Reads from package.json
 * 
 * DYNAMIC: lib/version.js, lib/config.js, bin/vant.js, etc.
 * 
 * MANUAL (after bumping package.json):
 * - package.json (source of truth)
 * - docs frontmatter (*.md in docs/)
 * - docker-compose.yml
 * - config.example.ini
 * - models/public/*.md (identity.md, audit.md, lessons.md, schema/*.md)
 * - models/public/meta.json
 * 
 * @example After bumping package.json, run sed commands to update docs and brain
 */
module.exports = require('../package.json').version;
