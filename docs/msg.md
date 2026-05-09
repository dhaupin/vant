---
title: Msg
permalink: /msg
layout: default
nav_order: 15
---

# Msg (v0.8.6)

Agent-to-agent messaging - unified Conversation + IPC + Encryption.

## Installation

```javascript
const msg = require('./lib/msg');
```

## Quick Start

```javascript
// Create conversation
const conv = msg.create({ id: 'team-chat' });

// Post message
msg.post(conv.id, 'Hello team!');

// Post encrypted
msg.post(conv.id, 'Secret data', { encrypt: true });

// Get messages
const messages = msg.messages(conv.id);
```

## Features

### Conversation API

| Method | Description |
|--------|-------------|
| `create(options)` | Create conversation |
| `join(convId)` | Join existing |
| `post(convId, content, options)` | Post message |
| `reply(convId, msgId, content, options)` | Reply to message |
| `messages(convId, options)` | Get messages |
| `addParticipant(convId, agentId)` | Add participant |
| `removeParticipant(convId, agentId)` | Remove participant |
| `participants(convId)` | List participants |
| `info(convId)` | Get conv info |
| `delete(convId)` | Delete conversation |
| `list()` | List all conversations |
| `export(convId)` | Export conversation |

### Channel API (IPC-style)

| Method | Description |
|--------|-------------|
| `send(channel, message)` | Send to channel |
| `subscribe(channel, handler)` | Subscribe to channel |
| `publish(channel, message)` | Publish sync |
| `channelMessages(channel)` | Get channel messages |
| `clear(channel)` | Clear channel |

### Encryption Options

```javascript
// Plain (default)
msg.post(convId, 'Hello');

// Encrypted
msg.post(convId, 'Secret', { encrypt: true });

// Stego (hidden in data)
msg.post(convId, 'Hidden', { stego: true });

// Encrypt + Stego (paranoid)
msg.post(convId, 'Super secret', { encrypt: true, stego: true });

// Auto-detect and reveal
msg.revealAuto(messageContent);
```

### Decryption

```javascript
// Explicit decrypt
const result = msg.decrypt(messageContent);

// Explicit reveal (stego)
const result = msg.reveal(messageContent);

// Auto-detect + reveal
const result = msg.revealAuto(messageContent);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | string | auto | Conversation ID |
| `maxMessages` | number | 100 | Max messages to keep |
| `encryption` | boolean | false | Enable encryption |
| `author` | string | 'anonymous' | Message author |
| `metadata` | object | {} | Custom metadata |
| `encrypt` | boolean | false | Encrypt this message |
| `stego` | boolean | false | Stego this message |
| `forcePlain` | boolean | false | Force plain text |

## Security

- **VAF** validation on all inputs
- **QoS** rate limiting (500/min)
- **Escrow** quota checks
- **Event** notifications for new messages

## Layer Detection

| Layer | Prefix | Description |
|-------|--------|-------------|
| Plain | none | Default readable |
| Encrypt | `ENC:` | AES-256 encrypted |
| Stego | `STEGO:` | Steganographic |
| Encrypt+Stego | `STEGO:` | Both layers |

## Examples

### Basic Chat

```javascript
const msg = require('./lib/msg');

// Create team conversation
const conv = msg.create({ id: 'engineering', maxMessages: 500 });

// Agents join
msg.addParticipant(conv.id, 'agent-alice');
msg.addParticipant(conv.id, 'agent-bob');

// Post messages
msg.post(conv.id, 'Starting sprint planning');
msg.post(conv.id, 'I will work on auth', { author: 'agent-alice' });
msg.post(conv.id, 'I will work on API', { author: 'agent-bob' });

// Get messages
const history = msg.messages(conv.id, { limit: 10 });
```

### IPC-style Events

```javascript
// Subscribe to alerts
msg.subscribe('alerts', (message) => {
    console.log('Alert:', message);
});

// Send alert
msg.send('alerts', { level: 'warning', text: 'High CPU' });
```

### Encrypted Thread

```javascript
const conv = msg.create({ id: 'secure-channel' });

// Post secret key
const encrypted = msg.post(conv.id, 'API_KEY=xxx', { encrypt: true });

// Later decrypt
const msg = msg.messages(conv.id)[0];
const decrypted = msg.decrypt(msg.content);
```

## Layer Status

```javascript
const status = msg.getLayerStatus();
// { name: 'Msg', type: 'msg', version: '0.8.6', enabled: true }
```

## Vant Integration

Vant runtime exports `.msg()` for direct access:

```javascript
const vant = require('./lib/vant');
const msg = vant.msg();
```