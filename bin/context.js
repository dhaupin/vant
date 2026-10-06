#!/usr/bin/env node
/**
 * Context CLI - Prompt caching and context management
 * 
 * Usage:
 *   vant context build              # Build context
 *   vant context inspect           # Inspect context state
 *   vant context refresh           # Force refresh
 *   vant context heartbeat start   # Start heartbeat
 *   vant context heartbeat stop    # Stop heartbeat
 *   vant context layers           # List layers
 *   vant context cache <model>    # Get cache control for model
 */

const context = require('../lib/context');

async function main() {
    const args = process.argv.slice(2);
    const cmd = args[0] || 'inspect';
    
    switch (cmd) {
        case 'build':
            console.log('Building context...');
            const ctx = await context.build({
                includeTools: true,
                includeHistory: true,
                includeDynamic: true
            });
            console.log('✓ Context built for brain:', ctx.brain);
            console.log('  Layers:', Object.keys(ctx.layers).join(', '));
            console.log('  Cache valid:', context.isCacheValid(ctx.brain));
            break;
            
        case 'refresh':
            console.log('Refreshing context...');
            await context.refresh();
            console.log('✓ Context refreshed');
            break;
            
        case 'inspect':
            const inspect = context.inspect();
            console.log('=== Context Inspector ===\n');
            
            if (inspect.current) {
                console.log('Current Context:');
                console.log('  Brain:', inspect.current.brain);
                console.log('  Layers:', inspect.current.layers?.join(', '));
                console.log('  Cache Valid:', inspect.current.cacheValid);
                console.log('  Last Build:', new Date(inspect.current.lastBuild).toISOString());
            } else {
                console.log('No current context');
            }
            
            console.log('\nCache States:');
            for (const state of inspect.cacheStates) {
                console.log(`  ${state.brain}: ${state.hits} hits, ${state.invalidations} invalidations`);
            }
            
            console.log('\nHeartbeat:', inspect.heartbeat.enabled ? 'running' : 'stopped');
            break;
            
        case 'layers':
            const layers = context.getLayers();
            console.log('=== Context Layers ===\n');
            
            for (const [name, layer] of Object.entries(layers)) {
                console.log(`## ${name} (${layer.type})`);
                if (layer.files) {
                    console.log(`  Files: ${layer.files.length}`);
                }
                if (layer.tools) {
                    console.log(`  Tools: ${layer.tools.length}`);
                }
                if (layer.messages) {
                    console.log(`  Messages: ${layer.messages.length}`);
                }
                if (layer.items) {
                    console.log(`  Dynamic Items: ${layer.items.length}`);
                }
                console.log('');
            }
            break;
            
        case 'heartbeat':
            const heartbeatCmd = args[1];
            if (heartbeatCmd === 'start') {
                context.startHeartbeat();
                console.log('✓ Heartbeat started (4 min interval)');
            } else if (heartbeatCmd === 'stop') {
                context.stopHeartbeat();
                console.log('✓ Heartbeat stopped');
            } else {
                const status = context.getHeartbeatStatus();
                console.log('Heartbeat Status:');
                console.log('  Enabled:', status.enabled);
                console.log('  Interval:', status.interval / 1000 / 60, 'min');
                console.log('  Last Ping:', status.lastPing ? new Date(status.lastPing).toISOString() : 'never');
            }
            break;
            
        case 'cache':
            const model = args[1] || 'claude';
            const cacheControl = context.getCacheControl(model);
            console.log(`Cache Control for "${model}":`);
            console.log(JSON.stringify(cacheControl, null, 2));
            break;
            
        default:
            console.log('Context CLI');
            console.log('');
            console.log('Usage: vant context <command>');
            console.log('');
            console.log('Commands:');
            console.log('  build              Build context');
            console.log('  refresh            Force refresh');
            console.log('  inspect            Inspect context state');
            console.log('  layers             List context layers');
            console.log('  heartbeat [start|stop]  Manage heartbeat');
            console.log('  cache <model>      Get cache control for model');
    }
}

main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
