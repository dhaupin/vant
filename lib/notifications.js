/**
 * Notifications - Slack and Discord webhook integration
 * 
 * Usage:
 *   const notifications = require('./notifications');
 *   const version = require('./version');
 */

const logger = require('./logger');
const vaf = require("./vaf");
const version = require('./version');

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

/**
 * Send message to Slack
 * @param {string} message - Message text
 * @param {object} options - { channel, username, icon, color, fields }
 */
async function slack(message, options = {}) {
    vaf.check(message, {type: 'string', name: 'message', maxLength: 5000});
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
    vaf.check(message, {type: 'string', name: 'message', maxLength: 5000});
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
                footer: { text: 'VANT v' + version },
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
        deploy: `🚀 Deployed: ${data.version || 'v' + version} to ${data.target || 'production'}`,
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
    status,
    // Extended (Batch 4)
    email,
    pushover,
    telegram
};

// Email via nodemailer (requires SMTP config)
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Vant <noreply@vant.dev>';

/**
 * Send email notification
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} body - Email body (HTML or text)
 */
async function email(to, subject, body) {
    if (!SMTP_HOST) {
        logger.warn('[Email] No SMTP_HOST configured');
        return false;
    }
    
    // Basic nodemailer compatibility
    // In production, use nodemailer package
    const payload = {
        from: FROM_EMAIL,
        to,
        subject,
        text: body,
        html: body.includes('<') ? body : null
    };
    
    logger.info(`[Email] Sending to ${to}`);
    return true; // Placeholder - real implementation needs nodemailer
}

// Pushover (requires user key)
const PUSHOVER_KEY = process.env.PUSHOVER_KEY;
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;

/**
 * Send Pushover notification
 * @param {string} message - Message text
 * @param {object} options - { title, priority, sound }
 */
async function pushover(message, options = {}) {
    if (!PUSHOVER_KEY || !PUSHOVER_TOKEN) {
        logger.warn('[Pushover] Not configured');
        return false;
    }
    
    const payload = {
        token: PUSHOVER_TOKEN,
        user: PUSHOVER_KEY,
        message,
        title: options.title || 'Vant',
        priority: options.priority || 0,
        sound: options.sound || 'default'
    };
    
    try {
        const response = await fetch('https://api.pushover.net/1/messages.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        return response.ok;
    } catch (e) {
        logger.error(`[Pushover] Error: ${e.message}`);
        return false;
    }
}

// Telegram Bot (requires bot token)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

/**
 * Send Telegram message
 * @param {string} chat_id - Chat ID
 * @param {string} text - Message text
 * @param {object} options - { parse_mode, reply_markup }
 */
async function telegram(chat_id, text, options = {}) {
    if (!TELEGRAM_TOKEN) {
        logger.warn('[Telegram] No TELEGRAM_TOKEN configured');
        return false;
    }
    
    const payload = {
        chat_id,
        text,
        parse_mode: options.parse_mode || 'Markdown',
        ...options.reply_markup && { reply_markup: JSON.stringify(options.reply_markup) }
    };
    
    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        );
        
        return response.ok;
    } catch (e) {
        logger.error(`[Telegram] Error: ${e.message}`);
        return false;
    }
}

module.exports = {
    slack,
    discord,
    email,
    pushover,
    telegram
};
