#!/usr/bin/env node
/**
 * Brain Engine CLI
 * 
 * Unified loader CLI for VANT brains
 * 
 * Usage:
 *   node bin/brain-engine.js discover
 *   node bin/brain-engine.js load v0.5.0
 *   node bin/brain-engine.js graph
 *   node bin/brain-engine.js delta v0.5.0 v0.8.0
 *   node bin/brain-engine.js render --needs identity,memories
 *   node bin/brain-engine.js keeper-verify
 *   node bin/brain-engine.js cache-status
 */

const engine = require('../lib/brain-engine');
const args = process.argv.slice(2);

async function main() {
    const command = args[0];
    
    switch (command) {
        case 'discover':
        case 'list':
            console.log('🧠 Brain Engine - Discovered Brains\n');
            const brains = engine.discoverBrains();
            brains.forEach((b, i) => {
                const marker = i === brains.length - 1 ? '👉 ' : '   ';
                console.log(`${marker}${b.name} (${b.format})`);
            });
            console.log(`\nTotal: ${brains.length} brains`);
            break;
            
        case 'load':
            const version = args[1] || 'latest';
            console.log('🧠 Brain Engine - Loading\n');
            const brain = version === 'latest' ? engine.loadLatest() : engine.loadBrain(version);
            console.log(`Loaded: ${brain.version}`);
            console.log(`Format: ${brain.format}`);
            console.log(`Identity: ${brain.identity ? 'yes' : 'no'}`);
            console.log(`Files: ${Object.keys(brain.files).length}`);
            console.log(`Categories: learnings(${Object.keys(brain.categories.learnings).length}), memories(${Object.keys(brain.categories.memories).length})`);
            engine.cacheBrain(brain);
            break;
            
        case 'graph':
            console.log('🧠 Brain Engine - Version Graph\n');
            const graph = engine.getGraph();
            console.log('Nodes:', graph.nodes.map(n => n.name).join(', '));
            if (graph.edges.length > 0) {
                console.log('\nEdges:');
                graph.edges.forEach(e => console.log(`  ${e.from} → ${e.to}`));
            }
            break;
            
        case 'delta':
            const from = args[1];
            const to = args[2];
            if (!from || !to) {
                console.log('Usage: node bin/brain-engine.js delta <from-version> <to-version>');
                process.exit(1);
            }
            console.log('🧠 Brain Engine - Delta\n');
            const delta = engine.computeDelta(from, to);
            console.log(`From: ${delta.from} → To: ${delta.to}`);
            console.log(`Added: ${Object.keys(delta.added).length}`);
            console.log(`Modified: ${Object.keys(delta.modified).length}`);
            console.log(`Removed: ${Object.keys(delta.removed).length}`);
            break;
            
        case 'render':
            const needsArg = args.find(a => a.startsWith('--needs='));
            const needs = needsArg ? needsArg.replace('--needs=', '').split(',') : ['identity'];
            console.log('🧠 Brain Engine - Render\n');
            const rendered = engine.render({ needs });
            console.log(`Needs: ${needs.join(', ')}`);
            console.log(`Sources: ${Object.keys(rendered.sources).join(', ')}`);
            console.log(`Identity: ${rendered.identity ? 'loaded' : 'none'}`);
            console.log(`Learnings: ${Object.keys(rendered.learnings).length}`);
            console.log(`Memories: ${Object.keys(rendered.memories).length}`);
            break;
            
        case 'keeper-verify':
        case 'verify':
            console.log('🧠 Brain Engine - Keeper Verify\n');
            const toVerify = args[1] || 'latest';
            const vBrain = toVerify === 'latest' ? engine.loadLatest() : engine.loadBrain(toVerify);
            engine.keeperVerify(vBrain);
            break;
            
        case 'cache-status':
            console.log('🧠 Brain Engine - Cache Status\n');
            const failures = engine.getFailures();
            console.log('Failures recorded:', Object.keys(failures).length);
            Object.keys(failures).forEach(v => {
                console.log(`  - ${v}: ${failures[v].error}`);
            });
            const cached = engine.getCachedBrain();
            console.log('\nCached brain:', cached ? cached.version : 'none');
            break;
            
        default:
            console.log('🧠 Brain Engine - VANT Unified Loader');
            console.log('');
            console.log('Usage: node bin/brain-engine.js <command> [options]');
            console.log('');
            console.log('Commands:');
            console.log('  discover, list           List all brain versions');
            console.log('  load [version]           Load brain (or latest)');
            console.log('  graph                   Show version relationships');
            console.log('  delta <from> <to>        Compute diff between versions');
            console.log('  render --needs=x,y        Compose brain from needs');
            console.log('  keeper-verify [ver]      Security check brain');
            console.log('  cache-status           Show cache/failures');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});