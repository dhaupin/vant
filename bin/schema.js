#!/usr/bin/env node
/**
 * Vant Schema CLI
 * Schema validation
 * 
 * Usage:
 *   vant schema validate <file>     # Validate JSON/YAML
 *   vant schema check <schema> <data> # Check against schema
 *   vant schema generate <type>    # Generate schema
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Schema CLI - Schema validation

Usage:
  vant schema validate <file>      Validate JSON/YAML file
  vant schema check <schema> <data>  Check data against schema
  vant schema generate <type>     Generate schema (json|yaml)
  vant schema lint <file>          Lint schema file
`);
    process.exit(0);
}

function run() {
    const schema = require('../lib/schema');
    
    if (subcmd === 'validate' || subcmd === 'valid') {
        const file = args[1];
        if (!file) {
            console.error('Usage: vant schema validate <file>');
            process.exit(1);
        }
        console.log('Validating:', file);
    } else if (subcmd === 'check' || subcmd === 'test') {
        const schemaData = args[1];
        const data = args.slice(2).join(' ');
        if (!schemaData || !data) {
            console.error('Usage: vant schema check <schema> <data>');
            process.exit(1);
        }
        console.log('Checking against schema:', schemaData);
    } else if (subcmd === 'generate' || subcmd === 'gen') {
        const type = args[1] || 'json';
        console.log('Generating', type, 'schema...');
    } else if (subcmd === 'lint') {
        const file = args[1];
        if (!file) {
            console.error('Usage: vant schema lint <file>');
            process.exit(1);
        }
        console.log('Linting:', file);
    } else {
        console.log('Usage: vant schema <command>');
        process.exit(1);
    }
}

run();
