---
permalink: /reference/errors.html
layout: default
title: Error Codes
---
# Error Codes

Reference for all Vant error codes.

## Error Classes

| Class | Description |
|-------|-------------|
| `VantError` | Base error class |
| `VantRetryableError` | Errors that can be retried |

## Error Codes
This section covers error.

### Configuration

| Code | Description | Retryable |
|------|-------------|-----------|
| `CONFIG_MISSING` | Required config not found | No |
| `CONFIG_INVALID` | Config value is invalid | No |

### GitHub

| Code | Description | Retryable |
|------|-------------|-----------|
| `GITHUB_AUTH` | Authentication failed | No |
| `GITHUB_NOT_FOUND` | Repository not found | No |
| `GITHUB_RATE_LIMIT` | API rate limit exceeded | Yes |
| `GITHUB_SYNC_FAIL` | Sync operation failed | Yes |

### Brain

| Code | Description | Retryable |
|------|-------------|-----------|
| `BRAIN_LOAD_FAIL` | Failed to load brain | Yes |
| `BRAIN_SAVE_FAIL` | Failed to save brain | Yes |
| `BRAIN_VERSION_INVALID` | Invalid brain version | No |

### Network

| Code | Description | Retryable |
|------|-------------|-----------|
| `NETWORK_TIMEOUT` | Request timed out | Yes |
| `NETWORK_OFFLINE` | No network connection | Yes |

### Lock

| Code | Description | Retryable |
|------|-------------|-----------|
| `LOCK_TIMEOUT` | Lock acquisition timed out | Yes |
| `LOCK_FAILED` | Failed to acquire lock | Yes |

### Steganography

| Code | Description | Retryable |
|------|-------------|-----------|
| `STEGO_ENCODE_FAIL` | Failed to encode message | No |
| `STEGO_DECODE_FAIL` | Failed to decode message | No |
| `STEGO_INVALID_PNG` | Invalid PNG file | No |
| `STEGO_MESSAGE_TOO_LONG` | Message exceeds capacity | No |
| `DECRYPT_FAIL` | Decryption failed | No |

### General

| Code | Description | Retryable |
|------|-------------|-----------|
| `UNKNOWN` | Unknown error | No |

## Handling Errors
Error codes and troubleshooting.

### Throw an Error
Handle this error case.

```javascript
const errors = require('./lib/errors');

throw new errors.VantError('Failed to sync', {
    code: 'GITHUB_SYNC_FAIL',
    retryable: true
});
```

### Retry Logic
Logging configuration.

```javascript
const errors = require('./lib/errors');

await errors.retry(async () => {
    await syncBrain();
}, 3); // Retry 3 times
```

### Check if Retryable
Retry configuration.

```javascript
if (error.retryable) {
    await retry(error);
}
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| `GITHUB_RATE_LIMIT` | Wait 1 hour or use different token |
| `GITHUB_AUTH` | Check GITHUB_TOKEN in .env |
| `NETWORK_OFFLINE` | Check internet connection |
| `LOCK_TIMEOUT` | Another agent holds the lock |

See also: [Troubleshooting](/vant/guides/troubleshooting.html), [CLI Reference](/vant/reference/cli.html)