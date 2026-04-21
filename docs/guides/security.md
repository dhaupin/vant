---
version: 0.8.4
title: Security
slug: /security
order: 8
---

# Security

## VAF (Vant Authorization Framework)

Vant uses VAF for input validation and sanitization.

### Validation

All input is validated before use:
- No hardcoded credentials in defaults
- Uses environment variables for secrets
- Public model contains identity only, no secrets

### Sanitization

User data is sanitized before:
- Writing to brain files
- Committing to GitHub
- Output to console

## Best Practices

1. **Never commit secrets** - Use `.env` files, not code
2. **Use GitHub tokens wisely** - Minimal scope, rotate often
3. **Keep brain private** - Fork for private brains
4. **Review before commit** - Check for accidental secrets

## Configuration

```
# .env (add to .gitignore)
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

## MCP Security

When using MCP server:
- Use API key flag
- Restrict network access
- Review tool permissions

See also: [Architecture](./architecture.md), [Configuration](../reference/configuration.md)
