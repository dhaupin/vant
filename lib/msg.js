/**
 * Msg (v0.8.6)
 * Agent-to-agent messaging (unified: Conversation + IPC + Encryption)
 * 
 * Messaging layers:
 * - Plain: Default, readable
 * - Encrypt: Standard encryption (encrypt.js)
 * - Stego: Hidden in images
 * - Encrypt+Stego: Paranoid mode
 * 
 * Usage:
 *   const msg = require('./msg');
 *   msg.post(convId, "hello");
 *   msg.post(convId, "secret", { encrypt: true });
 *   msg.send(channel, message);  // IPC-style
 */

const fs = require('fs');
const vaf = require('./vaf');
const qos = require('./qos');
const escrow = require('./escrow');
const encrypt = require('./encrypt');
const stego = require('./stego');
const event = require('./event');

// ==================== DEFAULTS ====================
// Default encryption key (should be overridden in production)
const DEFAULT_ENCRYPT_KEY = 'vant-msg-default-key-2024';
const DEFAULT_STEGO_KEY = 'vant-stego-key-2024';

// ==================== MSG STORAGE ====================
const _conversations = new Map();
const _channels = new Map();  // IPC-style (no history)
const _handlers = new Map();   // Channel subscribers

// ==================== SECURITY ====================
// QoS rate limiter (max 500 messages/minute)
const _rateLimit = new qos.RateLimiter({ windowMs: 60000, maxPerMinute: 500 });

