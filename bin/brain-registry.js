#!/usr/bin/env node
/**
 * Vant Brain Registry - list the brains on this install
 *
 * (pass 71, issue #94) This command used to be demo stubs: `list` printed
 * a hardcoded "main (current)", `register` printed a fake success. The
 * runtime has NO registration step - brains are resolved from the models/
 * layout and the stack in models/state.json (lib/brain brainDirs() +
 * getStack()). The CLI now reports that reality instead of inventing it.
 *
 * Usage:
 *   vant brain-registry list        # List brains on disk (private + public)
 *   vant brain-registry status      # Show the active brain + stack
 *   vant brain-registry register    # Not a runtime concept; see list
 *   vant brain-registry unregister  # Not a runtime concept; see list
 */

const args = process.argv.slice(2);
const action = args[0];

if (args.includes('--help') || args.includes('-h') || !action) {
    console.log(`
Vant Brain Registry - Brain inventory

USAGE:
  vant brain-registry list          # List brains on disk (private + public)
  vant brain-registry status        # Show the active brain + stack

NOTES:
  Brains are resolved from the models/ layout and the stack in
  models/state.json. There is no separate registration step.
`);
    process.exit(0);
}

function main() {
    const brain = require('../lib/brain');

    if (action === 'list' || action === 'ls') {
        const dirs = brain.brainDirs ? brain.brainDirs() : { private: [], public: [] };
        const names = [...new Set([...(dirs.private || []), ...(dirs.public || [])])].sort();
        console.log('Registered Brains:');
        if (!names.length) {
            console.log('  (none found under models/private and models/public)');
            return;
        }
        for (const name of names) {
            const inPrivate = (dirs.private || []).includes(name);
            const inPublic = (dirs.public || []).includes(name);
            const scope = inPrivate && inPublic ? 'private + public' : (inPrivate ? 'private' : 'public');
            const current = brain.getCurrentBrain ? brain.getCurrentBrain() : brain.currentBrain();
            const tag = name === current ? ' (current)' : '';
            console.log(`  ${name}${tag}  [${scope}]`);
        }
        return;
    }

    if (action === 'status') {
        const stack = brain.getStack ? brain.getStack() : [];
        const current = brain.getCurrentBrain ? brain.getCurrentBrain() : brain.currentBrain();
        console.log('Brain Registry Status:');
        console.log('  Current:', current);
        console.log('  Stack:', JSON.stringify(stack));
        return;
    }

    if (action === 'register' || action === 'unregister') {
        console.log(`"${action}" is not a runtime concept: brains are discovered from`);
        console.log('the models/ layout and models/state.json, not a registry.');
        console.log('');
        console.log('  vant brain-registry list      # what is on disk');
        console.log('  vant brain-registry status    # active brain + stack');
        console.log('  vant migrate --brain-name X   # move/import a brain (layout v3+)');
        return;
    }

    console.log('Unknown action:', action);
    console.log('Run: vant brain-registry --help');
}

main();
