/**
 * Telegram Bot - Simple bot wrapper for VANT
 * 
 * Usage:
 *   const telegram = require('./telegram');
 *   
 *   // Set bot token via TELEGRAM_BOT_TOKEN env
 *   await telegram.send(chatId, 'Hello!');
 *   
 *   // Bot commands
 *   telegram.onCommand('start', (msg) => handleStart(msg));
 *   telegram.onCommand('status', (msg) => handleStatus(msg));
 * 
 *   // Start polling
 *   telegram.startPolling();
 */

const logger = require("./logger");
const vaf = require('./vaf');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

let offset = 0;
const commandHandlers = {};
const messageHandlers = [];

/**
 * Make API request to Telegram
 */
async function api(method, params = {}) {
    vaf.check(method, {type: 'string', name: 'method', maxLength: 50, pattern: /^[a-zA-Z]+$/});
    if (!BOT_TOKEN) {
        throw new Error('TELEGRAM_BOT_TOKEN not set');
    }
    
    const response = await fetch(`${API_BASE}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    });
    
    const data = await response.json();
    
    if (!data.ok) {
        throw new Error(`Telegram API error: ${data.description}`);
    }
    
    return data.result;
}

/**
 * Send message to chat
 * @param {number|string} chatId - Chat ID
 * @param {string} text - Message text
 * @param {object} options - { parse_mode, reply_markup }
 */
async function send(chatId, text, options = {}) {
    return api('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode || 'Markdown',
        ...(options.reply_markup && { reply_markup: options.reply_markup }),
        ...(options.reply_to && { reply_to_message_id: options.reply_to })
    });
}

/**
 * Send HTML message
 * @param {number|string} chatId - Chat ID
 * @param {string} html - HTML content
 */
async function sendHTML(chatId, html) {
    return send(chatId, html, { parse_mode: 'HTML' });
}

/**
 * Send Markdown message
 * @param {number|string} chatId - Chat ID
 * @param {string} md - Markdown content
 */
async function sendMarkdown(chatId, md) {
    return send(chatId, md, { parse_mode: 'Markdown' });
}

/**
 * Send location
 * @param {number|string} chatId - Chat ID
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 */
async function sendLocation(chatId, lat, lon) {
    return api('sendLocation', { chat_id: chatId, latitude: lat, longitude: lon });
}

/**
 * Send photo
 * @param {number|string} chatId - Chat ID
 * @param {string} photoUrl - Photo URL or file_id
 * @param {string} caption - Optional caption
 */
async function sendPhoto(chatId, photoUrl, caption = '') {
    return api('sendPhoto', {
        chat_id: chatId,
        photo: photoUrl,
        caption
    });
}

/**
 * Answer callback query (inline buttons)
 * @param {string} callbackId - Callback query ID
 * @param {string} text - Optional text
 */
async function answerCallback(callbackId, text = '') {
    return api('answerCallbackQuery', {
        callback_query_id: callbackId,
        text
    });
}

/**
 * Register command handler
 * @param {string} command - Command (without /)
 * @param {function} handler - Handler function
 */
function onCommand(command, handler) {
    commandHandlers[command.toLowerCase()] = handler;
}

/**
 * Register message handler
 * @param {function} handler - Handler function
 */
function onMessage(handler) {
    messageHandlers.push(handler);
}

/**
 * Process incoming update
 */
function processUpdate(update) {
    const msg = update.message || update.callback_query?.message;
    const chat = msg?.chat;
    
    if (!chat) return;
    
    // Handle commands
    if (msg.text && msg.text.startsWith('/')) {
        const parts = msg.text.slice(1).split(' ');
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);
        
        if (commandHandlers[cmd]) {
            commandHandlers[cmd]({ chat: chat.id, from: msg.from, text: msg.text, args });
            return;
        }
    }
    
    // Handle callback queries
    if (update.callback_query) {
        const cb = update.callback_query;
        const data = cb.data;
        
        if (commandHandlers[data]) {
            commandHandlers[data]({ 
                chat: cb.message?.chat.id, 
                from: cb.from, 
                data 
            });
            answerCallback(cb.id);
            return;
        }
    }
    
    // Handle regular messages
    messageHandlers.forEach(h => h({ 
        chat: chat.id, 
        from: msg.from, 
        text: msg.text,
        message: msg
    }));
}

/**
 * Start polling for updates
 * @param {number} timeout - Poll timeout (default 60)
 */
async function startPolling(timeout = 60) {
    if (!BOT_TOKEN) {
        throw new Error('TELEGRAM_BOT_TOKEN not set');
    }
    
    logger.info('[Telegram] Starting polling...');
    
    while (true) { // eslint-disable-next-line no-constant-condition
        try {
            const updates = await api('getUpdates', {
                offset: offset + 1,
                timeout,
                allowed_updates: ['message', 'callback_query']
            });
            
            for (const update of updates) {
                offset = update.update_id;
                processUpdate(update);
            }
        } catch (e) {
            logger.error('[Telegram] Poll error:', e.message);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

/**
 * Stop polling
 */
function stopPolling() {
    // Will stop on next error
    offset = -1;
}

/**
 * Build inline keyboard
 * @param {array} rows - Button rows
 */
function inlineKeyboard(rows) {
    return {
        inline_keyboard: rows.map(row => 
            row.map(btn => ({
                text: btn.text,
                ...(btn.url && { url: btn.url }),
                ...(btn.callback && { callback_data: btn.callback })
            }))
        )
    };
}

/**
 * Build reply keyboard
 * @param {array} rows - Button rows
 */
function replyKeyboard(rows, options = {}) {
    return {
        keyboard: rows.map(row => row.map(btn => ({ text: btn }))),
        resize_keyboard: options.resize ?? true,
        one_time_keyboard: options.oneTime ?? false
    };
}

module.exports = {
    send,
    sendHTML,
    sendMarkdown,
    sendLocation,
    sendPhoto,
    onCommand,
    onMessage,
    startPolling,
    stopPolling,
    inlineKeyboard,
    replyKeyboard,
    api
};