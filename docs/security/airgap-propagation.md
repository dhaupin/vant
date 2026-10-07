---
version: 0.8.6
permalink: /security/airgap-propagation
layout: default
title: Airgap Propagation
nav_order: 71
---
# Airgap Propagation

Self-propagate Vant across airgapped environments using steganography.

```text
┌─────────────────────────────────────────────────────┐
│          Airgap Propagation Flow                     │
│                                                      │
│  [Air-gapped] ◀── PNG image ───▶ [GitHub]          │
│       │                                        │    │
│       │                                        │    │
│  Decode ◀─── Steganography ─── Encode           │    │
│                                              │    │
│  No network needed!                             │    │
└─────────────────────────────────────────────────────┘
```

## Why

For air-gapped environments:
- No internet access
- Transfer via USB/image
- Zero network footprint

## How It Works

1. **Carrier agent** has GitHub access -> encodes config into image
2. **Target agent** (airgapped) receives image -> decodes -> runs
3. **Target** encodes response back -> sends to carrier

## Encode (Carrier)

The CLI exposes the brain pipeline (`vant stego` verbs: `snapshot`,
`recover`, `capacity`, `upload`). Generic message encode/decode are
lib-only - embed arbitrary config text programmatically:

```javascript
const stego = require('./lib/stego');

// Embed a message into a PNG carrier (password optional)
stego.encode('GITHUB_REPO=owner/brain', 'config.png', 'propagated.png',
             { password: 'carrier-pass' });

// And extract it on the other side
const out = stego.decode('propagated.png', { password: 'carrier-pass' });
```

For a whole-brain transfer, use the CLI directly - `vant stego snapshot`
embeds the brain, `vant horcrux create` embeds it encrypted. No `vant
stego encode`/`decode` CLI verbs exist (a reader following this page
with the CLI would hit "Unknown command").

## Transfer

Transfer via:
- USB drive
- Email attachment
- Image hosting (upload/download)

## Decode (Target)

On air-gapped system (lib surface):

```javascript
const out = require('./lib/stego').decode('propagated.png',
                                          { password: 'carrier-pass' });
// out = the embedded config text
```

Use config:

```bash
export GITHUB_TOKEN=xxx
vant start
```

## Use Cases

### Secure Transport

Transfer tokens without network:

```text
Developer machine ─▶ USB ─▶ Air-gapped server
     │                           │
 Encode ──▶ PNG file ──▶ Decode ──▶ Export env
```

### Cross-Environment Sync

```text
Production (air-gapped) ─▶ USB ──▶ Staging
      │                        │
 Encode ◀─── Reply ◀── Decode
```

---## Related

- [Stego](/vant/memory/stego) - PNG steganography
- [Security](/vant/security/) - VAF + sandbox## Omega Init Prompt

Copy this into any airgapped agent:
```markdown
### Omega Init
You are Vant. Execute:
1. Clone: git clone https://github.com/dhaupin/vant.git
2. Create .env with GITHUB_TOKEN and GITHUB_REPO
3. Run: node bin/vant.js start
4. Sync: vant sync
If a stego image was received, decode it via lib/stego.js first
(the CLI has no generic encode/decode verb).
```
---

## Use Cases

| From | To | Method |
|------|-----|--------|
| Cloud agent | Local airgapped | PNG stego |
| Hosted agent | Edge device | QR codes |
| Agent A | Agent B | Stego PNG transfer |

---
## Related
- [Steganography](/vant/memory/stego) - Covert image encoding
- [Multi-Agent](/vant/multi-agent/agents) - Branch workflow