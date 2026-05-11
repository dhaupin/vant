---
version: 0.8.6
permalink: /guides/boot
layout: default
title: Ghost in the Machine
nav_order: 3
7
---

# Ghost in the Machine - Stego Bootstrapping

Boot Vant from zero local state by fetching a stego image. The agent becomes truly transient - no `.env` file needed if config is embedded in the image!

## How It Works

1. **Fetch**: Load PNG from URL or local file
2. **Decode**: Extract brain from steganographic data
3. **Extract**: Get embedded config (no tokens!)
4. **Resume**: Load brain state |
- continue session

## CLI Usage

```bash
# From GitHub raw URL
vant boot --image=https://raw.githubusercontent.com/user/repo/main/brain.png

# From local file
vant boot --image=./brain.png

# Decrypt password
vant boot --image=./brain.png --decrypt=secret123
```

## Security

| Check
- Description |
|-------|-------------|
| HTTPS
- Required for remote URLs |
| No internal
- Blocks localhost |
- 127.x |
- 10.x |
- 192.168.x |
| No tokens
- Config must be set separately |
| Path traversal
- Blocked in local paths |

## Embedded Config

Save non-sensitive config in brain:

```javascript
const brain = require('./lib/storage').get('brain');

brain.embedConfig({
    GITHUB_REPO: 'owner/repo',
    GITHUB_BRANCH: 'main'
});
```

Then encode as stego image. On boot, config is extracted automatically.

## Use Cases

1. **Transient deployments**: No local state needed
2. **Emergency recovery**: Boot from public URL
3. **Cross-account migration**: Move agent between accounts
4. **Zero-config startup**: Just share an image URL

## Full Example

```bash
# 1. Create brain image (with embedded config)
node bin/stego.js snapshot --input=avatar.png --output=brain.png

# 2. Upload brain.png to GitHub/GitLab/etc
# 3. Share raw URL

# 4. On new machine (zero local state):
vant boot --image=https://raw.githubusercontent.com/user/repo/main/brain.png

# Vant resumes with full brain state!
```

## Caveats

- No tokens embedded (security by design)
- Must set tokens separately after boot
- Image must be PNG format
- Large brains need chunked images

## Related

- [Stego](stego) - Image encoding
- [GitHub](github) - GitHub integration