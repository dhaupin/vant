# Security

Security principles and practices.

---

## Core Principles

1. **No secrets in public** - Private data stays private
2. **Git is not secret storage** - GitHub repos are public by default
3. **Validate all input** - Never trust unvalidated data
4. **Fail securely** - Default-deny, explicit-allow

## What Is Public

- models/ - Default brain, MIT licensed
- lib/ - Code
- bin/ - Executables

## What Is Private

- .env with tokens
- config.ini with secrets
- states/ - Runtime state
- .agent-locks/ - Lock files
- Thought tracking (may contain sensitive)
- Island state files (lazy-loaded brains)

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
- Use rate limit APIs to check your limit
- Use caching to reduce API calls

---

## Security Checklist

- [ ] No tokens in code
- [ ] No secrets in public model
- [ ] Use lock before write
- [ ] Check rate limits
- [ ] Validate inputs
- [x] Auth lockout has duration (not indefinite)
- [x] Internal tools bind to localhost
- [x] API requires auth

---

**See also:**
- [architecture.md](./architecture.md) - Technical architecture

---

## Security Chain Pattern

> Generic multi-layer defense pattern - adaptable to any agent/app framework.

## THE CHAIN

```
REQUEST → [LAYER 1] → [LAYER 2] → [LAYER 3] → ... → [LAYER N] → EXECUTE
```

Each layer can deny. Order matters - earlier = physical, later = moral/priority.

## COMMON LAYERS

| Layer | Purpose | Example |
|-------|--------|---------|
| **Permissions** | Who can do what | sudo |
| **Confinement** | Stay in bounds | sandbox |
| **Rate** | Too much? | QoS |
| **Approval** | Need allowance? | approval |
| **Compliance** | Legal? | license |

## KEY PRINCIPLES

1. **Defense in depth** - Multiple layers, not one gate
2. **Order matters** - Physical → Logical → Moral
3. **Fail closed** - Default deny
4. **Audit trail** - Log each layer decision

---

## ADAPTING

Pick layers relevant to your project:
- Filesystem app → sandbox first
- API → rate limit first
- Commercial → license check last

---

**See also:**
- [boundaries.md](./boundaries.md) - Hard lines
- [integrity.md](./integrity.md) - Doing right