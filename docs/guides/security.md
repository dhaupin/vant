---
version: 0.8.6
permalink: /guides/security.html
layout: default
title: Security
nav_order: 10
---
# Security

Vant security model.

---

## VAF

Vant Application Firewall - input validation layer.

### What It Does

- **Word stacking** - Blocks repeated words
- **Path traversal** - Blocks `../` attacks
- **Shell metacharacters** - Blocks `;`, `|`, `&&`
- **Environment variables** - Blocks `$VAR` attacks

### Config

| Env | Default | What |
|-----|---------|------|
| MCP_REQUIRE_API_KEY | false | Force auth required |
| VAF_MAX_LENGTH | 50000 | Max input length |

---

## Data

- Tokens stored per-user (encrypted)
- No Reddit credentials in logs
- AI keys encrypted at rest

---

## See Also

- [Configuration](reference/configuration)
- [Troubleshooting](guides/troubleshooting)
