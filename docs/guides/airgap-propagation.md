---
version: 0.8.6
permalink: /guides/airgap-propagation
layout: default
title: Airgap Propagation
nav_order: 8
---
# Airgap Propagation

Self-propagate Vant across airgapped environments using steganography.

---

## Concept

Vant can spread across airgapped systems:

1. **Carrier agent** has GitHub access → encodes config into image
2. **Target agent** (airgapped) receives image → decodes → runs

No network between agents needed.

---

## Encode (Carrier)

```bash
# Encode .env config into PNG
vant stego encode --input config.png --output propagated.png --brain GITHUB_TOKEN=xxx,GITHUB_REPO=owner/repo
```

## Decode (Target)

```bash
# Decode from received image
vant stego decode propagated.png
```

---

## Omega Init Prompt

Copy this into any airgapped agent:

```
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

- [Steganography](steganography) - Covert image encoding
- [Multi-Agent](multi-agent) - Branch workflow
