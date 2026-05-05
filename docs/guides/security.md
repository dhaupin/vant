---
version: 0.8.6
permalink: /guides/security
layout: default
title: Security
nav_order: 11
---
# Security

Vant security guide.

---

## VAF

Vant Application Firewall - input validation.

### What

| Check | Blocks |
|-------|--------|
| Word stacking | vant vant vant |
| Path traversal | ../etc/passwd |
| Shell chars | ; rm -rf |
| Env vars | $HOME |

### Config

| Env | Default |
|-----|---------|
| MCP_REQUIRE_API_KEY | false |
| VAF_MAX_LENGTH | 50000 |

---

## Data

Tokens encrypted per-user.

---

## Related

- [Configuration](reference/configuration)
- [Troubleshooting](troubleshooting)
