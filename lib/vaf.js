/**
 * Vant Application Firewall (VAF)
 * 
 * Security layer for protecting Vant from malicious/malformed inputs:
 * - Input validation and sanitization
 * - Path traversal protection
 * - Injection prevention
 * - Rate limiting per agent/IP
 * - Content filtering
 * - Audit logging
 * 
 * Usage:
 *   const vaf = require('./lib/vaf');
 *   vaf.check(input);           // throws on bad input
 *   vaf.sanitize(input);       // returns safe version
 *   vaf.isBlocked(ip);         // check rate limits
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Lazy-load sandbox
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

function _checkRead() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canRead) {
        try {
            if (!sandbox.canRead()) {
                throw new Error('Read permission required');
            }
        } catch (e) {}
    }
}

function _checkWrite() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canWrite) {
        try {
            if (!sandbox.canWrite()) {
                throw new Error('Write permission required');
            }
        } catch (e) {}
    }
}

// Try to load config for security settings (lazy-loaded)
let _configModule = null;
function _getConfig() {
    if (!_configModule) {
        try {
            _configModule = require('./config');
        } catch (e) {
            // Config not available, use defaults
        }
    }
    return _configModule;
}

/**
 * CONFIGURATION
 * Can be overridden via config.ini or environment variables
 */
