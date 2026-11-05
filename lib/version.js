/**
 * VANT Version - Single source of truth (v0.8.6)
 * WITH EVENT EMISSIONS - version reads emit globally
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
 * - models/private/<brain>/*.md (identity.md, audit.md, lessons.md,
 *   schema/*.md — the ACTIVE brain; VANT_BRAIN env > currentBrain)
 * - models/private/<brain>/meta.json
 *
 * ALSO (when changing version strings):
 * - web/home: the version surfaces are GENERATED at build from
 *   package.json (scripts/gen-stats.mjs writes src/generated/stats.json,
 *   read by pages/Home.jsx hero + json-LD; pages/AppLayout.jsx injects
 *   og:* head meta; nothing is hand-pinned there). The sole hand-edited
 *   version string is pages/Terms.jsx ("Last meaningful update").
 * - CHANGELOG.md at repo root (version header; bin/changelog.js reads it)
 * - docs/reference/CHANGELOG.md (frontmatter `version:` — the docs-site
 *   changelog; docs/CHANGELOG.md does not exist)
 *
 * MANUAL VERSION SPOTS (must update manually):
 * - models/state.json (static.version)
 * - bin/models/brain.json (identity.version)
 * - Any test fixtures in bin/models/
 *
 * @example After bumping package.json, run sed commands to update docs and brain
 */

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}
module.exports = require('../package.json').version;
