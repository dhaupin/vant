#!/usr/bin/env node
/**
 * Vant Canvas CLI
 * Visualization tools for brain data
 * 
 * Usage:
 *   vant canvas spiral [count]   # Generate spiral visualization
 *   vant canvas svg [name]       # Export as SVG
 *   vant canvas markdown [name]  # Export as markdown
 */

const canvas = require('../lib/canvas');

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Canvas CLI - Visualization tools

Usage:
  vant canvas spiral [count]    Generate spiral visualization (default: 100)
  vant canvas svg [name]        Export as SVG
  vant canvas markdown [name]   Export as markdown
  vant canvas share [name]      Generate shareable output
`);
    process.exit(0);
}

function run() {
    if (subcmd === 'spiral' || subcmd === 'spiral') {
        const count = parseInt(args[1]) || 100;
        const spiral = canvas.paintSpiral(count);
        console.log(spiral);
    } else if (subcmd === 'svg') {
        const name = args[1] || 'default';
        const svg = canvas.toSVG(name);
        console.log(svg);
    } else if (subcmd === 'markdown' || subcmd === 'md') {
        const name = args[1] || 'default';
        const md = canvas.toMarkdown(name);
        console.log(md);
    } else if (subcmd === 'share') {
        const name = args[1] || 'brain';
        const share = canvas.share(name);
        console.log(share);
    } else {
        console.log('Available: spiral, svg, markdown, share');
        process.exit(1);
    }
}

run();
