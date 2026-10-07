---
version: 0.8.6
permalink: /security/best-practices
layout: default
title: Security Best Practices
nav_order: 72
---

# Tutorial: Security Best Practices

> Secure your Vant installation

## Token Security

### Don't Commit Tokens

```bash
# Add to .gitignore
echo ".env" >> .gitignore
echo "*.token" >> .gitignore
```

### Use GitHub Fine-Grained Tokens

Create at: github.com/settings/tokens

Required permissions:
- Contents: Read/Write
- Pull requests: Read/Write

```bash
# Create token with minimal scope
# Only give repo access, not entire account
```

## Network Security

### Use HTTPS Only

```bash
# Always use HTTPS for remote
export GITHUB_REPO=https://github.com/user/repo
```

### Firewall

```bash
# Block non-essential ports
ufw default deny incoming
ufw allow 3456/tcp  # Vant only
```

## Sandbox

### Enable Sandbox

Sandbox capabilities are DENY-by-default when explicitly configured;
grant exactly what the agent needs:

```javascript
const sandbox = require('./lib/sandbox');

const s = sandbox.create({
    capabilities: {
        canRead: true,
        canWrite: true,
        canNetwork: false,  // deny network
        canExec: false      // deny exec
    }
});
```

(An untouched sandbox ALLOWS with a warning - the moment you pass
`capabilities`, everything not granted is denied. See
[Sandbox](/vant/security/sandbox).)

## VAF

### Configure VAF

VAF has no `configure()` - tuning happens through config keys read at
module load (`vant config set MAX_STRING_LENGTH 50000`), or per-call
options on `vaf.check()`:

```javascript
const vaf = require('./lib/vaf');

vaf.CONFIG.MAX_STRING_LENGTH;      // default 100000
vaf.CONFIG.BLOCK_PATH_TRAVERSAL;   // default true

// Per-call hardening
vaf.check(input, { name: 'input', type: 'string', maxLength: 50000 });
```

---

## More

See [Security](/vant/security/) and [VAF](/vant/security/vaf).