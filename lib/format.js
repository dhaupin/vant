const errors = require('./error');
/**
 * Vant Format Handler (v0.8.6)
 * WITH EVENT EMISSIONS - parse operations emit globally
 * 
 * Universal format detection, parsing, and serialization
 * Supports: .yaml, .yml, .json, .md (frontmatter), .txt
 * 
 * Tier 1 utility - no boot dependency (stateless utilities)
 * Security: uses vaf.sanitize() for input cleaning
 * 
 * Usage:
 *   format.detect(content)     → { format, confidence }
 *   format.parse(content)    → normalized object
 *   format.serialize(obj)     → string
 *   format.pipeline(c)       → chained operations
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

const fs = require('fs');
const path = require('path');

// Lazy-load dependencies
let _vaf = null;
function _getVaf() {
    if (!_vaf) {
        try { _vaf = require('./vaf'); } catch (e) {}
    }
    return _vaf;
}

let _storage = null;
function _getStorage() {
    if (!_storage) {
        try { _storage = require('./storage'); } catch (e) {}
    }
    return _storage;
}

// ==================== CONSTANTS ====================

const SUPPORTED_FORMATS = {
    yaml: { extensions: ['.yaml', '.yml'], mime: ['text/yaml', 'application/x-yaml'] },
    json: { extensions: ['.json'], mime: ['application/json'] },
    md: { extensions: ['.md'], mime: ['text/markdown'] },
    txt: { extensions: ['.txt', '.ini'], mime: ['text/plain'] }
};

const DEFAULT_EXTENSIONS = ['.yaml', '.yml', '.json', '.md', '.txt', '.ini'];

// Format handler registry
const _handlers = {};

// Custom schema validators
const _validators = {};

// ==================== DETECTION ====================

/**
 * Detect format from content, filename, or extension
 * @param {string|object} input - Content, filename, or options object
 * @param {object} opts - { filename, defaultFormat }
 * @returns {object} { format, confidence, source }
 */
function detect(input, opts = {}) {
    const { filename, defaultFormat: defaultFmt } = opts;
    
    let content = null;
    let fmtFromFilename = null;
    let fmtFromContent = null;
    let confidence = 0;
    
    // Source 1: Filename extension
    if (filename) {
        const ext = path.extname(filename).toLowerCase();
        if (SUPPORTED_FORMATS.yaml.extensions.includes(ext)) {
            fmtFromFilename = 'yaml';
            confidence = 0.9;
        } else if (SUPPORTED_FORMATS.json.extensions.includes(ext)) {
            fmtFromFilename = 'json';
            confidence = 0.9;
        } else if (SUPPORTED_FORMATS.md.extensions.includes(ext)) {
            fmtFromFilename = 'md';
            confidence = 0.9;
        } else if (SUPPORTED_FORMATS.txt.extensions.includes(ext)) {
            fmtFromFilename = 'txt';
            confidence = 0.9;
        }
    }
    
    // Source 2: Content analysis
    if (typeof input === 'string') {
        content = input.trim();
        
        // Check for YAML unsafe tags (high confidence negative)
        if (content.includes('!!')) {
            // YAML !! tags present - warn but don't auto-reject
            // vaf should have sanitized earlier, this is detection
        }
        
        // JSON detection
        if ((content.startsWith('{') && content.endsWith('}')) ||
            (content.startsWith('[') && content.endsWith(']'))) {
            try {
                JSON.parse(content);
                fmtFromContent = 'json';
                confidence = Math.max(confidence, 0.85);
            } catch (e) {
                // Invalid JSON, continue
            }
        }
        
        // YAML detection (starts with --- or common patterns)
        if (!fmtFromContent && (
            content.startsWith('---') ||
            content.match(/^[\w-]+:\s*[^\n]/m) // key: value pattern
        )) {
            // Try to parse as YAML
            try {
                const yaml = require('yaml');
                const parsed = yaml.parse(content);
                if (parsed && typeof parsed === 'object') {
                    fmtFromContent = 'yaml';
                    confidence = Math.max(confidence, 0.7);
                }
            } catch (e) {
                // Not valid YAML
            }
        }
        
        // Markdown frontmatter detection
        if (content.startsWith('---') && content.includes('---', 2)) {
            fmtFromContent = 'md';
            confidence = Math.max(confidence, 0.95);
        }
        
        // Plain text: no other format matched
        if (!fmtFromContent && !fmtFromFilename) {
            fmtFromContent = 'txt';
            confidence = 0.5;
        }
    }
    
    // Prioritize: explicit filename > content detection
    const format = fmtFromFilename || fmtFromContent || defaultFmt || 'txt';
    
    // Adjust confidence based on source
    if (fmtFromFilename && fmtFromContent === fmtFromFilename) {
        confidence = 0.98;
    } else if (fmtFromFilename) {
        confidence = 0.9;
    }
    
    return {
        format,
        confidence,
        source: fmtFromFilename ? 'filename' : (fmtFromContent ? 'content' : 'default')
    };
}

