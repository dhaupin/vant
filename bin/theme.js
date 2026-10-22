#!/usr/bin/env node
/**
 * Vant Theme CLI
 *
 * (pass 188) REWIRED. The old verbs (list/apply/create/preview/export/
 * import) printed canned strings for a theme-picker fantasy — lib/theme.js
 * is NOT a skinnable-theme system; it is the unified CLI/MCP rendering
 * surface (brand header, status icons, section styling, per-brain theme
 * config in memory). The verbs now show what the module actually is:
 *
 *   vant theme show                # Render the current surface (header, icons)
 *   vant theme status              # Multibrain theme configs (per-brain view)
 *   vant theme set <key> <json>    # Set this brain's theme config (memory)
 *
 * Usage:
 *   vant theme show               # Demo-render the CLI surface
 *   vant theme status             # Theme config per brain on the stack
 *   vant theme set <key> <value>  # Set brain theme config (JSON value)
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'show';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Theme CLI - the CLI/MCP rendering surface (lib/theme.js)

Usage:
  vant theme show                 Render the current CLI surface (header + status icons)
  vant theme status               Multibrain view: theme config per brain on the stack
  vant theme set <key> <jsonval>  Set this brain's theme config (in-memory)

Note: this module is the rendering/color surface used by every CLI page —
it is not a user-facing theme picker. Skins/modes are a future surface.
`);
    process.exit(0);
}

function run() {
    const theme = require('../lib/theme');

    if (subcmd === 'show' || subcmd === 'demo' || subcmd === 'render') {
        console.log(theme.vantHeader + ' CLI surface');
        console.log('  ' + theme.status.ok('ok status renders like this'));
        console.log('  ' + theme.status.fail('fail status renders like this'));
        console.log('  ' + theme.status.warn('warning renders like this'));
        console.log('  ' + theme.status.info('info renders like this'));
        console.log('  ' + theme.section('sections') + ' ' + theme.label('labels') + ' ' + theme.value('values'));
        console.log('  color: ' + (theme.chalk && typeof theme.chalk.level === 'number' && theme.chalk.level > 0 ? 'ANSI face on (grade ' + theme.chalk.level + ')' : 'plain (no ANSI face; piped output / NO_COLOR / CI / TERM=dumb renders unstyled)'));
    } else if (subcmd === 'status' || subcmd === 'stack') {
        const configs = theme.getStackThemeConfigs();
        console.log('Theme configs (source: ' + configs.source + ', ' + configs.brains.length + ' brains):');
        for (const [brainName, cfg] of Object.entries(configs.byBrain)) {
            console.log('  ' + brainName + ': ' + (cfg.error ? 'error: ' + cfg.error : JSON.stringify(cfg)));
        }
    } else if (subcmd === 'set' || subcmd === 'config') {
        const key = args[1];
        if (!key) {
            console.error('Usage: vant theme set <key> <jsonValue>');
            process.exit(1);
        }
        let value = args.slice(2).join(' ') || 'true';
        try { value = JSON.parse(value); } catch (e) { /* keep string */ }
        const okSet = theme.setBrainThemeConfig({ [key]: value });
        const cfg = theme.getBrainThemeConfig();
        console.log((okSet ? theme.ok + ' ' : theme.fail + ' ') + 'Theme config for the active brain: ' + JSON.stringify(cfg));
    } else {
        console.log('Usage: vant theme <command>');
        console.log('Commands: show | status | set');
        process.exit(1);
    }
}

run();
