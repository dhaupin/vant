/**
 * Canvas (v0.8.6)
 * WITH EVENT EMISSIONS - painting/sharing emits globally
 * Creative output engine - renders geometry to shareable art
 * 
 * Bridges: geometry + theme + sync + consensus
 * 
 * Usage:
 *   const canvas = require('./canvas');
 *   await canvas.paint({ shape: 'spiral', theme: 'sunset' });
 *   await canvas.share('my-art', { public: true });
 *   await canvas.vote('use_gold_theme');
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

const geo = require('./geometry');
const sync = require('./sync');
const consensus = require('./consensus');
const registry = require('./node-registry');
const storage = require('./storage');

const fs = require('fs');
const path = require('path');
const brain = require('./brain');
const errors = require('./error');

// Built-in art themes (palette systems)
const PALETTES = {
    ocean: ['#0077B6', '#00B4D8', '#90E0EF', '#CAF0F8', '#03045E'],
    sunset: ['#FF6B6B', '#FFD93D', '#FF8E72', '#FF6F61', '#6B2D5C'],
    forest: ['#2D5A27', '#4A7C59', '#7CB342', '#A5D6A7', '#1B3D17'],
    neon: ['#FF00FF', '#00FFFF', '#FFFF00', '#FF0080', '#8000FF'],
    mono: ['#FFFFFF', '#CCCCCC', '#999999', '#666666', '#333333'],
    gold: ['#FFD700', '#FFC125', '#FFA500', '#DAA520', '#B8860B']
};

function _getPalette(themeName) {
    return PALETTES[themeName] || PALETTES.mono;
}

// Canvas state
let _canvasState = {
    current: null,
    history: [],
    themes: {}
};

// Simple lock for canvas state
let _canvasLock = Promise.resolve();

async function _withLock(fn) {
    let result;
    _canvasLock = _canvasLock.then(async () => {
        result = await fn();
    });
    await _canvasLock;
    return result;
}

/**
 * Get canvas storage paths
 */
function getCanvasPath(isPublic = false) {
    // Public install: /models/public/examples for demo artifacts
    // Private: /models/private/canvas for user creations
    const base = isPublic ? brain.getPublicPath() : brain.getBrainPath();
    return isPublic 
        ? path.join(base, 'boot')  // demos come with vant template
        : path.join(base, 'canvas');   // user creations
}

/**
 * Ensure canvas directory exists
 */
async function ensureCanvas(isPublic = false) {
    const canvasPath = getCanvasPath(isPublic);
    if (!fs.existsSync(canvasPath)) {
        fs.mkdirSync(canvasPath, { recursive: true });
    }
    return canvasPath;
}

/**
 * Generate a spiral of Penrose tiles
 * 
 * @param options: { arms, density, expansion, theme }
 */
async function paintSpiral(options = {}) {
    return _withLock(async () => _paintSpiral(options));
}

async function _paintSpiral(options = {}) {
    const {
        arms = 5,
        density = 0.618,
        expansion = 2.0,
        theme: themeName = 'default'
    } = options;

    // Get theme colors
    const PALETTE = _getPalette(themeName);
    
    const tiles = [];
    const PHI = geo.PHI;
    
    // Generate spiral positions
    for (let arm = 0; arm < arms; arm++) {
        const angleOffset = (arm * Math.PI * 2) / arms;
        let r = 0;
        
        for (let i = 0; i < 30; i++) {
            const angle = i * density * Math.PI * 2 + angleOffset;
            const tile = geo.getTileAt(Math.cos(angle) * r, Math.sin(angle) * r);
            
            if (tile) {
                tile.color = PALETTE[i % PALETTE.length];
                tile.arm = arm;
                tile.index = i;
                tiles.push(tile);
            }
            
            r += expansion / (1 + i * 0.1);
        }
    }

    // Store current state
    _canvasState.current = {
        type: 'spiral',
        options,
        tiles,
        theme: themeName,
        created: Date.now()
    };

    // EVENT: painted
    _emit('canvas:painted', { type: 'spiral', theme: themeName, timestamp: Date.now() });

    return _canvasState.current;
}

/**
 * Generate SVG from current canvas
 */