/**
 * Detect from file path (checks extension)
 * @param {string} filePath
 * @returns {object}
 */
function detectFromPath(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    // Direct extension mappings for common cases
    const extToFormat = {
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.json': 'json',
        '.md': 'md',
        '.txt': 'txt',
        '.ini': 'txt'
    };
    
    const format = extToFormat[ext] || 'txt';
    const confidence = format === 'txt' ? 0.3 : 0.95;
    
    return { format, confidence, source: 'path', extension: ext };
}

// ==================== PARSING ====================

/**
 * Parse content to normalized object
 * @param {string} content - Raw content
 * @param {object} opts - { format, schema, sanitize, validate }
 * @returns {object} Parsed result
 */
function parse(content, opts = {}) {
    const { format: explicitFormat, schema, sanitize: doSanitize = true, validate: doValidate = true } = opts;
    
    if (!content || typeof content !== 'string') {
        return { error: 'Invalid content', data: null };
    }
    
    let raw = content;
    let format = explicitFormat;
    
    // Auto-detect if format not specified
    if (!format) {
        const detected = detect(content, opts);
        format = detected.format;
    }
    
    // 1. Sanitize (VAF - security layer)
    if (doSanitize) {
        const vaf = _getVaf();
        if (vaf?.sanitize) {
            const result = vaf.sanitize(raw, { type: 'string' });
            raw = result.safe || raw;
        }
    }
    
    // 2. Parse by format
    let data = null;
    let chain = [];
    let parseError = null;
    
    try {
        if (format === 'json') {
            data = JSON.parse(raw);
            chain.push('parse:json');
            
        } else if (format === 'yaml') {
            // Check for unsafe YAML tags BEFORE parse
            if (raw.includes('!!')) {
                const vaf = _getVaf();
                if (vaf?.check) {
                    const check = vaf.check(raw, { type: 'content' });
                    if (check.blocked) {
                        throw new errors.VantError('YAML unsafe tags blocked', { code: errors.CODES.VAF_INPUT_INVALID });
                    }
                }
            }
            
            const yaml = require('yaml');
            data = yaml.parse(raw);
            chain.push('parse:yaml');
            
        } else if (format === 'md') {
            data = parseMarkdownFrontmatter(raw);
            chain.push('parse:md');
            
        } else if (format === 'txt') {
            // Plain text: wrap in minimal structure
            data = { intent: raw.trim() };
            chain.push('parse:txt');
            
        } else {
            // Unknown format - treat as text
            data = { raw: raw };
            chain.push('parse:raw');
        }
        
    } catch (e) {
        parseError = e.message;
        data = { error: e.message };
        chain.push('error:' + e.message);
    }
    
    // 3. Schema validation (if specified)
    let validationError = null;
    if (doValidate && schema && data && !parseError) {
        const validator = _validators[schema];
        if (validator) {
            try {
                validator(data);
                chain.push('validate:' + schema);
            } catch (e) {
                validationError = e.message;
                data.validationError = e.message;
                chain.push('error:validation');
            }
        }
    }
    
    // EVENT: parsed
    _emit('format:parsed', { format, error: !!(parseError || validationError), timestamp: Date.now() });
    
    return {
        data,
        format,
        chain,
        error: parseError || validationError
    };
}

/**
 * Parse markdown with frontmatter extraction
 * @param {string} content
 * @returns {object} { meta?, body, raw }
 */
function parseMarkdownFrontmatter(content) {
    const result = { raw: content };
    
    // Check for frontmatter delimiters
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    
    if (fmMatch) {
        const yaml = require('yaml');
        try {
            result.meta = yaml.parse(fmMatch[1]) || {};
            result.body = content.slice(fmMatch[0].length).trim();
        } catch (e) {
            result.meta = {};
            result.body = content;
        }
    } else {
        // No frontmatter - treat entire content as body
        result.body = content;
    }
    
    return result;
}

// ==================== SERIALIZATION ====================

/**
 * Serialize object to string format
 * @param {object} data - Data to serialize
 * @param {string} format - Target format
 * @param {object} opts - Options
 * @returns {string}
 */
