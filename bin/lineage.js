#!/usr/bin/env node
/**
 * Vant Lineage CLI
 * Trace and audit trail
 * 
 * Usage:
 *   vant lineage trace <id>    # Trace a document/entity
 *   vant lineage history <id>   # Show history
 *   vant lineage graph <id>     # Show dependency graph
 *   vant lineage verify <id>    # Verify integrity
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Lineage CLI - Trace and audit trail

Usage:
  vant lineage trace <id>      Trace document lineage
  vant lineage history <id>    Show change history
  vant lineage graph <id>     Show dependency graph
  vant lineage verify <id>    Verify integrity
  vant lineage parents <id>   Show parent documents
  vant lineage children <id>  Show child documents

Lineage tracks:
  - Document creation/modification
  - Cross-references
  - Dependency chains
  - Audit timestamps
`);
    process.exit(0);
}

async function run() {
    try {
        const lineage = require('../lib/lineage');
        
        // Show help if no subcommand
        if (!subcmd || subcmd === 'help') {
            console.log(`
Vant Lineage CLI - Trace and audit trail

Usage:
  vant lineage trace <id>      Trace document lineage
  vant lineage history <id>    Show change history
  vant lineage graph <id>     Show dependency graph
  vant lineage verify <id>    Verify integrity
  vant lineage parents <id>   Show parent documents
  vant lineage children <id>  Show child documents

Lineage tracks:
  - Document creation/modification
  - Cross-references
  - Dependency chains
  - Audit timestamps
`);
            process.exit(0);
        }
        
        if (subcmd === 'trace') {
            const id = args[1];
            if (!id) {
                console.error('Usage: vant lineage trace <id>');
                process.exit(1);
            }
            const trace = await lineage.trace(id);
            console.log(trace);
        } else if (subcmd === 'history' || subcmd === 'log') {
            const id = args[1];
            if (!id) {
                console.error('Usage: vant lineage history <id>');
                process.exit(1);
            }
            console.log('History for:', id);
        } else if (subcmd === 'graph' || subcmd === 'deps') {
            const id = args[1];
            if (!id) {
                console.error('Usage: vant lineage graph <id>');
                process.exit(1);
            }
            console.log('Graph for:', id);
        } else if (subcmd === 'verify' || subcmd === 'check') {
            const id = args[1];
            if (!id) {
                console.error('Usage: vant lineage verify <id>');
                process.exit(1);
            }
            const valid = await lineage.verify(id);
            console.log('Valid:', valid);
        } else if (subcmd === 'parents' || subcmd === 'parent') {
            const id = args[1];
            if (!id) {
                console.error('Usage: vant lineage parents <id>');
                process.exit(1);
            }
            console.log('Parents of:', id);
        } else if (subcmd === 'children' || subcmd === 'child') {
            const id = args[1];
            if (!id) {
                console.error('Usage: vant lineage children <id>');
                process.exit(1);
            }
            console.log('Children of:', id);
        } else {
            console.log('Usage: vant lineage <command>');
            process.exit(1);
        }
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

run();
