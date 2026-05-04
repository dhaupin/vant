/**
 * Vant Logger
 * Structured logging with levels, formatting, file rotation
 * 
 * Usage:
 *   const logger = require('./logger');
 *   logger.info('System ready');
 *   logger.error('Failed', { code: 'ENOENT' });
 */

const fs = require('fs');
const path = require('path');
const vaf = require('./vaf');

const LOG_DIR = 'logs';
const LOG_FILE = 'vant.log';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 5;

const LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

let config = {
    level: 'info',
    format: 'json', // or 'text'
    output: 'both' // 'console', 'file', 'both'
};

/**
 * Set config
 */
function setLevel(level) {
    if (LEVELS[level] !== undefined) {
        config.level = level;
    }
}

function setFormat(fmt) {
    if (fmt === 'json' || fmt === 'text') {
        config.format = fmt;
    }
}

function setOutput(output) {
    if (['console', 'file', 'both'].includes(output)) {
        config.output = output;
    }
}

/**
 * Ensure log directory
 */
function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

/**
 * Rotate logs if needed
 */
function rotateIfNeeded() {
    const logPath = path.join(LOG_DIR, LOG_FILE);
    
    if (!fs.existsSync(logPath)) return;
    
    const stats = fs.statSync(logPath);
    if (stats.size > MAX_SIZE) {
        // Rotate: vant.log.1, vant.log.2, etc.
        for (let i = MAX_FILES - 1; i >= 1; i--) {
            const oldPath = path.join(LOG_DIR, `${LOG_FILE}.${i}`);
            const newPath = path.join(LOG_DIR, `${LOG_FILE}.${i + 1}`);
            if (fs.existsSync(oldPath)) {
                if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
                fs.renameSync(oldPath, newPath);
            }
        }
        
        const newPath = path.join(LOG_DIR, `${LOG_FILE}.1`);
        if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
        fs.renameSync(logPath, newPath);
    }
}

/**
 * Format log entry
 */
function formatMessage(level, message, data) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...(data && { data })
    };
    
    if (config.format === 'text') {
        const dataStr = data ? ' ' + JSON.stringify(data) : '';
        return `[${entry.timestamp}] ${level.toUpperCase()}: ${message}${dataStr}\n`;
    }
    
    return JSON.stringify(entry) + '\n';
}

/**
 * Write to output
 */
function write(level, message, data) {
    vaf.check(level, {type: 'string', name: 'level', maxLength: 20, pattern: /^(debug|info|warn|error)$/});
    vaf.check(message, {type: 'string', name: 'message', maxLength: 10000});
    if (LEVELS[level] < LEVELS[config.level]) return;
    
    const formatted = formatMessage(level, message, data);
    
    if (config.output === 'console' || config.output === 'both') {
        // Color for console
        const colors = { debug: '\x1b[36m', info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m' };
        const reset = '\x1b[0m';
        console.log(`${colors[level] || ''}${formatted.trim()}${reset}`);
    }
    
    if (config.output === 'file' || config.output === 'both') {
        ensureLogDir();
        rotateIfNeeded();
        
        const logPath = path.join(LOG_DIR, LOG_FILE);
        fs.appendFileSync(logPath, formatted);
    }
}

/**
 * Log functions
 */
function debug(message, data) {
    write('debug', message, data);
}

function info(message, data) {
    write('info', message, data);
}

function warn(message, data) {
    write('warn', message, data);
}

function error(message, data) {
    write('error', message, data);
}

/**
 * Get last N lines
 */
function tail(lines = 10) {
    const logPath = path.join(LOG_DIR, LOG_FILE);
    if (!fs.existsSync(logPath)) return [];
    
    const content = fs.readFileSync(logPath, 'utf8');
    return content.trim().split('\n').slice(-lines);
}

module.exports = {
    debug,
    info,
    warn,
    error,
    setLevel,
    setFormat,
    setOutput,
    tail,
    LEVELS
};