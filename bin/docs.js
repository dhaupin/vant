#!/usr/bin/env node
const vaf = require("../lib/vaf");
/**
 * docs.js - Docs management
 * 
 * Usage:
 *   vant docs build    - Build docs for release
 *   vant docs serve   - Serve docs locally (needs docsify)
 */

const { execSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
// (pass 92) -h/--help documents the subcommands instead of falling into the
// switch as an unknown command and exiting 1.
if (args[0] === '-h' || args[0] === '--help') {
    console.log('Usage: vant docs [build|serve]');
    console.log('');
    console.log('  build   Build docs for release');
    console.log('  serve   Serve docs locally (needs docsify)');
    process.exit(0);
}
const command = args[0] || 'build';

switch (command) {
  case 'build':
    console.log('Building docs...');
    execSync('node bin/docs-build.js', { cwd: path.join(__dirname, '..') });
    console.log('Docs built.');
    break;
    
  case 'serve':
    console.log('Serving docs at http://localhost:3000');
    console.log('(Install docsify globally: npm i -g docsify)');
    execSync('docsify serve docs', { cwd: path.join(__dirname, '..') });
    break;
    
  default:
    console.log('Usage: vant docs [build|serve]');
    process.exit(1);
}