const CONFIG = {
    // Rate limiting (from config or defaults)
    MAX_REQUESTS_PER_MINUTE: _getConfig() ? parseInt(_getConfig().get('MAX_REQUESTS_PER_MINUTE') || '60') : 60,
    MAX_REQUESTS_PER_HOUR: _getConfig() ? parseInt(_getConfig().get('MAX_REQUESTS_PER_HOUR') || '1000') : 1000,
    MAX_BURST: _getConfig() ? parseInt(_getConfig().get('MAX_BURST') || '10') : 10,
    
    // Input limits (from config or defaults)
    MAX_STRING_LENGTH: _getConfig() ? parseInt(_getConfig().get('MAX_STRING_LENGTH') || '100000') : 100000,
    MAX_DEPTH: _getConfig() ? parseInt(_getConfig().get('MAX_DEPTH') || '5') : 5,
    MAX_ARRAY_LENGTH: _getConfig() ? parseInt(_getConfig().get('MAX_ARRAY_LENGTH') || '1000') : 1000,
    
    // Path limits (from config or defaults)
    MAX_PATH_LENGTH: _getConfig() ? parseInt(_getConfig().get('MAX_PATH_LENGTH') || '4096') : 4096,
    BLOCK_PATH_TRAVERSAL: _getConfig() ? _getConfig().get('BLOCK_PATH_TRAVERSAL') !== 'false' : true,
    
    // Audit settings (from config or defaults)
    AUDIT_LOG: _getConfig() ? _getConfig().get('AUDIT_LOG') !== 'false' : true,
    AUDIT_FILE: _getConfig() ? _getConfig().get('AUDIT_FILE') || '.audit.log' : '.audit.log',
    
    // Content patterns (detected as malicious)
    DANGEROUS_PATTERNS: [
        // MASSIVE repetition: 10+ repeats of same word - early block before parsing
        // Catches "10,000 vant vant vant..." troll attack
        /\b(\w+)(?:\s+\1){9,}/i,
        
        // Command stacking: specific to commands, NOT normal words like "bye bye"
        // These are high-risk command combinations that make no sense
        // Excludes common words like "go", "make" that are too common
        /\b(vant|node|docker|mcp|npm|yarn|pip|python|nodejs|bash|sh|perl|ruby|java|rust|cargo|cmake|gradle|maven|ant|helm|kubectl|git|gh|curl|wget|ssh|scp|rsync|tar|gzip|gunzip|zip|unzip)\s+\1\b/i,
        
        // PHP code blocks (not words like "bye bye")
        /<\?php/i,
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /<iframe/i,
        /eval\s*\(/i,
        /exec\s*\(/i,
        /system\s*\(/i,
        /shell_exec/i,
        /passthru/i,
        /proc_open/i,
        /popen\s*\(/i,
        /\brm\s+-rf\b/,
        /\bdd\s+if\b.*\bof\b/,
        /chmod\s+777/,
        /chown\s+/,
        /:\s*;\s*rm/,
        /\|\s*bash/,
        /\|\s*sh/,
        /\$\(.*\)/,
        /`.*`/,
        /\$\{.*\}/,
        
        // Shell metacharacters - command chaining/redirection
        /&&\s*\w+/,
        /\|\|\s*\w+/,
        /;\s*\w+/,
        /&\s*\w+/,
        /\|/,
        />\s*\//,
        /<\s*\//,
        />>\s*\//,
        
        // XML external entity attacks
        /<!ENTITY/,
        /<!ELEMENT/,
        /DTD\s+\"/,

        // SQL injection patterns
        /'\s+OR\s+'/i,
        /'\s+AND\s+'/i,
        /\bUNION\s+SELECT\b/i,
        /\bDROP\s+TABLE\b/i,
        /\bINSERT\s+INTO\b/i,
        /\bDELETE\s+FROM\b/i,
        /\bUPDATE\s+.*\s+SET\b/i,
        /\bEXEC\s*\(/i,
        /\bEXECUTE\s*\(/i,
        /\'\s*--/,
        /\/\*.*\*\//,
    ],
    
    // Audit-only patterns - these block in logs but NOT in user content
    // (newlines are valid in learnings/memories but break audit trail)
    AUDIT_PATTERNS: [
        /\n/,
        /\r\n/,
        /\r/
    ],
    
    // File extensions to block
    BLOCKED_EXTENSIONS: [
        // Executables / Native code
        '.exe', '.bat', '.cmd', '.sh', '.bash', '.ps1',
        '.dll', '.so', '.dylib',
        '.jar', '.class',
        '.msi', '.deb', '.rpm',
        // PHP variants (RCE - execute on server)
        '.php', '.php3', '.php4', '.php5', '.php7', '.phtml', '.phar',
        // ASP/JSP (RCE - server-side execution)
        '.asp', '.aspx', '.jsp', '.jspx', '.do', '.action',
        // CGI/Shell scripts (RCE)
        '.cgi', '.pl', '.py', '.rb', '.perl'
    ],
    
    // Required headers for API calls
    REQUIRE_API_KEY: false,
    
    // Audit settings
    AUDIT_LOG: true,
    AUDIT_FILE: '.audit.log'
};

/**
 * STATE
 */
const MAX_LOG_ENTRIES = 10000;  // Limit request log to prevent memory bloat
const BLOCKED_FILE = '.circuit-vaf.json';

// Load blocked IPs from file on startup
let requestLog = [];  // { timestamp, ip, agent, endpoint }
let blockedIPs = _loadBlockedIPs();  // ip -> {until, reason}
let failedAttempts = new Map();  // ip -> count

// Load blocked IPs from file (survives restarts)
function _loadBlockedIPs() {
    if (fs.existsSync(BLOCKED_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(BLOCKED_FILE, 'utf8'));
            // Filter expired entries
            const now = Date.now();
            const valid = new Map();
            for (const [ip, entry] of Object.entries(data)) {
                if (entry.until > now) {
                    valid.set(ip, entry);
                }
            }
            audit.info(`[VAF] Loaded ${valid.size} blocked IPs from ${BLOCKED_FILE}`);
            return valid;
        } catch (e) {
            audit.info(`[VAF] Could not load blocked IPs: ${e.message}`);
        }
    }
    return new Map();
}

// Save blocked IPs to file (persists across restarts)
function _saveBlockedIPs() {
    try {
        const data = Object.fromEntries(blockedIPs);
        fs.writeFileSync(BLOCKED_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        audit.info(`[VAF] Could not save blocked IPs: ${e.message}`);
    }
}

/**
 * UTILITIES
 */
function getTimestamp() {
    return new Date().toISOString();
}

function getClientIP(req) {
    return req && req.headers ? 
        req.headers['x-forwarded-for'] || 
        req.headers['x-real-ip'] || 
        req.connection?.remoteAddress || 
        'unknown' : 
        'unknown';
}

function hashIP(ip) {
    // Use crypto directly instead of missing Encrypt.sha256
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 8);
}

/**
 * AUDIT LOGGING
 */
function audit(action, details) {
    if (!CONFIG.AUDIT_LOG) return;
    _checkWrite();
    
    const entry = {
        timestamp: getTimestamp(),
        action,
        ...details
    };
    
    try {
        const logPath = path.join(__dirname, '..', CONFIG.AUDIT_FILE);
        const line = JSON.stringify(entry) + '\n';
        fs.appendFileSync(logPath, line);
    } catch (e) {
        // Continue silently if audit fails
    }
}

/**
 * INPUT VALIDATION
 */

/**
 * Validate string input
 * @throws Error if invalid
 */
function validateString(value, options = {}) {
    const {
        minLength = 0,
        maxLength = CONFIG.MAX_STRING_LENGTH,
        allowEmpty = false,
        pattern = null,
        name = 'input'
    } = options;
    
    if (value === undefined || value === null) {
        if (allowEmpty) return;
        if (options.tryCatch) return { valid: false, reason: name + ' is required' };
        throw new Error(`${name} is required`);
    }
    
    if (typeof value !== 'string') {
        if (options.tryCatch) return { valid: false, reason: name + ' must be a string' };
        throw new Error(`${name} must be a string`);
    }
    
    const len = value.length;
    if (len < minLength) {
        if (options.tryCatch) return { valid: false, reason: name + ' too short' };
        throw new Error(`${name} too short: min ${minLength}`);
    }
    if (len > maxLength) {
        if (options.tryCatch) return { valid: false, reason: name + ' too long' };
        throw new Error(`${name} too long: max ${maxLength}`);
    }
    
    if (pattern && !pattern.test(value)) {
        if (options.tryCatch) return { valid: false, reason: name + ' format invalid' };
        throw new Error(`${name} format invalid`);
    }
    
    return true;
}

/**
 * Validate object input (with depth limit)
 */
function validateObject(obj, depth = 0) {
    if (depth > CONFIG.MAX_DEPTH) {
        throw new Error(`Object depth too large: max ${CONFIG.MAX_DEPTH}`);
    }
    
    if (typeof obj !== 'object' || obj === null) {
        return;
    }
    
    if (Array.isArray(obj)) {
        if (obj.length > CONFIG.MAX_ARRAY_LENGTH) {
            throw new Error(`Array too large: max ${CONFIG.MAX_ARRAY_LENGTH}`);
        }
        for (const item of obj) {
            validateObject(item, depth + 1);
        }
    } else {
        for (const key of Object.keys(obj)) {
            validateString(key, {maxLength: 200, name: 'object key'});
            validateObject(obj[key], depth + 1);
        }
    }
}

/**
 * PATH PROTECTION
 */

/**
 * Check for path traversal attempts
 * @returns {blocked: boolean, reason: string}
 */
function checkPathTraversal(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') {
        return {blocked: false};
    }
    
    // Check for null bytes first (already handled in checkContent, but defense in depth)
    if (inputPath.includes('\0')) {
        return {blocked: true, reason: 'Null byte injection detected'};
    }
    
    const normalized = path.normalize(inputPath);
    
    // Sensitive system paths (Linux)
    const blockedPrefixes = [
        '/etc/', '/usr/', '/bin/', '/sbin/', '/var/', '/root/',
        '/home/', '/tmp/', '/opt/', '/boot/', '/dev/', '/sys/',
        '/proc/', '/lib/', '/snap/'
    ];
    
    for (const prefix of blockedPrefixes) {
        if (normalized.startsWith(prefix) || normalized.includes(prefix)) {
            return {blocked: true, reason: 'Sensitive system path blocked'};
        }
    }
    
    // Windows paths (drive letters)
    if (normalized.match(/^[a-z]:[/\\]/i) || normalized.match(/^\\\\/)) {
        return {blocked: true, reason: 'Windows absolute path blocked'};
    }
    
    // Home directory expansion attempts
    if (normalized.includes('~') || normalized.includes('$HOME') || normalized.includes('$USER')) {
        return {blocked: true, reason: 'Home directory expansion blocked'};
    }
    
    // Check for traversal patterns
    if (normalized.includes('..')) {
        return {blocked: true, reason: 'Path traversal detected'};
    }
    
    // Check path length
    if (inputPath.length > CONFIG.MAX_PATH_LENGTH) {
        return {blocked: true, reason: 'Path too long'};
    }
    
    return {blocked: false};
}

/**
 * Validate file path is within allowed directory
 */
function validateSafePath(inputPath, allowedDir) {
    if (!inputPath) return true;
    
    const check = checkPathTraversal(inputPath);
    if (check.blocked) {
        throw new Error(check.reason);
    }
    
    const brain = require('./brain');
    
    // Resolve and verify it's within allowed directory
    try {
        const resolved = path.resolve(inputPath);
        const allowed = path.resolve(allowedDir || brain.getBrainPath());
        
        if (!resolved.startsWith(allowed)) {
            throw new Error('Path outside allowed directory');
        }
    } catch (e) {
        throw new Error('Invalid path');
    }
    
    return true;
}

/**
 * CONTENT FILTERING
 */

/**
 * Check content for dangerous patterns
 * @returns {blocked: boolean, pattern: string}
 */
function checkContent(content) {
    if (!content || typeof content !== 'string') {
        return {blocked: false};
    }
    
    // Decode URL encoding to catch encoded attacks
    let decoded = content;
    try {
        decoded = decodeURIComponent(content);
    } catch(e) {
        // If decode fails, check both encoded and decoded
    }
    
    // Check decoded content first (covers %3Cscript etc)
    for (const pattern of CONFIG.DANGEROUS_PATTERNS) {
        if (pattern.test(decoded)) {
            return {
                blocked: true,
                pattern: pattern.toString(),
                decoded: true
            };
        }
    }
    
    // Also check original (for edge cases)
    for (const pattern of CONFIG.DANGEROUS_PATTERNS) {
        if (pattern.test(content)) {
            return {
                blocked: true,
                pattern: pattern.toString()
            };
        }
    }
    
    // Check for null bytes
    if (content.includes('\0')) {
        return {
            blocked: true,
            pattern: '/\\0/'
        };
    }
    
    return {blocked: false};
}

/**
 * Check for recursive/stacked words pattern
 * @param {string} content - Content to check
 * @param {number} minRepeats - Minimum times word must repeat (default: 2)
 * @returns {blocked: boolean, matches: string[]}
 */
function checkWordStacking(content, minRepeats = 2) {
    if (!content || typeof content !== 'string') {
        return {blocked: false, matches: []};
    }
    
    const matches = [];
    
    // Pattern: word repeated N times (or more)
    const pattern = new RegExp(`\\b(\\w+)(?:\\s+\\1){${minRepeats - 1},}\\b`, 'gi');
    let match;
    while ((match = pattern.exec(content)) !== null) {
        matches.push(match[1]);
    }
    
    return {
        blocked: matches.length > 0,
        matches: [...new Set(matches)] // Unique only
    };
}

/**
 * Check for command-specific stacking (docker docker, vant vant, etc)
 * @param {string} content - Content to check
 * @returns {blocked: boolean, matched: string}
 */
function checkCommandStacking(content) {
    if (!content || typeof content !== 'string') {
        return {blocked: false, matched: null};
    }

    // Check against DANGEROUS_PATTERNS for command injection
    for (const pattern of CONFIG.DANGEROUS_PATTERNS) {
        if (pattern.test(content)) {
            return {
                blocked: true,
                matched: pattern.toString()
            };
        }
    }

    return {blocked: false, matched: null};
}

/**
 * Scan and sanitize content
 * @returns {safe: string, cleaned: boolean}
 */
function sanitizeContent(content) {
    if (!content || typeof content !== 'string') {
        return {safe: content, cleaned: false};
    }
    
    let cleaned = content;
    let wasCleaned = false;
    
    // Remove null bytes
    if (cleaned.includes('\0')) {
        cleaned = cleaned.replace(/\0/g, '');
        wasCleaned = true;
    }
    
    // Trim to max length
    if (cleaned.length > CONFIG.MAX_STRING_LENGTH) {
        cleaned = cleaned.substring(0, CONFIG.MAX_STRING_LENGTH);
        wasCleaned = true;
    }
    
    return {safe: cleaned, cleaned: wasCleaned};
}

/**
 * Check if file extension is blocked
 */
function checkFileExtension(filename) {
    if (!filename) return {blocked: false};
    
    const ext = path.extname(filename).toLowerCase();
    if (CONFIG.BLOCKED_EXTENSIONS.includes(ext)) {
        return {
            blocked: true,
            extension: ext
        };
    }
    
    return {blocked: false};
}

/**
 * RATE LIMITING
 */

/**
 * Check rate limit for IP
 * @returns {allowed: boolean, remaining: number, resetAt: number}
 */
function checkRateLimit(ip, endpoint = 'default') {
    const now = Date.now();
    const key = `${hashIP(ip)}:${endpoint}`;
    
    // Clean old entries (older than 1 hour)
    requestLog = requestLog.filter(r => now - r.timestamp < 3600000);
    
    // Trim if over MAX_LOG_ENTRIES to prevent unbounded growth
    // Keep most recent entries
    if (requestLog.length > MAX_LOG_ENTRIES) {
        requestLog = requestLog.slice(-MAX_LOG_ENTRIES);
    }
    
    // Count requests in last minute
    const lastMinute = requestLog.filter(r => 
        r.ip === ip && now - r.timestamp < 60000
    ).length;
    
    // Count requests in last hour
    const lastHour = requestLog.filter(r => r.ip === ip).length;
    
    // Check limits
    if (lastMinute > CONFIG.MAX_REQUESTS_PER_MINUTE) {
        return {
            allowed: false,
            remaining: 0,
            resetAt: now + 60000,
            reason: 'Rate limit exceeded (per minute)'
        };
    }
    
    if (lastHour > CONFIG.MAX_REQUESTS_PER_HOUR) {
        return {
            allowed: false,
            remaining: 0,
            resetAt: now + 3600000,
            reason: 'Rate limit exceeded (per hour)'
        };
    }
    
    // Log this request
    requestLog.push({timestamp: now, ip, endpoint});
    
    return {
        allowed: true,
        remaining: CONFIG.MAX_REQUESTS_PER_MINUTE - lastMinute,
        resetAt: now + 60000
    };
}

/**
 * Record failed attempt
 */
function recordFailedAttempt(ip, reason) {
    const key = hashIP(ip);
    const count = (failedAttempts.get(key) || 0) + 1;
    failedAttempts.set(key, count);
    
    // Block after too many failures
    if (count > 5) {
        blockedIPs.set(ip, {
            until: Date.now() + 300000,  // 5 min block
            reason: reason || 'Too many failed attempts'
        });
        _saveBlockedIPs();  // Persist to file
    }
    
    audit('FAILED_ATTEMPT', {ip: hashIP(ip), reason});
}

/**
 * Check if IP is blocked
 */
function isBlocked(ip) {
    const block = blockedIPs.get(ip);
    if (!block) return {blocked: false};
    
    if (Date.now() > block.until) {
        blockedIPs.delete(ip);
        _saveBlockedIPs();  // Persist removal
        return {blocked: false};
    }
    
    return {
        blocked: true,
        until: block.until,
        reason: block.reason
    };
}

/**
 * MAIN CHECK FUNCTION
 * Throws on any security issue
 * 
 * @param {string} input - Input to validate
 * @param {object} options - { type, name, required, maxLength, allowContent, category }
 *   - type: 'string', 'object', 'path', 'file' (default: 'string')
 *   - name: Input name for error messages
 *   - required: Required or optional (default: true)
 *   - maxLength: Max string length
 *   - allowContent: Skip content pattern check (default: false)
 *     Set to true for learnings/memories categories that legitimately have newlines
 *   - category: Memory category for audit trail
 */
function check(input, options = {}) {
    const {
        type = 'string',     // string, object, path, file
        name = 'input',
        required = true,
        maxLength = CONFIG.MAX_STRING_LENGTH,
        allowContent = false,  // NEW: Skip content check for memory content
        category = null       // NEW: For audit trail (learnings, memories, etc)
    } = options;
    
    // Handle different input types
    switch (type) {
        case 'string':
            validateString(input, {
                minLength: required ? 1 : 0,
                maxLength,
                name,
                pattern: options.pattern
            });
            
            // Check content - but allow bypass for memory content (learnings, memories, etc)
            // that legitimately have newlines and special chars
            if (!allowContent) {
                const contentCheck = checkContent(input);
                if (contentCheck.blocked) {
                    audit('BLOCKED_CONTENT', {
                        name,
                        category,
                        pattern: contentCheck.pattern,
                        snippet: input.substring(0, 50)
                    });
                    throw new Error(`Content blocked: ${contentCheck.pattern}`);
                }
            }
            break;
            
        case 'object':
            if (required && !input) {
                throw new Error(`${name} is required`);
            }
            if (input) {
                validateObject(input);
            }
            break;
            
        case 'path':
            if (input) {
                const pathCheck = checkPathTraversal(input);
                if (pathCheck.blocked) {
                    audit('BLOCKED_PATH', {path: input, reason: pathCheck.reason});
                    throw new Error(pathCheck.reason);
                }
            }
            break;
            
        case 'file':
            if (input) {
                const extCheck = checkFileExtension(input);
                if (extCheck.blocked) {
                    audit('BLOCKED_FILE', {file: input, ext: extCheck.extension});
                    throw new Error(`File type not allowed: ${extCheck.extension}`);
                }
                
                const pathCheck = checkPathTraversal(input);
                if (pathCheck.blocked) {
                    throw new Error(pathCheck.reason);
                }
            }
            break;
            
        default:
            throw new Error(`Unknown type: ${type}`);
    }
    
    return true;
}

/**
 * SANITIZE FUNCTION
 * Returns safe version of input
 */
function sanitize(input, options = {}) {
    const {type = 'string'} = options;
    
    if (!input) return input;
    
    switch (type) {
        case 'string':
            return sanitizeContent(input).safe;
            
        case 'path':
            return path.basename(input);
            
        default:
            return input;
    }
}

/**
 * MIDDLEWARE FACTORY
 * Returns Express/Koa middleware
 */
function middleware() {
    return (req, res, next) => {
        try {
            const ip = getClientIP(req);
            
            // Check if blocked
            const block = isBlocked(ip);
            if (block.blocked) {
                audit('BLOCKED_IP', {ip: hashIP(ip)});
                return res.status(403).json({
                    error: 'Blocked',
                    until: block.until,
                    reason: block.reason
                });
            }
            
            // Rate limit
            const rate = checkRateLimit(ip, req.path);
            if (!rate.allowed) {
                return res.status(429).json({
                    error: rate.reason,
                    resetAt: rate.resetAt
                });
            }
            
            // Attach to request
            req.vaf = {
                ip: hashIP(ip),
                rate
            };
            
            next();
        } catch (e) {
            res.status(400).json({error: e.message});
        }
    };
}

/**
 * GET STATUS
 */
function getStatus() {
    return {
        config: {
            maxRequestsPerMinute: CONFIG.MAX_REQUESTS_PER_MINUTE,
            maxStringLength: CONFIG.MAX_STRING_LENGTH,
            maxDepth: CONFIG.MAX_DEPTH,
            blockedExtensions: CONFIG.BLOCKED_EXTENSIONS
        },
        state: {
            activeIPs: new Set(requestLog.map(r => r.ip)).size,
            blockedIPs: blockedIPs.size,
            failedAttempts: failedAttempts.size
        }
    };
}

/**
 * RESET
 */
function reset() {
    requestLog = [];
    // Don't clear blockedIPs - that's persistent
}

module.exports = {
    // Validation
    validateString,
    validateObject,
    validateSafePath,
    
    // Path protection
    checkPathTraversal,
    validateSafePath,
    
    // Content filtering
    checkContent,
    sanitizeContent,
    checkFileExtension,
    
    // Word stacking detection
    checkWordStacking,
    checkCommandStacking,
    
    // Rate limiting
    checkRateLimit,
    recordFailedAttempt,
    isBlocked,
    
    // Main functions
    check,
    sanitize,
    
    // Middleware
    middleware,
    
    // Status
    getStatus,
    reset,
    
    // Config
    CONFIG,
    
    // === NEW: Framework Integration (Batch 1) ===
    
    /**
     * Create VAF instance with custom config
     * @param {object} customConfig - Override default config
     * @returns {object} VAF instance
     */
    create(customConfig = {}) {
        // Create instance from class defined below
        return new VAFClass(customConfig);
    },
    
    /**
     * Get config value at runtime
     * @param {string} key - Config key
     * @returns {any} Config value
     */
    getConfig(key) {
        return key ? CONFIG[key] : {...CONFIG};
    },
    
    /**
     * Set config value at runtime
     * @param {string|object} key - Config key or object
     * @param {any} value - Config value
     */
    setConfig(key, value) {
        if (typeof key === 'object') {
            Object.assign(CONFIG, key);
        } else {
            CONFIG[key] = value;
        }
        // Clear config module cache to force reload
        _configModule = null;
    },
    
    /**
     * Reload config from config module
     */
    reloadConfig() {
        _configModule = null;
        // Reload values from config
        CONFIG.MAX_REQUESTS_PER_MINUTE = _getConfig() ? parseInt(_getConfig().get('MAX_REQUESTS_PER_MINUTE') || '60') : 60;
        CONFIG.MAX_REQUESTS_PER_HOUR = _getConfig() ? parseInt(_getConfig().get('MAX_REQUESTS_PER_HOUR') || '1000') : 1000;
        CONFIG.MAX_STRING_LENGTH = _getConfig() ? parseInt(_getConfig().get('MAX_STRING_LENGTH') || '100000') : 100000;
        CONFIG.MAX_DEPTH = _getConfig() ? parseInt(_getConfig().get('MAX_DEPTH') || '5') : 5;
        CONFIG.BLOCK_PATH_TRAVERSAL = _getConfig() ? _getConfig().get('BLOCK_PATH_TRAVERSAL') !== 'false' : true;
    },
    
    /**
     * Check if operation type is allowed (framework integration)
     * @param {string} operationType - 'read' | 'write' | 'execute'
     * @returns {object} {allowed: boolean, reason?: string}
     */
    isOperationAllowed(operationType) {
        // VAF validates inputs - all operation types allowed by default
        // Framework (sandbox) would impose stricter limits
        return {allowed: true, layer: 'VAF'};
    },
    
    /**
     * Get layer status for framework reporting
     * @returns {object} Status object
     */
    getLayerStatus() {
        return {
            name: 'VAF',
            type: 'input_validation',
            enabled: true,
            config: {
                maxRequestsPerMinute: CONFIG.MAX_REQUESTS_PER_MINUTE,
                maxStringLength: CONFIG.MAX_STRING_LENGTH,
                maxDepth: CONFIG.MAX_DEPTH,
                blockPathTraversal: CONFIG.BLOCK_PATH_TRAVERSAL,
                auditLog: CONFIG.AUDIT_LOG
            },
            state: {
                activeIPs: requestLog.length,
                blockedIPs: blockedIPs.size,
                failedAttempts: failedAttempts.size
            }
        };
    }
};

/**
 * VAF Class - Enhanced module pattern
 * For framework integration and runtime config
 */
class VAFClass {
    /**
     * Create VAF instance
     * @param {object} options - Custom configuration
     */
    constructor(options = {}) {
        this.options = {
            // Rate limiting
            maxRequestsPerMinute: options.maxRequestsPerMinute || 60,
            maxRequestsPerHour: options.maxRequestsPerHour || 1000,
            maxBurst: options.maxBurst || 10,
            
            // Input limits
            maxStringLength: options.maxStringLength || 100000,
            maxDepth: options.maxDepth || 5,
            maxArrayLength: options.maxArrayLength || 1000,
            
            // Path limits
            maxPathLength: options.maxPathLength || 4096,
            blockPathTraversal: options.blockPathTraversal !== false,
            
            // Audit
            auditLog: options.auditLog !== false,
            auditFile: options.auditFile || '.audit.log',
            
            // Operation settings
            strictMode: options.strictMode || false,
            allowContentBypass: options.allowContentBypass || false
        };
        
        // Instance state
        this._requestLog = [];
        this._blockedIPs = new Map();
        this._failedAttempts = new Map();
        this._startTime = Date.now();
    }
    
    /**
     * Instance check method
     */
    check(input, options = {}) {
        const mergedOptions = {...this.options, ...options};
        
        validateString(input, {
            minLength: mergedOptions.required !== false ? 1 : 0,
            maxLength: mergedOptions.maxStringLength,
            name: options.name || 'input',
            pattern: options.pattern
        });
        
        if (!options.allowContent && !mergedOptions.allowContentBypass) {
            const contentCheck = checkContent(input);
            if (contentCheck.blocked) {
                throw new Error(`Content blocked: ${contentCheck.pattern}`);
            }
        }
        
        return true;
    }
    
    /**
     * Instance sanitize method
     */
    sanitize(input) {
        return sanitize(input, {type: 'string'});
    }
    
    /**
     * Check rate limit
     */
    checkRateLimit(ip, endpoint) {
        const result = checkRateLimit(ip, endpoint);
        // Track locally too
        this._requestLog.push({ip, endpoint, timestamp: Date.now()});
        return result;
    }
    
    /**
     * Check if IP is blocked
     */
    isBlocked(ip) {
        return isBlocked(ip);
    }
    
    /**
     * Get instance status
     */
    getStatus() {
        return {
            options: this.options,
            uptime: Date.now() - this._startTime,
            requests: this._requestLog.length,
            blockedIPs: this._blockedIPs.size
        };
    }
    
    /**
     * Check if operation allowed
     */
    isOperationAllowed(operationType) {
        return {allowed: true, layer: 'VAF', instance: true};
    }
    
    /**
     * Get layer status
     */
    getLayerStatus() {
        return {
            name: 'VAF',
            type: 'input_validation',
            enabled: true,
            instance: true,
            config: this.options,
            state: {
                requests: this._requestLog.length,
                blockedIPs: this._blockedIPs.size,
                uptime: Date.now() - this._startTime
            }
        };
    }
    
    /**
     * Reset instance state
     */
    reset() {
        this._requestLog = [];
    }
}
// ==================== SANITIZE ====================
class Sanitize {
    constructor(options = {}) {
        this.options = {
            stripHtml: options.stripHtml !== false,
            trim: options.trim !== false,
            ...options
        };
        this._startTime = Date.now();
    }

    stripHtml(str) {
        return str.replace(/<[^>]*>/g, '');
    }

    trim(str) {
        return str.trim();
    }

    escapeSQL(str) {
        return str.replace(/'/g, "''");
    }

    escapeHTML(str) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return str.replace(/[&<>"\']/g, c => map[c]);
    }

    removeControlChars(str) {
        return str.replace(/[\x00-\x1F\x7F]/g, '');
    }

    string(str) {
        let s = str;
        if (this.options.stripHtml) s = this.stripHtml(s);
        if (this.options.trim) s = s.trim();
        s = this.removeControlChars(s);
        return s;
    }

    getLayerStatus() { 
        return { name: 'Sanitize', type: 'validation', enabled: true, config: this.options }; 
    }

    isOperationAllowed(op) {
        return { allowed: true, layer: 'Sanitize' };
    }
}

// ==================== IP FILTER ====================
class IPFilter {
    constructor(options = {}) {
        this.options = { mode: options.mode || 'allow' };
        this._allowed = new Set();
        this._denied = new Set();
        this._startTime = Date.now();
    }

    allow(ip) { this._allowed.add(ip); return this; }
    deny(ip) { this._denied.add(ip); return this; }

    check(ip) {
        if (this._denied.has(ip)) return { allowed: false, reason: 'denied' };
        if (this._allowed.size > 0 && !this._allowed.has(ip)) {
            return { allowed: false, reason: 'not_allowed' };
        }
        return { allowed: true };
    }

    getLayerStatus() {
        return { name: 'IPFilter', type: 'validation', enabled: true, config: this.options };
    }

    isOperationAllowed(op) {
        return { allowed: true, layer: 'IPFilter' };
    }
}

// Add to exports
module.exports.Sanitize = Sanitize;
module.exports.IPFilter = IPFilter;
module.exports.sanitizeString = (s) => new Sanitize().string(s);
module.exports.sanitizeHTML = (s) => new Sanitize().escapeHTML(s);
module.exports.sanitizeSQL = (s) => new Sanitize().escapeSQL(s);

