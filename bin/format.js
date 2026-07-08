#!/usr/bin/env node
/**
 * Vant Format CLI
 * Format detection and conversion
 * 
 * Usage:
 *   vant format detect <string>     # Detect format
 *   vant format parse <string>      # Parse string to object
 *   vant format serialize <obj>    # Serialize object to string
 *   vant format detect-path <file> # Detect format from file path
 */

const format = require('../lib/format');

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Format CLI - Format detection and conversion

Usage:
  vant format detect <string>      Detect format (json, yaml, markdown, text)
  vant format parse <string>       Parse string to object
  vant format serialize <obj>      Serialize object to string
  vant format detect-path <file>  Detect format from file extension
  vant format pipeline <file>    Full pipeline (detect → parse → serialize)
`);
    process.exit(0);
}

function run() {
    if (subcmd === 'detect') {
        const str = args.slice(1).join(' ');
        if (!str) {
            console.error('Usage: vant format detect <string>');
            process.exit(1);
        }
        const detected = format.detect(str);
        console.log('Detected:', detected);
    } else if (subcmd === 'parse') {
        const str = args.slice(1).join(' ');
        if (!str) {
            console.error('Usage: vant format parse <string>');
            process.exit(1);
        }
        const parsed = format.parse(str);
        console.log(JSON.stringify(parsed, null, 2));
    } else if (subcmd === 'serialize') {
        const str = args.slice(1).join(' ');
        let obj;
        try {
            obj = JSON.parse(str);
        } catch (e) {
            console.error('Invalid JSON');
            process.exit(1);
        }
        const serialized = format.serialize(obj);
        console.log(serialized);
    } else if (subcmd === 'detect-path') {
        const file = args[1];
        if (!file) {
            console.error('Usage: vant format detect-path <file>');
            process.exit(1);
        }
        const detected = format.detectFromPath(file);
        console.log('Detected:', detected);
    } else if (subcmd === 'pipeline') {
        const file = args[1];
        if (!file) {
            console.error('Usage: vant format pipeline <file>');
            process.exit(1);
        }
        const fs = require('fs');
        const content = fs.readFileSync(file, 'utf8');
        const result = format.pipeline(content);
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log('Available: detect, parse, serialize, detect-path, pipeline');
        process.exit(1);
    }
}

run();