function serialize(data, format, opts = {}) {
    if (!data || typeof data !== 'object') {
        return '';
    }
    
    try {
        if (format === 'json') {
            return JSON.stringify(data, null, opts.indent || 2);
            
        } else if (format === 'yaml') {
            const yaml = require('yaml');
            return yaml.stringify(data, opts);
            
        } else if (format === 'txt') {
            // Plain text: output intent if present
            return data.intent || data.content || data.raw || String(data);
            
        } else {
            // Default to JSON
            return JSON.stringify(data, null, 2);
        }
        
    } catch (e) {
        return '';
    }
}

// ==================== PIPELINE ====================

/**
 * Execute chained format operations
 * @param {string|object} input - Content or parsed data
 * @param {object} opts - { chain, format, schema, ... }
 * @returns {object} Pipeline result
 */
function pipeline(input, opts = {}) {
    const {
        chain = ['detect', 'sanitize', 'parse', 'validate'],
        format: explicitFormat,  // renamed to avoid collision
        schema,
        sanitize = true,
        validate = true
    } = opts;
    
    const steps = [];
    let content = typeof input === 'string' ? input : null;
    let data = typeof input === 'object' ? input : null;
    let currentFormat = explicitFormat;
    let error = null;
    
    for (const step of chain) {
        try {
            if (step === 'detect') {
                const detected = detect(content || data, { defaultFormat: explicitFormat });
                currentFormat = detected.format;
                steps.push('detect:' + detected.format);
                continue;
            }
            
            if (step === 'sanitize') {
                if (content && sanitize) {
                    const vaf = _getVaf();
                    if (vaf?.sanitize) {
                        const result = vaf.sanitize(content, { type: 'string' });
                        content = result.safe || content;
                    }
                }
                steps.push('sanitize:done');
                continue;
            }
            
            if (step === 'parse') {
                const result = parse(content || JSON.stringify(data), {
                    format: currentFormat,
                    sanitize: false,  // already sanitized
                    validate
                });
                data = result.data;
                if (result.error) {
                    error = result.error;
                }
                steps.push('parse:done');
                continue;
            }
            
            if (step === 'validate' && schema) {
                const validator = _validators[schema];
                if (validator && data) {
                    validator(data);
                }
                steps.push('validate:' + schema);
                continue;
            }
            
            if (step === 'serialize' && data) {
                content = serialize(data, currentFormat);
                steps.push('serialize:' + currentFormat);
                continue;
            }
            
            // Pass through unknown steps
            steps.push(step + ':pass');
            
        } catch (e) {
            error = e.message;
            steps.push('error:' + e.message);
            break;
        }
    }
    
    return {
        data,
        content,
        format: currentFormat,
        steps,
        error
    };
}

// ==================== REGISTRATION ====================

/**
 * Register custom format handler
 * @param {string} name - Handler name
 * @param {object} handler - { detect?, parse?, serialize? }
 */
function register(name, handler) {
    _handlers[name] = handler;
}

/**
 * Register schema validator
 * @param {string} schema - Schema name
 * @param {function} validator - Validator function
 */
function registerValidator(schema, validator) {
    _validators[schema] = validator;
}

// Built-in validators

/**
 * Workflow schema validator
 * @param {object} data
 */
function validateWorkflow(data) {
    const required = ['intent'];
    for (const field of required) {
        if (!data[field]) {
            throw new errors.VantError('Required field missing', { code: errors.CODES.VAF_REQUIRED_FIELD });
        }
    }
}

registerValidator('workflow', validateWorkflow);

/**
 * Island schema validator
 * @param {object} data
 */
function validateIsland(data) {
    const required = ['name', 'type'];
    for (const field of required) {
        if (!data[field]) {
            throw new errors.VantError('Required field missing', { code: errors.CODES.VAF_REQUIRED_FIELD });
        }
    }
}

registerValidator('island', validateIsland);

// ==================== FILE OPERATIONS ====================

/**
 * Load and parse file
 * @param {string} filePath - Path to file
 * @param {object} opts - Parse options
 * @returns {object} Parsed result
 */
async function loadFile(filePath, opts = {}) {
    const storage = _getStorage();
    
    let content;
    try {
        if (storage?.read) {
            content = storage.read(filePath);
        } else {
            content = await fs.promises.readFile(filePath, 'utf8');
        }
    } catch (e) {
        return { error: e.message, data: null };
    }
    
    // Auto-detect format from path
    const detected = detectFromPath(filePath);
    opts.format = opts.format || detected.format;
    
    return parse(content, opts);
}

/**
 * Save data to file
 * @param {string} filePath - Path to file
 * @param {object} data - Data to serialize
 * @param {object} opts - { format?, ... }
 * @returns {object} Result
 */
