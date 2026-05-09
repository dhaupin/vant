/**
 * IPC (v0.8.6)
 * Inter-agent messaging
 */

const _channels = new Map();
const _handlers = new Map();

/**
 * Send message to channel
 */
function send(channel, message) {
    const messages = _channels.get(channel) || [];
    messages.push({ ...message, timestamp: Date.now() });
    _channels.set(channel, messages);
    return true;
}

/**
 * Subscribe to channel
 */
function subscribe(channel, handler) {
    const handlers = _handlers.get(channel) || [];
    handlers.push(handler);
    _handlers.set(channel, handlers);
}

/**
 * Publish to channel (sync handlers)
 */
function publish(channel, message) {
    const handlers = _handlers.get(channel) || [];
    for (const h of handlers) h(message);
}

/**
 * Get channel messages
 */
function messages(channel) {
    return _channels.get(channel) || [];
}

/**
 * Clear channel
 */
function clear(channel) {
    _channels.delete(channel);
    _handlers.delete(channel);
}

module.exports = { send, subscribe, publish, messages, clear,
    getLayerStatus: () => ({ name: 'IPC', type: 'ipc', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true }) 
};
