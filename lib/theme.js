/**
 * Vant Theme (v0.8.6)
 * WITH EVENT EMISSIONS - theme rendering emits globally
 * Unified theming for CLI, MCP, and runtime surfaces
 * 
 * LAYER: Protected by sandbox/vaf in pipeline
 * - Sanitizes all output
 * - Context-aware themes
 * - Future: dark/light, custom skins
 */

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

// Graceful fallback if chalk not installed
// Chalk uses method chaining: chalk.cyan.bold(s)
let chalk;
try {
    chalk = require('chalk');
} catch (e) {
    // Simple passthrough for chaining
    const noop = s => s;
    const colorObj = {};
    ['green', 'red', 'yellow', 'blue', 'cyan', 'gray', 'dim'].forEach(c => {
        colorObj[c] = { bold: noop, dim: noop, italic: noop, underline: noop, inverse: noop };
    });
    // Also chainable directly
    colorObj.green = noop;
    colorObj.red = noop;
    colorObj.yellow = noop;
    colorObj.blue = noop;
    colorObj.cyan = noop;
    colorObj.gray = noop;
    colorObj.dim = noop;
    colorObj.bold = noop;
    chalk = noop;
    // Mix in the color objects
    Object.keys(colorObj).forEach(k => chalk[k] = colorObj[k]);
    chalk.bold = noop;
}

// MCP Theme Standard - status constants
const STATUS_ICONS = {
    success: '✓',
    error: '✗',
    warning: '⚠',
    loading: '◌',
    info: 'ℹ'
};

const STATUS_COLORS = {
    success: '#22C55E',
    error: '#EF4444',
    warning: '#EAB308',
    loading: '#3B82F6',
    info: '#6B7280'
};

// Sanitize - strip dangerous chars
// Control characters to remove: all ASCII control chars except tab, LF, CR
const CONTROL_CHARS = '[\x00-\x08\x0B\x0C\x0E-\x1F]';

function sanitize(input) {
    if (!input) return '';
    if (typeof input !== 'string') input = String(input);
    return input.replace(new RegExp(CONTROL_CHARS, 'g'), '').substring(0, 10000);
}

// Theme class
class Theme {
    constructor(options = {}) {
        this.mode = options.mode || 'cli';
        this.prefix = options.prefix || '[VANT]';
    }
    
    apply(text, style = 'default') {
        const s = sanitize(text);
        switch(style) {
            case 'success': return chalk.green(s);
            case 'error': return chalk.red(s);
            case 'warning': return chalk.yellow(s);
            case 'info': return chalk.blue(s);
            case 'primary': return chalk.cyan(s);
            case 'dim': return chalk.dim(s);
            case 'bold': return chalk.bold(s);
            default: return s;
        }
    }
    
    status(type, message) {
        const s = sanitize(message);
        switch(type) {
            case 'ok': return chalk.green('✓ ') + s;
            case 'fail': return chalk.red('✗ ') + s;
            case 'warn': return chalk.yellow('⚠ ') + s;
            case 'info': return chalk.blue('ℹ ') + s;
            default: return s;
        }
    }
}

function createTheme(mode) {
    return new Theme({ mode });
}

module.exports = {
    Theme,
    create: createTheme,
    default: new Theme({ mode: 'cli' }),
    
    // Brand
    vant: chalk.cyan.bold('VANT'),
    vantHeader: chalk.cyan.bold('[VANT]'),
    vantError: chalk.cyan.bold('[VANT ERROR]'),
    
    // Status icons
    ok: chalk.green('✓'),
    fail: chalk.red('✗'),
    warn: chalk.yellow('⚠'),
    info: chalk.blue('ℹ'),
    
    // Shorthand
    success: (text) => chalk.green(sanitize(text)),
    error: (text) => chalk.red(sanitize(text)),
    warning: (text) => chalk.yellow(sanitize(text)),
    info: (text) => chalk.blue(sanitize(text)),
    primary: (text) => chalk.cyan(sanitize(text)),
    dim: (text) => chalk.dim(sanitize(text)),
    bold: (text) => chalk.bold(sanitize(text)),
    
    status: {
        ok: (msg) => chalk.green('✓ ') + sanitize(msg),
        fail: (msg) => chalk.red('✗ ') + sanitize(msg),
        warn: (msg) => chalk.yellow('⚠ ') + sanitize(msg),
        info: (msg) => chalk.blue('ℹ ') + sanitize(msg),
    },
    
    // Sections
    section: (text) => chalk.bold.cyan(sanitize(text)),
    subsection: (text) => chalk.cyan(sanitize(text)),
    label: (text) => chalk.dim(sanitize(text)),
    value: (text) => chalk.white(sanitize(text)),
    
    chalk,
    sanitize,
    
    // MCP Theme Standard
    applyToMCP: (result, options = {}) => {
        // Emit theme event
        _emit('theme:apply', { status: options.status, timestamp: Date.now() });
        
        return {
            ...result,
            _theme: {
                status: options.status || 'info',
                icon: options.icon || STATUS_ICONS[options.status] || 'ℹ',
                format: options.format || 'text',
                color: options.color || STATUS_COLORS[options.status]
            }
        };
    },
    
    // MCP helpers
    mcp: {
        success: (result) => module.exports.applyToMCP(result, { status: 'success', icon: '✓', color: '#22C55E' }),
        error: (result, message) => module.exports.applyToMCP({ error: message, ...result }, { status: 'error', icon: '✗', color: '#EF4444' }),
        warn: (result, message) => module.exports.applyToMCP({ warning: message, ...result }, { status: 'warning', icon: '⚠', color: '#EAB308' }),
        loading: (result) => module.exports.applyToMCP(result, { status: 'loading', icon: '◌', color: '#3B82F6' }),
        info: (result) => module.exports.applyToMCP(result, { status: 'info', icon: 'ℹ', color: '#6B7280' }),
    },
    
    // Constants
    STATUS_ICONS,
    STATUS_COLORS,
    
    // Multibrain
    getBrainThemeConfig,
    setBrainThemeConfig,
    getStackThemeConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainThemeConfigs = {};

function getBrainThemeConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainThemeConfigs[brainName] || { mode: 'default' };
}

function setBrainThemeConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainThemeConfigs[brainName] = config;
    return true;
}

function getStackThemeConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };
    
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainThemeConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}

// Self-test
if (require.main === module) {
    const t = module.exports;
    console.log('\n' + t.vantHeader);
    console.log(t.status.ok('theme loaded'));
    const mcp = t.create('mcp');
    console.log(mcp.apply('mcp mode', 'success'));
}