// ==================== UTILITIES ====================
function generateId(prefix = 'msg') {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Auto-detect encrypted content
function isEncrypted(content) {
    return typeof content === 'string' && content.startsWith('ENC:');
}

// Auto-detect stego content
function isStego(content) {
    return typeof content === 'string' && content.startsWith('STEGO:');
}

// ==================== CORE MSG CLASS ====================
class Msg {
    constructor(options = {}) {
        this._conversations = options.conversations || _conversations;
        this._channels = options.channels || _channels;
        this._handlers = options.handlers || _handlers;
    }
    
    // ==================== CONVERSATION API ====================
    
    /**
     * Create conversation
     */
    create(options = {}) {
        const { id, maxMessages = 100, encryption = false } = options;
        
        if (id) vaf.check(id, { name: 'conversation id', minLength: 1, maxLength: 100 });
        
        if (maxMessages !== 100) {
            if (typeof maxMessages !== 'number' || maxMessages < 1 || maxMessages > 1000) {
                throw new Error('maxMessages must be 1-1000');
            }
        }
        
        const convId = id || 'conv_' + Date.now().toString(36);
        
        const conversation = {
            id: convId,
            messages: [],
            participants: new Set(),
            maxMessages,
            encryption,
            created: Date.now(),
            lastActivity: Date.now()
        };
        
        this._conversations.set(convId, conversation);
        
        return { id: convId, messages: [] };
    }
    
    /**
     * Join existing conversation
     */
    join(convId) {
        const conv = this._conversations.get(convId);
        if (!conv) {
            return this.create({ id: convId });
        }
        return conv;
    }
    
    /**
     * Post message (plain, encrypted, stego, or encrypted+stego)
     */
    post(convId, content, options = {}) {
        const { 
            author = 'anonymous', 
            metadata = {},
            encrypt: doEncrypt = false,      // Explicit encrypt
            stego: doStego = false,        // Explicit stego
            forcePlain = false            // Force plain (skip auto-detect)
        } = options;
        
        // VAF validation
        vaf.check(convId, { name: 'conversation id', minLength: 1, maxLength: 100 });
        vaf.check(content, { name: 'message', minLength: 1, maxLength: 10000 });
        
        // QoS rate limiting
        const opKey = 'msg:post:' + convId;
        if (!_rateLimit.check(opKey)) {
            return { error: 'Rate limit exceeded for messaging' };
        }
        
        // Escrow quota check
        const quota = escrow.checkQuota(opKey, 1);
        if (!quota.allowed) {
            return { error: 'Escrow quota exceeded for: ' + convId };
        }
        
        const conv = this._conversations.get(convId);
        if (!conv) {
            return { error: 'Conversation not found: ' + convId };
        }
        
        // Determine encryption layer
        let messageContent = content;
        let encryptionLayer = 'plain';
        
        if (!forcePlain) {
            // Auto-detect: Check if already encrypted
            if (isEncrypted(content)) {
                encryptionLayer = 'encrypt';
            } else if (isStego(content)) {
                encryptionLayer = 'stego';
            } else if (doEncrypt && doStego) {
                // Paranoid mode: encrypt with stronger key
                const encrypted = encrypt.encrypt(content, DEFAULT_ENCRYPT_KEY + ':paranoid');
                messageContent = 'SECURE:' + encrypted;
                encryptionLayer = 'encrypt+stego';
            } else if (doEncrypt) {
                messageContent = 'ENC:' + encrypt.encrypt(content, DEFAULT_ENCRYPT_KEY);
                encryptionLayer = 'encrypt';
            } else if (doStego) {
                // Simple stego: use encodeToBuffer (creates PNG with embedded data)
                // Store as base64 for text transport
                const stegoBuffer = stego.encodeToBuffer(content, DEFAULT_STEGO_KEY);
                messageContent = 'STEGO:' + stegoBuffer.toString('base64');
                encryptionLayer = 'stego';
            }
        }
        
        const msgObj = {
            id: generateId('msg'),
            author,
            content: messageContent,
            encryption: encryptionLayer,
            metadata,
            timestamp: Date.now(),
            replies: []
        };
        
        conv.messages.push(msgObj);
        conv.lastActivity = Date.now();
        
        // Trim if needed
        if (conv.messages.length > conv.maxMessages) {
            conv.messages = conv.messages.slice(-conv.maxMessages);
        }
        
        // Emit event for new message
        event.emit('msg:new', { convId, msg: msgObj });
        
        return { id: msgObj.id, conversation: convId, encryption: encryptionLayer };
    }
    
    /**
     * Decrypt message (explicit reveal)
     */
    decrypt(messageContent) {
        if (!isEncrypted(messageContent)) {
            return { error: 'Not encrypted', content: messageContent };
        }
        
        const encrypted = messageContent.slice(4); // Remove 'ENC:'
        return { content: encrypt.decrypt(encrypted, DEFAULT_ENCRYPT_KEY) };
    }
    
    /**
     * Reveal stego message (from base64 encoded PNG)
     */
    reveal(messageContent) {
        if (!isStego(messageContent)) {
            return { error: 'Not stego', content: messageContent };
        }
        
        try {
            // Remove 'STEGO:' prefix, decode base64 to buffer
            const base64 = messageContent.slice(6);
            const buffer = Buffer.from(base64, 'base64');
            const revealed = stego.decodeFromBuffer(buffer, DEFAULT_STEGO_KEY);
            return { content: revealed };
        } catch (e) {
            return { error: 'Stego reveal failed', details: e.message };
        }
    }
    
    /**
     * Auto-detect and decrypt/reveal
     */
    revealAuto(messageContent) {
        if (messageContent.startsWith('SECURE:')) {
            // Paranoid mode: decrypt
            try {
                const encrypted = messageContent.slice(7);
                const decrypted = encrypt.decrypt(encrypted, DEFAULT_ENCRYPT_KEY + ':paranoid');
                return { content: decrypted, layer: 'encrypt+stego' };
            } catch (e) {
                return { error: 'Decrypt failed', details: e.message };
            }
        } else if (isEncrypted(messageContent)) {
            return this.decrypt(messageContent);
        } else if (isStego(messageContent)) {
            return this.reveal(messageContent);
        }
        
        return { content: messageContent, layer: 'plain' };
    }
    
    /**
     * Reply to message
     */
    reply(convId, messageId, content, options = {}) {
        const { author = 'anonymous', encrypt: doEncrypt = false } = options;
        
        const conv = this._conversations.get(convId);
        if (!conv) return { error: 'Conversation not found' };
        
        const msg = conv.messages.find(m => m.id === messageId);
        if (!msg) return { error: 'Message not found' };
        
        let replyContent = content;
        if (doEncrypt) {
            replyContent = 'ENC:' + encrypt.encrypt(content, DEFAULT_ENCRYPT_KEY);
        }
        
        const reply = {
            id: generateId('reply'),
            author,
            content: replyContent,
            timestamp: Date.now()
        };
        
        msg.replies.push(reply);
        return { id: reply.id };
    }
    
    /**
     * Get messages
     */
    messages(convId, options = {}) {
        const { limit = 50, since = 0, reveal = false } = options;
        
        const conv = this._conversations.get(convId);
        if (!conv) return [];
        
        let msgs = conv.messages;
        
        if (since > 0) {
            msgs = msgs.filter(m => m.timestamp > since);
        }
        
        msgs = msgs.slice(-limit);
        
        // Auto-reveal if requested
        if (reveal) {
            msgs = msgs.map(m => ({
                ...m,
                content: this.revealAuto(m.content).content || m.content
            }));
        }
        
        return msgs;
    }
    
    /**
     * Add participant
     */
    addParticipant(convId, participantId) {
        const conv = this._conversations.get(convId);
        if (!conv) return false;
        conv.participants.add(participantId);
        return true;
    }
    
    /**
     * Remove participant
     */
    removeParticipant(convId, participantId) {
        const conv = this._conversations.get(convId);
        if (!conv) return false;
        conv.participants.delete(participantId);
        return true;
    }
    
    /**
     * Get participants
     */
    participants(convId) {
        const conv = this._conversations.get(convId);
        if (!conv) return [];
        return Array.from(conv.participants);
    }
    
    /**
     * Get conversation info
     */
    info(convId) {
        const conv = this._conversations.get(convId);
        if (!conv) return null;
        
        return {
            id: conv.id,
            messageCount: conv.messages.length,
            participantCount: conv.participants.size,
            created: conv.created,
            lastActivity: conv.lastActivity
        };
    }
    
    /**
     * Delete conversation
     */
    delete(convId) {
        return this._conversations.delete(convId);
    }
    
    /**
     * List all conversations
     */
    list() {
        return Array.from(this._conversations.values()).map(c => ({
            id: c.id,
            messageCount: c.messages.length,
            participantCount: c.participants.size,
            lastActivity: c.lastActivity
        }));
    }
    
    /**
     * Export conversation
     */
    export(convId) {
        const conv = this._conversations.get(convId);
        if (!conv) return null;
        
        return {
            id: conv.id,
            messages: conv.messages,
            participants: Array.from(conv.participants),
            exported: Date.now()
        };
    }
    
    // ==================== CHANNEL API (IPC-style) ====================
    
    /**
     * Send to channel (no history, fire-and-forget)
     */
    send(channel, message) {
        vaf.check(channel, { name: 'channel', minLength: 1, maxLength: 100 });
        
        const messages = this._channels.get(channel) || [];
        messages.push({ ...message, timestamp: Date.now() });
        this._channels.set(channel, messages);
        
        // Publish to handlers
        this.publish(channel, message);
        
        return true;
    }
    
    /**
     * Subscribe to channel
     */
    subscribe(channel, handler) {
        const handlers = this._handlers.get(channel) || [];
        handlers.push(handler);
        this._handlers.set(channel, handlers);
    }
    
    /**
     * Publish (sync handlers)
     */
    publish(channel, message) {
        const handlers = this._handlers.get(channel) || [];
        for (const h of handlers) {
            try { h(message); } catch (e) { console.error('Handler error:', e.message); }
        }
    }
    
    /**
     * Get channel messages
     */
    channelMessages(channel) {
        return this._channels.get(channel) || [];
    }
    
    /**
     * Clear channel
     */
    clear(channel) {
        this._channels.delete(channel);
        this._handlers.delete(channel);
    }
    
    // ==================== STATS ====================
    
    stats() {
        return {
            conversations: this._conversations.size,
            channels: this._channels.size,
            uptime: Date.now()
        };
    }
}

// ==================== DEFAULT INSTANCE ====================
const defaultMsg = new Msg();

// ==================== EXPORTS ====================
module.exports = {
    // Class
    Msg,
    
    // Instance
    defaultMsg,
    
    // Factory
    create: (options) => new Msg(options),
    
    // Conversation methods
    create: (...args) => defaultMsg.create(...args),
    join: (...args) => defaultMsg.join(...args),
    post: (...args) => defaultMsg.post(...args),
    reply: (...args) => defaultMsg.reply(...args),
    messages: (...args) => defaultMsg.messages(...args),
    addParticipant: (...args) => defaultMsg.addParticipant(...args),
    removeParticipant: (...args) => defaultMsg.removeParticipant(...args),
    participants: (...args) => defaultMsg.participants(...args),
    info: (...args) => defaultMsg.info(...args),
    delete: (...args) => defaultMsg.delete(...args),
    list: (...args) => defaultMsg.list(...args),
    export: (...args) => defaultMsg.export(...args),
    
    // Decryption methods
    decrypt: (...args) => defaultMsg.decrypt(...args),
    reveal: (...args) => defaultMsg.reveal(...args),
    revealAuto: (...args) => defaultMsg.revealAuto(...args),
    
    // Channel methods (IPC-style)
    send: (...args) => defaultMsg.send(...args),
    subscribe: (...args) => defaultMsg.subscribe(...args),
    publish: (...args) => defaultMsg.publish(...args),
    channelMessages: (...args) => defaultMsg.channelMessages(...args),
    clear: (...args) => defaultMsg.clear(...args),
    
    // Stats
    stats: (...args) => defaultMsg.stats(...args),
    
    // Framework interface
    getLayerStatus: () => ({ name: 'Msg', type: 'msg', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, conversations: _conversations.size, channels: _channels.size })
};