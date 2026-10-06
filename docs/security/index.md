---
version: 0.8.6
permalink: /security/
layout: default
title: Security
nav_order: 66
description: The Vant security chain - VAF input validation, sandbox capabilities, escrow budgets, encryption, and safe operation guides.
---

# Security

> Four layers run on every operation: validate the input, gate the
> capability, track the budget, encrypt the wire.

| Page | Job |
|------|-----|
| [VAF](/vant/security/vaf) | Input validation firewall (types, lengths, traversal, shell chars) |
| [Sandbox](/vant/security/sandbox) | Capability gating: what an agent process may do |
| [Escrow](/vant/security/escrow) | Operation budgets and spend tracking |
| [Encryption](/vant/security/encryption) | AES-256-GCM, HMAC tokens, RSA primitives |
| [Environment & Limits](/vant/security/environment) | Env vars, quotas, and hard ceilings |
| [Airgap Propagation](/vant/security/airgap-propagation) | Moving brains across air gaps via images |
| [Best Practices](/vant/security/best-practices) | Safe setup guide for agent workflows |
| [Privacy](/vant/security/privacy) | What Vant stores, sends, and never sends |

## The chain in one example

```bash
vant secret set github <value>   # secrets never print to stdout
vant sandbox status              # check what this process may do
vant sudo --status               # check elevation state
```

Write paths validate input (VAF), check capabilities (sandbox), and honor
budgets (escrow) before touching disk. The same chain guards the MCP
surface and the headless server.

## Where to start

Hardening a self-hosted or multi-agent deployment: [Best
Practices](/vant/security/best-practices) first, then [Environment &
Limits](/vant/security/environment) for the env vars that tune each layer.
Understanding a specific refusal or block: find the layer above and read
its page.

## Related

- [Configuration](/vant/reference/config) - Config keys including MCP auth
- [CLI Reference](/vant/reference/cli) - `secret`, `sandbox`, `sudo`, `encrypt`
