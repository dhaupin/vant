---
version: 0.8.6
permalink: /guides/airgap-propagation.html
layout: default
title: Airgap Propagation
nav_order: 12
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

## Encode

```bash
# Encode .env config into PNG
vant stego encode --input config.png --output propagated.png --brain GITHUB_TOKEN=xxx,GITHUB_REPO=owner/repo
```

---

## Decode

```bash
# Decode from received image
vant stego decode propagated.png
```

---

## Then Init

After decode, run [Omega Init](docs/omega-init.md).

---

## See Also

- [Omega Init](docs/omega-init.md) - Single source of truth
- [Steganography](guides/steganography.md)
- [Multi-Agent](guides/multi-agent.md)
