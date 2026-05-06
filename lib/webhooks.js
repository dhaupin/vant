/**
 * Vant Webhook System
 * 
 * Inbound webhook receiver + event triggers for automations
 * Used for GitHub events, custom services, and automation triggers
 */

const http = require('http');
const crypto = require('crypto');
const logger = require('./logger');
const brain = require('./brain');

// Environment
const WEBHOOK_PORT = process.env.VANT_WEBHOOK_PORT || 3456;
const WEBHOOK_SECRET = process.env.VANT_WEBHOOK_SECRET;
const WEBHOOK_URL = process.env.VANT_WEBHOOK_URL;

// Webhook Registry
const webhooks = new Map();

// Event filters (JMESPath patterns)
const filters = new Map();

/**
 * Register webhook source
 * @param {object} config - { name, source, eventKeyExpr, signatureHeader, secret }
 */
function register(config) {
    const { name, source, eventKeyExpr = 'type', signatureHeader = 'X-Signature-256', secret } = config;
    
    const webhook = {
        name,
        source,
        eventKeyExpr,
        signatureHeader,
        secret: secret || WEBHOOK_SECRET,
        enabled: true,
        createdAt: new Date().toISOString()
    };
    
    webhooks.set(name, webhook);
    logger.info(`[Webhook] Registered: ${name} (${source})`);
    
    return {
        id: name,
        webhook_url: `${WEBHOOK_URL}/${source}`,
        source,
        enabled: true
    };
}

/**
 * Verify webhook signature
 */
function verifySignature(payload, signature, secret) {
    if (!signature || !secret) return true;
    
    const expected = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
    
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
    );
}

/**
 * Parse event with JMESPath filter
 */
async function parseEvent(webhook, payload) {
    // Simple JMESPath-like extraction
    const key = webhook.eventKeyExpr;
    const eventType = key.includes('.') 
        ? key.split('.').reduce((obj, k) => obj?.[k], payload)
        : payload[key];
    
    return eventType;
}

/**
 * Add event filter
 */
function addFilter(webhookName, eventPattern, filterExpr) {
    const key = `${webhookName}:${eventPattern}`;
    filters.set(key, filterExpr);
    logger.info(`[Webhook] Filter: ${key} = ${filterExpr}`);
}

/**
 * Match event against filter
 */
function matchFilter(filterExpr, payload) {
    if (!filterExpr) return true;
    
    // Basic JMESPath filter implementation
    try {
        // Simple equality
        if (filterExpr.includes('==')) {
            const [path, value] = filterExpr.split('==').map(s => s.trim());
            const actual = path.split('.').reduce((obj, k) => obj?.[k], payload);
            return actual == value.replace(/^`|`$/g, '');
        }
        
        // glob pattern
        if (filterExpr.includes('glob(')) {
            const match = filterExpr.match(/glob\((\w+),\s*'(\w+\/\*)'\)/);
            if (match) {
                const [path, pattern] = match;
                const actual = path.split('.').reduce((obj, k) => obj?.[k], payload);
                const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                return regex.test(actual);
            }
        }
        
        // contains
        if (filterExpr.includes('contains(')) {
            const match = filterExpr.match(/contains\((\w+)\.\w+,\s*'(\w+)'\)/);
            if (match) {
                const [path, value] = match;
                const actual = path.split('.').reduce((obj, k) => obj?.[k], payload);
                return actual?.includes(value);
            }
        }
        
        // icontains (case-insensitive)
        if (filterExpr.includes('icontains(')) {
            const match = filterExpr.match(/icontains\((\w+),\s*'(\w+)'\)/);
            if (match) {
                const [path, value] = match;
                const actual = path.split('.').reduce((obj, k) => obj?.[k], payload);
                return actual?.toLowerCase().includes(value.toLowerCase());
            }
        }
        
        return true;
    } catch (e) {
        logger.warn(`[Webhook] Filter error: ${e.message}`);
        return false;
    }
}

/**
 * Start webhook server
 */
function startServer(port = WEBHOOK_PORT) {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        const path = url.pathname.slice(1); // remove leading /
        
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Signature-256');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        
        try {
            // Health check
            if (path === 'health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', webhooks: webhooks.size }));
                return;
            }
            
            // Get webhook info
            if (path.startsWith('info')) {
                const source = path.split('/')[1];
                const webhook = webhooks.get(source);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(webhook || { error: 'Not found' }));
                return;
            }
            
            // Webhook event
            if (req.method === 'POST') {
                const chunks = [];
                for await (const chunk of req) {
                    chunks.push(chunk);
                }
                const payload = Buffer.concat(chunks).toString();
                const body = JSON.parse(payload);
                
                // Find webhook by path
                const webhook = webhooks.get(path);
                if (!webhook) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Webhook not found' }));
                    return;
                }
                
                // Verify signature
                const signature = req.headers[webhook.signatureHeader.toLowerCase()];
                if (!verifySignature(payload, signature, webhook.secret)) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid signature' }));
                    return;
                }
                
                // Parse event type
                const eventType = await parseEvent(webhook, body);
                logger.info(`[Webhook] Event: ${eventType}`);
                
                // Get filter
                const filterKey = `${webhook.name}:${eventType}`;
                const filterExpr = filters.get(filterKey);
                
                // Match filter
                if (filterExpr && !matchFilter(filterExpr, body)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ filtered: true }));
                    return;
                }
                
                // Log to brain
                try {
                    const audit = {
                        type: 'webhook',
                        source: webhook.source,
                        event: eventType,
                        timestamp: new Date().toISOString()
                    };
                    await brain.set('audit.md', JSON.stringify(audit, null, 2));
                } catch (e) {
                    logger.warn(`[Webhook] Brain log error: ${e.message}`);
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    received: true, 
                    event: eventType,
                    source: webhook.source 
                }));
                return;
            }
            
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            
        } catch (e) {
            logger.error(`[Webhook] Server error: ${e.message}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
    });
    
    server.listen(port, () => {
        logger.info(`[Webhook] Server listening on port ${port}`);
    });
    
    return server;
}

/**
 * Send outbound webhook
 * @param {string} url - Target URL
 * @param {object} payload - Event payload
 */
async function send(url, payload) {
    logger.info(`[Webhook] Sending to ${url}`);
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        return response.ok;
    } catch (e) {
        logger.error(`[Webhook] Send error: ${e.message}`);
        return false;
    }
}

module.exports = {
    register,
    verifySignature,
    addFilter,
    matchFilter,
    startServer,
    send
};