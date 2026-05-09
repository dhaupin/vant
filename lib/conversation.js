/**
 * Conversation (v0.8.6)
 * Shared context between agents
 * 
 * Uses stego carrier for data transport if needed
 */

const fs = require('fs');
const path = require('path');
const vaf = require('./vaf');

// Conversations stored in memory
const _conversations = new Map();

/**
 * Create/join conversation
 */
function create(options = {}) {
    const { id, maxMessages = 100, encryption = false } = options;
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
    
    _conversations.set(convId, conversation);
    
    return { id: convId, messages: [] };
}

/**
 * Join existing conversation
 */
function join(convId) {
    const conv = _conversations.get(convId);
    if (!conv) {
        return create({ id: convId });
    }
    return conv;
}

/**
 * Post message
 */
function post(convId, message, options = {}) {
    const { author = 'anonymous', metadata = {} } = options;
    
    const conv = _conversations.get(convId);
    if (!conv) {
        return { error: 'Conversation not found: ' + convId };
    }
    
    const msg = {
        id: 'msg_' + Date.now().toString(36),
        author,
        content: message,
        metadata,
        timestamp: Date.now(),
        replies: []
    };
    
    conv.messages.push(msg);
    conv.lastActivity = Date.now();
    
    // Trim if needed
    if (conv.messages.length > conv.maxMessages) {
        conv.messages = conv.messages.slice(-conv.maxMessages);
    }
    
    return { id: msg.id, conversation: convId };
}

/**
 * Reply to message
 */
function reply(convId, messageId, content, options = {}) {
    const { author = 'anonymous' } = options;
    
    const conv = _conversations.get(convId);
    if (!conv) return { error: 'Conversation not found' };
    
    const msg = conv.messages.find(m => m.id === messageId);
    if (!msg) return { error: 'Message not found' };
    
    const reply = {
        id: 'reply_' + Date.now().toString(36),
        author,
        content,
        timestamp: Date.now()
    };
    
    msg.replies.push(reply);
    return { id: reply.id };
}

/**
 * Get messages
 */
function messages(convId, options = {}) {
    const { limit = 50, since = 0 } = options;
    
    const conv = _conversations.get(convId);
    if (!conv) return [];
    
    let msgs = conv.messages;
    
    if (since > 0) {
        msgs = msgs.filter(m => m.timestamp > since);
    }
    
    return msgs.slice(-limit);
}

/**
 * Add participant
 */
function addParticipant(convId, participantId) {
    const conv = _conversations.get(convId);
    if (!conv) return false;
    conv.participants.add(participantId);
    return true;
}

/**
 * Remove participant
 */
function removeParticipant(convId, participantId) {
    const conv = _conversations.get(convId);
    if (!conv) return false;
    conv.participants.delete(participantId);
    return true;
}

/**
 * Get participants
 */
function participants(convId) {
    const conv = _conversations.get(convId);
    if (!conv) return [];
    return Array.from(conv.participants);
}

/**
 * Get conversation info
 */
function info(convId) {
    const conv = _conversations.get(convId);
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
function delete_(convId) {
    return _conversations.delete(convId);
}

/**
 * List all conversations
 */
function list() {
    return Array.from(_conversations.values()).map(c => ({
        id: c.id,
        messageCount: c.messages.length,
        participantCount: c.participants.size,
        lastActivity: c.lastActivity
    }));
}

/**
 * Export conversation (for stego)
 */
function export_(convId) {
    const conv = _conversations.get(convId);
    if (!conv) return null;
    
    return {
        id: conv.id,
        messages: conv.messages,
        participants: Array.from(conv.participants),
        exported: Date.now()
    };
}

module.exports = {
    create,
    join,
    post,
    reply,
    messages,
    addParticipant,
    removeParticipant,
    participants,
    info,
    delete: delete_,
    list,
    export: export_,
    
    getLayerStatus: () => ({ name: 'Conversation', type: 'conversation', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, conversations: _conversations.size })
};
