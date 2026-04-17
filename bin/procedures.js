#!/usr/bin/env node
/**
 * Procedures CLI
 * 
 * Gated brain operations:
 *   node bin/procedures.js merge <from> <to>
 *   node bin/procedures.js trim <version> <category> --confirm=DELETE
 *   node bin/procedures.js audit
 */

const { MergeBrains, TrimBrain, auditVersions } = require('../lib/procedures');

const args = process.argv.slice(2);
const command = args[0];

async function main() {
    switch (command) {
        case 'merge':
            const from = args[1];
            const to = args[2];
            if (!from || !to) {
                console.log('Usage: node bin/procedures.js merge <from-version> <to-version>');
                console.log('  Preserves: graphs, deltas, insights, data');
                console.log('');
                console.log('Example: node bin/procedures.js merge v0.5.0 v0.6.0');
                process.exit(1);
            }
            console.log('🧬 Merge Procedure');
            console.log('');
            const result = await MergeBrains(from, to, {
                preserve: ['graphs', 'deltas', 'insights', 'data']
            });
            console.log('');
            console.log('Done:', result.added.files.length + result.added.categories.length, 'items merged');
            break;
            
        case 'trim':
            const version = args[1];
            const scope = args[2];
            const confirm = args.find(a => a.startsWith('--confirm='))?.replace('--confirm=', '') || process.env.VANT_TRIM_CONFIRM;
            
            if (!version || !scope) {
                console.log('Usage: node bin/procedures.js trim <version> <scope> [--confirm=DELETE]');
                console.log('  scope: category, file, pattern');
                console.log('');
                console.log('Examples:');
                console.log('  node bin/procedures.js trim v0.5.0 category --confirm=DELETE --target=learnings');
                console.log('  node bin/procedures.js trim v0.5.0 file --confirm=DELETE --target=learnings/old.md');
                console.log('  node bin/procedures.js trim v0.5.0 pattern --confirm=DELETE --pattern="^legacy"');
                process.exit(1);
            }
            
            // Parse target from --target= or last arg
            const target = args.find(a => a.startsWith('--target='))?.replace('--target=', '') 
                || args[3];
            const pattern = args.find(a => a.startsWith('--pattern='))?.replace('--pattern=', '');
            
            console.log('✂️ Trim Procedure');
            console.log('');
            const trimResult = await TrimBrain(version, scope, { 
                target, 
                pattern,
                confirm 
            });
            console.log('');
            console.log('Done:', trimResult.deleted.length, 'items trimmed');
            break;
            
        case 'audit':
            console.log('📋 Version Audit');
            console.log('');
            const report = auditVersions();
            console.log('Total brains:', report.totalBrains);
            console.log('');
            report.brains.forEach(b => {
                const cats = b.categories.join(', ') || 'none';
                console.log(`  ${b.name.padEnd(10)} ${cats} (${b.files.length} files)`);
            });
            console.log('');
            if (report.issues.length > 0) {
                console.log('⚠️  Issues:');
                report.issues.forEach(i => console.log('   -', i));
            } else {
                console.log('✅ No version gaps detected');
            }
            break;
            
        default:
            console.log('🧬 Procedures - VANT Brain Operations');
            console.log('');
            console.log('Usage: node bin/procedures.js <command> [options]');
            console.log('');
            console.log('Commands:');
            console.log('  merge <from> <to>       Combine brains (gated)');
            console.log('  trim <ver> <scope>    Delete parts (gated)');
            console.log('  audit                 Version audit');
            console.log('');
            console.log('Gated operations require GITHUB_TOKEN or VANT_GATE_TOKEN');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});