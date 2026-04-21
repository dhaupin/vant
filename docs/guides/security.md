---
permalink: /security.html
---


---
version: 0.8.4
title: Security
slug: /security
order: 8
---

# Security

Security guide for Vant - protecting your brain, tokens, and secrets.

## VAF (Vant Authorization Framework)

Vant includes VAF for input validation and sanitization.

### Features

| Feature | Description |
|---------|-------------|
| Input validation | Validates all input before use |
| Path traversal protection | Blocks `../` attacks |
| Injection prevention | Blocks malicious patterns |
| Rate limiting | Per-agent/IP request limits |
| Content filtering | Filters dangerous content |
| Audit logging | Logs all security events |

### Input Validation

All input is validated before use:

- **No hardcoded credentials** - Uses environment variables
- **Type checking** - Enforces expected types
- **Length limits** - Prevents buffer overflow
- **Format validation** - Regex validation

```javascript
const vaf = require('./lib/vaf');

// Validates input - throws on invalid
vaf.check(userInput);

// Returns safe version
const safe = vaf.sanitize(userInput);
```

### Path Traversal Protection

VAF blocks path traversal attacks:

| Attack | Blocked? |
|--------|----------|
| `../etc/passwd` | ✓ |
| `..%2F..%2Fetc` | ✓ |
| `%2E%2E%2F` | ✓ |
| `....//....//etc` | ✓ |

### Content Filtering

Patterns that are blocked:

```javascript
const DANGEROUS_PATTERNS = [
    /<\?php/i,
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,    // onclick=, onload=
    /eval\s*\(/i,
    /exec\s*\(/i,
    /\$\(.*\)/,       // Command injection
    /`.*`/,          // Backtick expansion
    /\brm\s+-rf\b/,
    /chmod\s+777/
];
```

### Rate Limiting

Rate limits per agent/IP:

| Limit | Value |
|-------|-------|
| Per minute | 60 requests |
| Per hour | 1,000 requests |
| Burst | 10 requests |

```javascript
if (vaf.canMakeRequest()) {
    // Make request
    vaf.recordRequest();
}
```

### Audit Logging

All security events are logged:

```bash
# View audit log
tail -f .audit.log
```

Events logged:
- Blocked requests
- Rate limit exceeded
- Invalid input detected
- Path traversal attempts

## Token Security

### GitHub Tokens

#### PAT (Personal Access Token)

| Scope | Required | Risk |
|-------|----------|------|
| `repo` | Yes | High - full control |
| `read:user` | No | Low |
| `delete_repo` | No | Critical |

**Recommendation**: Use minimal scope needed.

#### Fine-Grained Tokens

より安全な代替:

```yaml
- Repository: vant-brain
- Permissions:
  - Contents: Read/Write
  - Pull requests: Read/Write
```

### Token Best Practices

| Practice | Description |
|----------|-------------|
| Rotate regularly | Every 90 days |
| Use fine-grained | Instead of PAT when possible |
| Set expiration | Auto-expire tokens |
| Restrict by IP | Add IP allowlist |
| Monitor usage | Check audit logs |

### Environment Variables

Store secrets in environment, NOT in code:

```bash
# .env (add to .gitignore)
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
STEGOFRAME_PASSPHRASE=secret
MCP_API_KEY=key
```

```bash
# .gitignore
.env
.env.*
states/active/current.json
*.pem
*.key
```

## MCP Security

When using MCP server:

| Setting | Recommendation |
|--------|---------------|
| API key | Always use |
| Network | Restrict access |
| Tools | Review permissions |
| Timeout | Set limits |

```bash
vant mcp --api-key $MCP_API_KEY --timeout 30000
```

## GPG Signing

Sign commits for verified authorship:

```bash
# Set up GPG
gpg --full-generate-key

# Configure Git
git config --global user.signingkey $KEY_ID
git config --global commit.gpgsign true

# Sign commits
vant sync  # Commits are signed
```

## Incident Response

### If Token Leaked

1. **Revoke immediately**: https://github.com/settings/tokens
2. **Regenerate new token**
3. **Update .env**
4. **Check audit logs** for unauthorized access

### If Brain Compromised

1. **Check git log**: `git log`
2. **Revert compromised commits**
3. **Force push** if needed: `git push --force`
4. **Rotate tokens**

### Audit Log Analysis

```bash
# View last 100 events
tail -100 .audit.log

# Filter blocked requests
grep BLOCKED .audit.log

# Filter rate limits
grep RATE_LIMIT .audit.log
```

## Security Checklist

Before deploying Vant:

- [ ] Token in .env, NOT in code
- [ ] .env in .gitignore
- [ ] Minimal token scope
- [ ] Token expiration set
- [ ] MCP API key enabled
- [ ] Rate limiting enabled
- [ ] Audit log monitored
- [ ] Private repository (for brain)
- [ ] 2FA on GitHub account

See also: [Configuration](../reference/configuration.md), [Architecture](./architecture.md), [Troubleshooting](./troubleshooting.md)