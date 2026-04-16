/**
 * Vant Rate Limiter
 * Respects GitHub API rate limits
 * 
 * Usage:
 *   const rateLimit = require('./rate-limit');
 *   if (rateLimit.canMakeRequest()) {
 *       // make request
 *       rateLimit.recordRequest();
 *   }
 */

const fs = require('fs');
const path = require('path');

const RATE_FILE = 'states/active/rate-limit.json';
const DEFAULT_MAX_PER_HOUR = 360;

/**
 * Get rate limit config
 */
function getConfig() {
    try {
        const config = require('./config');
        return {
            maxPerHour: parseInt(config.runtime?.MAX_REQUESTS_PER_HOUR) || DEFAULT_MAX_PER_HOUR
        };
    } catch (e) {
        return { maxPerHour: DEFAULT_MAX_PER_HOUR };
    }
}

/**
 * Load rate limit state
 */
function loadState() {
    if (!fs.existsSync(RATE_FILE)) {
        return {
            maxPerHour: getConfig().maxPerHour,
            requestsThisHour: 0,
            windowStart: Date.now(),
            requests: []
        };
    }
    
    try {
        const state = JSON.parse(fs.readFileSync(RATE_FILE, 'utf8'));
        
        // Reset if hour passed
        const hourMs = 3600000;
        if (Date.now() - state.windowStart > hourMs) {
            return {
                ...state,
                requestsThisHour: 0,
                windowStart: Date.now(),
                requests: []
            };
        }
        
        return state;
    } catch (e) {
        return {
            maxPerHour: getConfig().maxPerHour,
            requestsThisHour: 0,
            windowStart: Date.now(),
            requests: []
        };
    }
}

/**
 * Save rate limit state
 */
function saveState(state) {
    const dir = path.dirname(RATE_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(RATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Can make a request?
 */
function canMakeRequest() {
    const state = loadState();
    return state.requestsThisHour < state.maxPerHour;
}

/**
 * Record a request
 */
function recordRequest() {
    const state = loadState();
    state.requestsThisHour++;
    state.requests.push(Date.now());
    saveState(state);
    
    const remaining = state.maxPerHour - state.requestsThisHour;
    if (remaining < 50) {
        console.log(`[Rate] Warning: ${remaining} requests remaining this hour`);
    }
}

/**
 * Get status
 */
function getStatus() {
    const state = loadState();
    return {
        remaining: state.maxPerHour - state.requestsThisHour,
        maxPerHour: state.maxPerHour,
        resetIn: Math.ceil((state.windowStart + 3600000 - Date.now()) / 60000)
    };
}

/**
 * Reset (admin)
 */
function reset() {
    if (fs.existsSync(RATE_FILE)) {
        fs.unlinkSync(RATE_FILE);
        console.log('[Rate] Reset');
    }
}

module.exports = {
    canMakeRequest,
    recordRequest,
    getStatus,
    reset,
    DEFAULT_MAX_PER_HOUR
};