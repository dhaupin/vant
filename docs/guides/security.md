---
version: 0.8.6
permalink: /guides/security.html
layout: default
title: Security
nav_order: 5
---

# Security

Security guide for Vant - protecting your brain, tokens, and secrets.

## VAF (Vant Application Firewall)

VAF is Vant's input validation and filtering system. It protects against:
- Injection attacks (command, path, script)
- DoS attacks (rate limits, input size bombs)
- Malicious content (malware patterns, exploits)
- Word stacking attacks (troll/flood attacks)

### Quick Start
Initialize VAF in your code:


## VAF Config

Configure VAF via environment:

| Env | Default | What |
|-----|---------|------|
| MCP_REQUIRE_API_KEY | false | Force auth |

---

## See Also

- [Configuration](reference/configuration)
- [Troubleshooting](guides/troubleshooting)
