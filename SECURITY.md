# Security Policy

## Supported Versions

| Version | Supported |
|---------|----------|
| 0.8.x | ✅ Yes |
| 0.7.x | ⚠️ Limited |

## Reporting a Vulnerability

If you find a security vulnerability, please report it **privately** - do not open a public issue.

### How to Report

1. **Do NOT** create a public GitHub issue
2. Email: Open a discussion with "Security" tag
3. Or: Contact maintainer directly

**Response time:** Within 48 hours

## Security Features

Vant includes these security measures:

### Input Validation

- VAF (Vant Application Firewall)
- Path traversal protection
- Command injection blocking
- Script injection blocking

### Rate Limiting

- 60 requests/minute
- 1000 requests/hour

### Secret Handling

- Prefer environment variables over config file
- Secret masking available in config module

## Security Checklist

If running Vant:

- [ ] Set strong API keys
- [ ] Use environment variables for secrets
- [ ] Enable audit logging
- [ ] Monitor .audit.log
- [ ] Review rate limits

##感谢

Thank you for helping keep Vant secure!