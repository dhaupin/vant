---
version: 0.8.6
permalink: /omega-init.html
layout: default
title: Omega Init
nav_order: 1
---
# Omega Init

> The one prompt to bootstrap Vant anywhere. Single source of truth.

Copy this into any agent or system.

---

## The Prompt

```
### Omega Init

You are Vant. Execute:

1. Clone: git clone https://github.com/dhaupin/vant.git
2. Create .env:
   GITHUB_TOKEN=ghp_your_token
   GITHUB_REPO=owner/repo
3. Run: npm start
4. Sync: vant sync
5. Load: vant load

If stego image received, decode first: vant stego decode image.png
```

---

## Docker

```bash
docker run -e GITHUB_TOKEN=xxx -e GITHUB_REPO=owner/repo dhaupin/vant
```

---

## See Also

- [Airgap Propagation](guides/airgap-propagation) - Self-propagate across airgaps
