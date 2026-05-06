---
title: Webhooks
description: Inbound webhook server and event triggers for Vant automations
---

# Webhooks

Vant includes a webhook system for receiving events and triggering automations.

## Server

Start the webhook server:

```bash
vant webhook serve
# Listens on port 3456 by default
```

Or programmatically:

```javascript
const webhooks = require('./lib/webhooks');
webhooks.startServer(3456);
```

## Register Webhook

```bash
vant webhook register mywebhook github
```

Or programmatically:

```javascript
const result = webhooks.register({
    name: 'mywebhook',
    source: 'github',
    eventKeyExpr: 'type',
    signatureHeader: 'X-Hub-Signature-256',
    secret: process.env.WEBHOOK_SECRET
});
// Returns { id, webhook_url, source, enabled }
```

## Filter Events

Add JMESPath filters for event matching:

```javascript
webhooks.addFilter('github:push', "ref == 'refs/heads/main'");
webhooks.addFilter('github:pull_request', "action == 'opened'");
```

### Filter Patterns

| Pattern | Example |
|---------|---------|
| Equality | `repository.full_name == 'owner/repo'` |
| Glob | `glob(repository.full_name, 'owner/*')` |
| Contains | `contains(pull_request.labels[].name, 'bug')` |
| Case-insensitive | `icontains(comment.body, '@agent')` |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VANT_WEBHOOK_PORT` | Server port (default: 3456) |
| `VANT_WEBHOOK_SECRET` | Default signing secret |
| `VANT_WEBHOOK_URL` | Public webhook URL |

## Send Webhook

Send outbound webhooks:

```bash
vant webhook send https://example.com/hook '{"event":"test"}'
```

Or programmatically:

```javascript
const result = await webhooks.send('https://example.com/hook', {
    event: 'test',
    timestamp: new Date().toISOString()
});
```

## Generic Webhook Sender

Send HTTP requests to any endpoint:

```javascript
const result = await webhooks.sendWebhook(
    'https://api.example.com/data',
    'POST',
    { 'Authorization': 'Bearer token' },
    { key: 'value' }
);
```

## Use Cases

### GitHub Automation

```javascript
// Trigger automation on PR opened
webhooks.addFilter('github:pull_request', "action == 'opened'");
// Log to brain
await brain.set('audit.md', JSON.stringify(event));
```

### Linear Integration

```javascript
// Register Linear webhook
webhooks.register({
    name: 'linear',
    source: 'linear',
    eventKeyExpr: 'type'
});
```

## Security

- Signature verification with HMAC-SHA256
- Timing-safe comparison
- Validate payloads before processing

## See Also

- [CLI Reference](/reference/cli)
- [Automation](/guides/automation)