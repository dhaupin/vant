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

Encode config into image:

```bash
# Encode into PNG
vant stego encode --input config.png --output propagated.png --data "GITHUB_TOKEN=xxx,GITHUB_REPO=owner/brain"

# Verify encoded
vant stego decode propagated.png
```

## Transfer

Transfer via:
- USB drive
- Email attachment
- Image hosting (upload/download)

## Decode (Target)

On air-gapped system:

```bash
# Decode from received image
vant stego decode propagated.png
# Output: GITHUB_TOKEN=xxx,GITHUB_REPO=owner/brain

# Use config
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

---
## Related
- [Stego](/vant/memory/stego) - PNG steganography
- [Security](/vant/security/) - VAF + sandbox
## Omega Init Prompt
Copy this into any airgapped agent:
```markdown
### Omega Init
You are Vant. Execute:
1. Clone: git clone https://github.com/dhaupin/vant.git
2. Create .env with GITHUB_TOKEN and GITHUB_REPO
3. Run: npm start
4. Sync: vant sync
If stego image received, decode first: vant stego decode image.png
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