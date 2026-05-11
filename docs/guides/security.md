---
version: 0.8.11
permalink: /guides/security
layout: default
title: Security
nav_order: 21
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

## Encryption

Vant uses AES-256-GCM for message encryption.

### Algorithm

| Method | Algorithm | Auth |
|--------|-----------|------|
| `Encrypt.encrypt/decrypt` | AES-256-GCM | Yes (authTag) |
| `Encrypt.aesGcmEncrypt/decrypt` | AES-256-GCM | Yes |
| `Encrypt.encode/decode` | AES-256-GCM | Yes |
| `Encrypt.hmac` | HMAC-SHA256 | - |

### Token Signing

| Method | Algorithm |
|--------|-----------|
| `Encrypt.signToken` | HMAC-SHA256 |
| `Encrypt.verifyToken` | HMAC-SHA256 |

### RSA

| Method | Algorithm | Min Key Size |
|--------|-----------|--------------|
| `Encrypt.rsaKeyPair` | RSA | 2048 bits |
| `Encrypt.rsaEncrypt/decrypt` | OAEP-SHA256 | 2048 bits |
| `Encrypt.rsaSign/Verify` | RSA-SHA256 | 2048 bits |

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `VANT_TOKEN_SECRET` | Secret for signing auth tokens |
| `VANT_API_KEY` | Server authentication |
| `VANT_MSG_ENCRYPTED` | Enable message encryption (default: true) |

---

## Data

Tokens encrypted per-user.

---

## Related

- [VAF](vaf) - Input validation firewall
- [Sandbox](sandbox) - Execution isolation
- [Escrow](escrow) - Budget tracking
- [Configuration](reference/configuration) - Config settings
- [Tutorial: Security](/tutorials/security) - Practical security setup
