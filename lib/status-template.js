/**
 * Vant Status Template (v0.8.6)
 *
 * Shared status interface for Health + Security layers
 * Provides DRY templates for getLayerStatus, getStatus, isOperationAllowed
 *
 * v0.8.6: Breaking refactor - shared status patterns
 */

// Base status template
const STATUS_TEMPLATE = {
    enabled: true,
    name: 'Vant',
    type: 'infra',
    version: require('../package.json').version
};

// Layer status template
const LAYER_TEMPLATE = (name, type, config = {}) => ({
    name,
    type,
    enabled: true,
    config,
    state: _getUptime(),
    timestamp: new Date().toISOString()
});

// Operation allowed template
const OPERATION_TEMPLATE = (allowed = true, layer = 'Vant', reason = null) => ({
    allowed,
    layer,
    reason,
    timestamp: new Date().toISOString()
});

// Health check template
const HEALTH_TEMPLATE = (healthy = true, checks = {}) => ({
    healthy,
    status: healthy ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString()
});

// Security status template
const SECURITY_TEMPLATE = (secure = true, auth = true, threats = []) => ({
    secure,
    authenticated: auth,
    threats,
    timestamp: new Date().toISOString()
});

// Combined status (for /health endpoint)
const COMBINED_STATUS = (health, security) => ({
    status: health.healthy ? 'ok' : 'degraded',
    uptime: _getUptime(),
    health: {
        healthy: health.healthy,
        checks: health.checks
    },
    security: {
        secure: security.secure,
        auth: security.authenticated
    },
    timestamp: new Date().toISOString()
});

// Helper: Get uptime
function _getUptime() {
    return process.uptime ? process.uptime() : 0;
}

// Helper: Create check result
function createCheck(name, result, options = {}) {
    return {
        name,
        status: result === true ? 'pass' : result === false ? 'fail' : 'warn',
        enabled: options.enabled !== false,
        critical: options.critical || false,
        message: options.message || null,
        timestamp: new Date().toISOString()
    };
}

// Helper: Run checks with timeout
async function runChecks(checks, timeout = 5000) {
    const results = {};
    let healthy = true;
    
    for (const [name, check] of Object.entries(checks)) {
        try {
            const result = await Promise.race([
                check.fn(),
                new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), timeout))
            ]);
            results[name] = createCheck(name, result, check.options);
            if (check.options?.critical && result !== true) healthy = false;
        } catch (err) {
            results[name] = createCheck(name, false, { ...check.options, message: err.message });
            if (check.options?.critical) healthy = false;
        }
    }
    
    return HEALTH_TEMPLATE(healthy, results);
}

// Export all templates
module.exports = {
    STATUS_TEMPLATE,
    LAYER_TEMPLATE,
    OPERATION_TEMPLATE,
    HEALTH_TEMPLATE,
    SECURITY_TEMPLATE,
    COMBINED_STATUS,
    createCheck,
    runChecks,
    _getUptime
};