async function saveFile(filePath, data, opts = {}) {
    const detected = detectFromPath(filePath);
    const format = opts.format || detected.format;
    
    const content = serialize(data, format, opts);
    
    const storage = _getStorage();
    try {
        if (storage?.write) {
            storage.write(filePath, content);
        } else {
            await fs.promises.writeFile(filePath, content, 'utf8');
        }
        return { success: true };
    } catch (e) {
        return { error: e.message };
    }
}

// ==================== VALIDATION ====================

/**
 * Validate data against schema
 * @param {object} data - Data to validate
 * @param {string} schema - Schema name
 * @returns {object} Validation result
 */
function validate(data, schema, opts = {}) {
    const validator = _validators[schema];
    if (!validator) {
        return { valid: false, error: `Unknown schema: ${schema}` };
    }
    try {
        validator(data);
        return { valid: true };
    } catch (e) {
        return { valid: false, error: e.message };
    }
}

// ==================== STATUS ====================

function getStatus() {
    return {
        format: true,
        supported: Object.keys(SUPPORTED_FORMATS),
        handlers: Object.keys(_handlers),
        schemas: Object.keys(_validators)
    };
}

function getLayerStatus() {
    return {
        name: 'Format',
        type: 'utility',
        version: '0.8.6',
        enabled: true,
        supportedFormats: Object.keys(SUPPORTED_FORMATS)
    };
}

function isOperationAllowed(operation) {
    // Format operations are generally allowed
    // No additional gating needed at this layer
    return { allowed: true };
}

// ==================== FILE LISTING ====================

/**
 * List files in directory with specific extensions
 * @param {string} dirPath - Directory path
 * @param {string[]} extensions - Array of extensions (e.g., ['.md', '.json'])
 * @param {object} opts - { recursive, excludeDirs }
 * @returns {string[]} Array of file paths
 */
function listFiles(dirPath, extensions = DEFAULT_EXTENSIONS, opts = {}) {
    const { recursive = false, excludeDirs = ['node_modules', '.git', 'boot'] } = opts;
    
    // SECURITY: Validate and resolve the base path
    if (!dirPath || typeof dirPath !== 'string') {
        return [];

    // SECURITY: Use vaf for path validation
    const vaf = _getVaf();
    if (vaf?.checkPathTraversal) {
        const pathCheck = vaf.checkPathTraversal(dirPath);
        if (pathCheck.blocked) {
            return [];
        }
    }
    }
    
    // Resolve to absolute path and validate
    let basePath;
    try {
        basePath = path.resolve(dirPath);
    } catch (e) {
        return [];
    }
    
    if (!fs.existsSync(basePath)) return [];
    
    const results = [];
    
    function walk(dir) {
        try {
            // SECURITY: Verify we're still within basePath (path containment)
            const resolvedDir = path.resolve(dir);
            if (!resolvedDir.startsWith(basePath)) {
                return; // Escaped - stop walking
            }
            
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    // SECURITY: Check for symlinks that could escape
                    if (entry.isSymbolicLink()) {
                        continue; // Skip symlinks to prevent escape
                    }
                    if (excludeDirs.includes(entry.name)) continue;
                    if (recursive) {
                        walk(fullPath);
                    }
                } else if (entry.isFile()) {
                    // SECURITY: Verify result is still within basePath
                    const resolvedPath = path.resolve(fullPath);
                    if (!resolvedPath.startsWith(basePath)) {
                        continue; // Skip files that escaped
                    }
                    const ext = path.extname(entry.name).toLowerCase();
                    if (extensions.includes(ext)) {
                        results.push(fullPath);
                    }
                }
            }
        } catch (e) {
            // Permission error or other - skip
        }
    }
    
    walk(basePath);
    return results;
}

/**
 * Get brain name from file path (strips extension)
 * @param {string} filePath - Full file path
 * @returns {string} Brain name without extension
 */
function getBrainName(filePath) {
    const basename = path.basename(filePath);
    const ext = path.extname(basename);
    return basename.replace(ext, '');
}

// ==================== EXPORTS ====================

module.exports = {
    // Core
    detect,
    detectFromPath,
    parse,
    serialize,
    
    // Pipeline
    pipeline,
    
    // Registration
    register,
    registerValidator,
    validate,
    
    // File operations
    loadFile,
    saveFile,
    listFiles,
    getBrainName,
    
    // Utilities
    SUPPORTED_FORMATS,
    DEFAULT_EXTENSIONS,
    
    // Status
    getStatus,
    getLayerStatus,
    isOperationAllowed,
    
    // Multibrain Stack
    getStackFormats
};

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get format stats from all brains in the stack
 * @returns {Object} Combined format info
 */
function getStackFormats() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        byBrain: {}
    };
    
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const status = getStatus();
            results.byBrain[brainName] = status;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    
    return results;
}