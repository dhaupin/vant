---
version: 0.8.11
permalink: /tutorials/security
layout: default
title: Security Best Practices
nav_order: 12
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

```javascript
const sandbox = require('./lib/sandbox');

const s = sandbox.create({
    canRead: true,
    canWrite: true,
    canNetwork: false,  // Disable network
    canExec: false     // Disable exec
});
```

## VAF

### Configure VAF

```javascript
const vaf = require('./lib/vaf');

vaf.configure({
    maxLength: 50000,
    blockPathTraversal: true,
    blockShellChars: true,
    blockEnvVars: true
});
```

---

## More

See [Security](/guides/security) and [VAF](/guides/vaf).