# Security Policy

## Supported Versions

| Version | Supported |
|---------|----------|
| 0.8.x | ✅ Yes |
| 0.7.x | ⚠️ Limited |

## Reporting a Vulnerability

If you find a security vulnerability, please report it **privately** - do not open a public issue.

1. **Do NOT** create a public GitHub issue
2. Open a discussion with "Security" tag
3. Or contact maintainer directly

**Response time:** Within 48 hours

## Security Features

Vant includes:

- **VAF** - Input validation (path traversal, command injection, script injection)
- **Rate Limiting** - 60 requests/min, 1000/hour
- **Secret Handling** - Environment variables preferred

## Security Checklist

- [ ] Set strong API keys
- [ ] Use environment variables for secrets
- [ ] Enable audit logging
- [ ] Monitor `.audit.log`

---

See [Security Guide](https://docs.creadev.org/vant/security/security.html) for full technical details.

##感谢

Thank you for helping keep Vant secure!