function toSVG(options = {}) {
    const { width = 800, height = 800, showGrid = false } = options;
    
    if (!_canvasState.current) {
        return '<svg></svg>';
    }

    const center = width / 2;
    const scale = Math.min(width, height) * 0.4;
    const tiles = _canvasState.current.tiles;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`;
    
    // Background
    svg += `<rect width="${width}" height="${height}" fill="#111"/>`;
    
    // Grid if requested
    if (showGrid) {
        for (let i = 0; i < width; i += 50) {
            svg += `<line x1="${i}" y1="0" x2="${i}" y2="${height}" stroke="#333" stroke-width="0.5"/>`;
            svg += `<line x1="0" y1="${i}" x2="${width}" y2="${i}" stroke="#333" stroke-width="0.5"/>`;
        }
    }

    // Draw tiles
    for (const tile of tiles) {
        const x = center + (tile.x || Math.cos(tile.angleShort || 0)) * scale;
        const y = center + (tile.y || Math.sin(tile.angleShort || 0)) * scale;
        
        // Simple circle for each tile
        svg += `<circle cx="${x}" cy="${y}" r="${tile.name === 'thick' ? 12 : 8}" fill="${tile.color || '#fff'}" opacity="0.8"/>`;
    }
    
    svg += '</svg>';
    return svg;
}

/**
 * Save canvas to brain
 * 
 * @param name - identifier
 * @param options - { public, format }
 */
async function save(name, options = {}) {
    return _withLock(async () => _save(name, options));
}

async function _save(name, options = {}) {
    const { public: isPublic = false, format = 'svg' } = options;
    
    if (!_canvasState.current) {
        throw new errors.Error('Nothing painted. Run paintSpiral() first.', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
    }

    const canvasPath = await ensureCanvas(isPublic);
    
    // Generate content
    let content;
    let ext;
    
    if (format === 'svg') {
        content = toSVG();
        ext = '.svg';
    } else if (format === 'md') {
        content = toMarkdown(name);
        ext = '.md';
    } else {
        throw new errors.Error('Unknown format: ' + format, { code: errors.CODES.FORMAT_INVALID, retryable: false });
    }

    // Save file
    const filePath = path.join(canvasPath, name + ext);
    fs.writeFileSync(filePath, content, 'utf8');

    // Also generate NSC9 barcode for this art
    const qc = geo.quasicrystal();
    const barcode = qc.generateBarcodeFromContent('canvas/' + name);
    await geo.store(barcode, {
        name,
        format,
        created: Date.now(),
        options: _canvasState.current.options
    }, getCanvasPath(isPublic));

    return { filePath, format };
}

/**
 * Convert to markdown with embedded image
 */
function toMarkdown(title) {
    const svg = toSVG();
    
    // Inline SVG into markdown
    return `# ${title}

Created: ${new Date().toISOString()}

\`\`\`svg
${svg}
\`\`\`

Themes: ${_canvasState.current.theme}
Tiles: ${_canvasState.current.tiles.length}
`;
}

/**
 * Share artwork to public network
 * 
 * Uses sync module to push to connected peers
 */
async function share(name, options = {}) {
    return _withLock(async () => _share(name, options));
}

async function _share(name, options = {}) {
    const { force = false } = options;
    
    // Save locally first
    await save(name, { public: true });
    
    // Optionally sync
    if (force) {
        try {
            await sync.pushAll();
            return { synced: true };
        } catch (e) {
            return { synced: false, error: e.message };
        }
    }
    
    return { synced: false, reason: 'Use force: true to push' };
}

/**
 * Vote on canvas decision
 * 
 * @param topic - what to decide
 * @param option - choice
 * @param agentId - your agent ID
 */
async function vote(topic, option, agentId) {
    return consensus.vote('canvas_' + topic, option, agentId);
}

/**
 * Get artistic decision from consensus
 */
async function getVote(topic) {
    const result = consensus.tally('canvas_' + topic);
    return result;
}

/**
 * List saved artworks
 */
async function list(options = {}) {
    const { public: isPublic = false } = options;
    
    const canvasPath = getCanvasPath(isPublic);
    if (!fs.existsSync(canvasPath)) {
        return [];
    }
    
    return fs.readdirSync(canvasPath)
        .filter(f => f.endsWith('.svg') || f.endsWith('.md'))
        .map(f => ({
            name: f.replace(/\.(svg|md)$/, ''),
            format: f.endsWith('.svg') ? 'svg' : 'md',
            path: path.join(canvasPath, f)
        }));
}

/**
 * Load artwork by name
 */
async function load(name, options = {}) {
    const { public: isPublic = false } = options;
    
    const canvasPath = getCanvasPath(isPublic);
    const svgPath = path.join(canvasPath, name + '.svg');
    const mdPath = path.join(canvasPath, name + '.md');
    
    if (fs.existsSync(svgPath)) {
        return { format: 'svg', content: fs.readFileSync(svgPath, 'utf8') };
    }
    
    if (fs.existsSync(mdPath)) {
        return { format: 'md', content: fs.readFileSync(mdPath, 'utf8') };
    }
    
    return null;
}

/**
 * Apply filter/effect
 * 
 * @param name - artwork name
 * @param effect - 'blur', 'glow', etc
 */
