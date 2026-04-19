# Security

Security principles and practices for Vant.

---

## Core Principles

1. **No secrets in public** - Private data stays private
2. **Git is not secret storage** - GitHub repos are public by default
3. **Validate all input** - Never trust unvalidated data
4. **Fail securely** - Default-deny, explicit-allow

## What Is Public

- models/public/ - Default brain, MIT licensed
- lib/*.js - Public utilities
- bin/*.js - CLI tools

## What Is Private

- .env with tokens
- config.ini with secrets
- states/ - Runtime state
- .agent-locks/ - Lock files

## Usage

```javascript
const lock = require('./lib/lock');

// Always acquire before write
const token = await lock.acquire('my-agent');
if (token) {
    // do work
    await lock.release('my-agent', token);
}
```

## GitHub Tokens

- Never commit tokens to git
- Use .env for local development
- Use GITHUB_TOKEN env var for CI/CD

## Rate Limiting

- GitHub API has limits (360/hour)
- Use `vant rate` to check your limit
- Use caching to reduce API calls

---

## Security Checklist

- [ ] No tokens in code
- [ ] No secrets in public model
- [ ] Use lock before write
- [ ] Check rate limits
- [ ] Validate inputs