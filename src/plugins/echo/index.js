/**
 * Echo Plugin
 * 
 * Simple plugin that echoes input with transformations.
 * Demonstrates the VANT plugin architecture.
 * 
 * Config:
 *   - uppercase: convert to uppercase
 *   - reverse: reverse the string
 *   - prefix: add prefix to output
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');

let config = {
    uppercase: false,
    reverse: false,
    prefix: '[echo] '
};

// Load config
try {
    if (fs.existsSync(CONFIG_PATH)) {
        config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    }
} catch (e) {
    console.log('[Echo] Using default config');
}

/**
 * Transform string based on config
 */
function transform(input) {
    let output = input;
    
    if (config.uppercase) output = output.toUpperCase();
    if (config.reverse) output = output.split('').reverse().join('');
    if (config.prefix) output = config.prefix + output;
    
    return output;
}

/**
 * Plugin hook
 */
function hook(ctx) {
    return {
        name: 'echo',
        version: '0.5.0',
        
        onLoad(brain) {
            console.log('[Echo] Loaded - transform config:', config);
        },
        
        onMessage(msg) {
            // Transform any message containing "echo:"
            if (msg.includes('echo:')) {
                const content = msg.replace('echo:', '').trim();
                return transform(content);
            }
            return null; // No transformation
        },
        
        onSave() {
            console.log('[Echo] Save hook triggered');
        },
        
        onUnload() {
            console.log('[Echo] Unloaded');
        }
    };
}

module.exports = hook;