async function applyEffect(name, effect) {
    const art = await load(name);
    if (!art) throw new errors.Error('Not found: ' + name, { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
    
    // Apply effect to SVG content
    let mod = art.content;
    
    if (effect === 'glow') {
        // Add glow filter
        mod = mod.replace('<svg', `<svg><defs><filter id="glow"><feGaussianBlur stdDeviation="2" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`);
        mod = mod.replace(/fill="/g, 'filter="url(#glow)" fill="');
    }
    
    return mod;
}

/**
 * Embed secret message into SVG as hidden data
 * Uses SVG <desc> tag - visible only to those who look
 * 
 * @param name - artwork name
 * @param secret - message to embed
 * @param password - optional encryption key
 */
async function embed(name, secret, password, options = {}) {
    const { public: isPublic = true } = options;
    const art = await load(name, { public: isPublic });
    if (!art) throw new errors.Error('Art not found: ' + name, { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
    
    const stego = require('./stego');
    
    // Embed using stego's native SVG support
    let svg = stego.encodeSvg(secret, art.content, password);
    
    // Save the embedded art
    const fs = require('fs');
    const canvasPath = getCanvasPath(isPublic);
    const savePath = path.join(canvasPath, name + '.svg');
    console.log('[embed] Saving to:', savePath);
    fs.writeFileSync(savePath, svg, 'utf8');
    
    return { embedded: true, name, path: savePath };
}

/**
 * Reveal secret message from artwork
 * 
 * @param name - artwork name  
 * @param password - decryption key if needed
 */
async function reveal(name, password, options = {}) {
    const { public: isPublic = true } = options;
    const art = await load(name, { public: isPublic });
    if (!art) throw new errors.Error('Art not found: ' + name, { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
    
    const stego = require('./stego');
    
    // Reveal using stego's native SVG support
    return stego.decodeSvg(art.content, password);
}
/**
 * Chain-unwrap secrets from art to art (replication!)
 * Follows bootstrap chain: art → bootstrap → next → …
 * 
 * @param startArt - start artwork name (without ext)
 * @param options - { public, maxDepth }
 */
async function unwrap(startArt, options = {}) {
    const { public: isPublic = true, maxDepth = 10 } = options;
    
    const visited = [];
    let current = startArt;
    const stego = require('./stego');
    
    while (visited.length < maxDepth) {
        const art = await load(current, { public: isPublic });
        if (!art) break;
        
        const revealed = stego.decodeSvg(art.content, { 
            filename: current + '.svg' 
        });
        
        if (!revealed || revealed.error) break;
        
        visited.push({ 
            name: current, 
            message: revealed.message,
            bootstrap: revealed.bootstrap,
            flags: revealed.flags
        });
        
        if (revealed.bootstrap) {
            current = revealed.bootstrap;
        } else {
            break;
        }
    }
    
    return { chain: visited };
}

/**
 * Generate a basic horcrux SVG template
 * Can be used as base for toHorcruxFile()
 */
function generateHorcruxTemplate(options = {}) {
    const { width = 400, height = 400, style = 'minimal' } = options;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`;
    
    if (style === 'minimal') {
        // Simple dark template
        svg += `<rect width="${width}" height="${height}" fill="#1a1a2e"/>`;
        svg += `<circle cx="${width/2}" cy="${height/2}" r="${Math.min(width,height)*0.3}" fill="#16213e" opacity="0.5"/>`;
        svg += `<circle cx="${width/2}" cy="${height/2}" r="${Math.min(width,height)*0.2}" fill="#0f3460" opacity="0.5"/>`;
    } else if (style === 'spiral') {
        // Spiral pattern
        svg += `<rect width="${width}" height="${height}" fill="#0d0d0d"/>`;
        for (let i = 0; i < 50; i++) {
            const angle = i * 0.5;
            const r = i * 3;
            const x = width/2 + r * Math.cos(angle);
            const y = height/2 + r * Math.sin(angle);
            const hue = (i * 7) % 360;
            svg += `<circle cx="${x}" cy="${y}" r="${3 + i*0.1}" fill="hsl(${hue},70%,50%)" opacity="0.6"/>`;
        }
    } else {
        // Default dark with subtle pattern
        svg += `<rect width="${width}" height="${height}" fill="#0a0a0a"/>`;
        svg += `<defs><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#000"/></radialGradient></defs>`;
        svg += `<rect width="${width}" height="${height}" fill="url(#g)"/>`;
    }
    
    svg += '</svg>';
    return svg;
}

module.exports = {
    paintSpiral,
    toSVG,
    save,
    toMarkdown,
    share,
    list,
    load,
    applyEffect,
    vote,
    getVote,
    getCanvasPath,
    // State access
    getState: () => _canvasState.current,
    // Secret messaging (embed in SVG as hidden data)
    embed,
    reveal,
    unwrap,
    // Horcrux template generation
    generateHorcruxTemplate
};