---
version: 0.8.6
permalink: /security/encryption
layout: default
title: Encryption
nav_order: 74
description: Crypto primitives in lib/encrypt - AES-256-GCM, HMAC token signing, RSA.
---

# Encryption

Reference for the primitives in `lib/encrypt`. For how to use them safely
in an agent workflow, see [Best Practices](/vant/security/best-practices).

## Message encryption

Vant uses AES-256-GCM for message encryption. Every method returns an
authTag, so tampering is detected on decrypt.

| Method | Algorithm | Auth |
|--------|-----------|------|
| `Encrypt.encrypt/decrypt` | AES-256-GCM | Yes (authTag) |
| `Encrypt.aesGcmEncrypt/decrypt` | AES-256-GCM | Yes |
| `Encrypt.hmac` | HMAC-SHA256 | - |

## Token signing

| Method | Algorithm |
|--------|-----------|
| `Encrypt.signToken` | HMAC-SHA256 |
| `Encrypt.verifyToken` | HMAC-SHA256 |

## RSA

| Method | Algorithm | Min Key Size |
|--------|-----------|--------------|
| `Encrypt.rsaKeyPair` | RSA | 2048 bits |
| `Encrypt.rsaEncrypt/decrypt` | RSA-OAEP-SHA256 | 2048 bits |
| `Encrypt.rsaSign/Verify` | RSA-SHA256 | 2048 bits |

## Environment variables

| Variable | Purpose |
|----------|---------|
| `VANT_TOKEN_SECRET` | Secret for signing auth tokens |
| `VANT_API_KEY` | Server authentication |
| `VANT_MSG_ENCRYPTED` | Enable message encryption (default: true) |

Token payloads are base64 (visible, signature-protected, not secret).
Tokens are signed, not encrypted: use only for data that is safe to
expose to the holder. For key hygiene and secret handling in agent
workflows, see [Best Practices](/vant/security/best-practices) and
[Environment & Limits](/vant/security/environment).

## Related

- [Security](/vant/security/) - Security overview
- [Sudo](/vant/essential/sudo) - Privilege elevation
