/**
 * Vant CLI Argument Standard
 * 
 * ## Template for new CLI commands:
 * 
 * ```javascript
 * #!/usr/bin/env node
 * /**
 *  * Vant <Command> CLI
 *  * Description of what it does
 *  * 
 *  * All args should have both long (--arg) and short (-a) forms.
 *  * 
 *  * Usage: vant <cmd> [-h|--help] [-a|--arg] [-b|--boolean]
 *  * /
 * 
 * // -h/--help (MUST check first)
 * const args = process.argv.slice(2);
 * if (args[0] === '-h' || args[0] === '--help') {
 *     console.log('Usage: vant <cmd> [-h|--help] [options]');
 *     console.log('  -h, --help     Show this help');
 *     console.log('  -a, --arg     Description');
 *     process.exit(0);
 * }
 * 
 * // Parse: support BOTH forms
 * const flag = args.includes('--flag') || args.includes('-f');
 * const value = args.find(a => a.startsWith('--value=') || a.startsWith('-v='))?.split('=')[1];
 * ```
 * 
 * ## Conventions:
 * - Long args: double-dash (--argument)
 * - Short args: single-dash (-a single char)
 * - Value syntax: --arg=value or -a=value
 * - Help MUST show: "-h, --help" (both forms)
 * - Conflict resolution: use -H, -P, etc. for capitals
 * - Always show help header with "All args should have both..."
 */

module.exports = {};