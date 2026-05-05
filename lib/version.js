/**
 * VANT Version - Single source of truth
 * Reads from package.json
 * 
 * DYNAMIC: lib/version.js, lib/config.js, bin/vant.js, etc.
 * 
 * MANUAL: package.json, docs frontmatter, docker-compose.yml, config.example.ini
 * 
 * @example After bumping package.json, run sed commands to update docs and configs
 */
module.exports = require('../package.json').version;
