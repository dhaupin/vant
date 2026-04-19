/**
 * Notifications - Slack and Discord webhook integration
 * 
 * Usage:
 *   const notifications = require('./notifications');
 *   
 *   // Slack
 *   await notifications.slack('Deploy completed', { channel: '#deploys' });
 *   
 *   // Discord
 *   await notifications.discord('New version released', { embed: true });
 *   
 *   // Both
 *   await notifications.broadcast('Build passed', { slack: '#ci', discord: 'hooks' });
 */

const logger = require('./logger');

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

/**
 * Send message to Slack
 * @param {string} message - Message text
 * @param {object} options - { channel, username, icon, color, fields }
 */
async function slack(message, options = {}) {
    if (!SLACK_WEBHOOK) {
        logger.warn('[Slack] No SLACK_WEBHOOK_URL set');
        return false;
    }
    
    const payload = {
        text: message,
        username: options.username || 'VANT Bot',
        icon_emoji: options.icon || ':robot:',
        ...(options.channel && { channel: options.channel }),
        ...(options.attachments && { attachments: options.attachments })
    };
    
    try {
        const response = await fetch(SLACK_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            logger.info(`[Slack] Sent: ${message.slice(0, 50)}...`);
            return true;
        } else {
            logger.error(`[Slack] Failed: ${response.status}`);
            return false;
        }
    } catch (e) {
        logger.error(`[Slack] Error: ${e.message}`);
        return false;
    }
}

/**
 * Send message to Discord
 * @param {string} message - Message text
 * @param {object} options - { username, avatar, embed, color }
 */
async function discord(message, options = {}) {
    if (!DISCORD_WEBHOOK) {
        logger.warn('[Discord] No DISCORD_WEBHOOK_URL set');
        return false;
    }
    
    const payload = {
        content: message,
        username: options.username || 'VANT',
        avatar_url: options.avatar,
        ...(options.embed && {
            embeds: [{
                title: message,
                description: options.description,
                color: options.color || 0x00ff88, // VANT green
                fields: options.fields,
                footer: { text: 'VANT v0.8.2' },
                timestamp: new Date().toISOString()
            }]
        })
    };
    
    try {
        const response = await fetch(DISCORD_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            logger.info(`[Discord] Sent: ${message.slice(0, 50)}...`);
            return true;
        } else {
            logger.error(`[Discord] Failed: ${response.status}`);
            return false;
        }
    } catch (e) {
        logger.error(`[Discord] Error: ${e.message}`);
        return false;
    }
}

/**
 * Broadcast to multiple channels
 * @param {string} message - Message to send
 * @param {object} targets - { slack: 'channel', discord: 'webhook' }
 */
async function broadcast(message, targets = {}) {
    const results = [];
    
    if (targets.slack) {
        results.push(await slack(message, { channel: targets.slack }));
    }
    
    if (targets.discord) {
        results.push(await discord(message, { embed: true }));
    }
    
    return results.some(r => r);
}

/**
 * Send VANT event notification
 * @param {string} event - Event type: sync, deploy, error, health
 * @param {object} data - Event data
 */
async function event(event, data = {}) {
    const messages = {
        sync: `🔄 Brain sync: ${data.branch || 'main'} (${data.files || 0} files)`,
        deploy: `🚀 Deployed: ${data.version || 'v0.8.2'} to ${data.target || 'production'}`,
        error: `❌ Error: ${data.message || 'Unknown'}`,
        health: `💚 Health check: ${data.status || 'ok'}`,
        test: `✅ Tests: ${data.passed || 0} passed, ${data.failed || 0} failed`,
        lock: `🔒 Lock: ${data.action || 'acquired'} ${data.resource || 'resource'}`
    };
    
    const message = messages[event] || `Event: ${event}`;
    
    // Attach fields for embed
    const embedData = {
        embed: true,
        fields: Object.entries(data).map(([k, v]) => ({
            name: k,
            value: String(v),
            inline: true
        }))
    };
    
    return broadcast(message, {
        slack: data.channel,
        discord: true,
        ...embedData
    });
}

/**
 * Send status update with stats
 * @param {string} status - ok, warn, error
 * @param {object} stats - Stats to display
 */
async function status(status, stats = {}) {
    const colors = { ok: ':white_check_mark:', warn: ':warning:', error: ':x:' };
    const icon = colors[status] || ':robot:';
    
    const parts = Object.entries(stats)
        .map(([k, v]) => `**${k}**: ${v}`)
        .join(' | ');
    
    return event(status, { message: `${icon} ${parts}`, ...stats });
}

module.exports = {
    slack,
    discord,
    broadcast,
    event,
    status
};