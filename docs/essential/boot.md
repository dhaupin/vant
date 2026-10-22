---
version: 0.8.6
permalink: /essential/boot
layout: default
title: Ghost in the Machine
nav_order: 38
---

# Ghost in the Machine - Stego Bootstrapping

Boot Vant from zero local state by fetching a stego image. The agent becomes truly transient - no `.env` file needed if config is embedded in the image!

## How It Works

1. **Fetch**: Load PNG from URL or local file
2. **Decode**: Extract brain from steganographic data
3. **Extract**: Get embedded config (no tokens!)
4. **Resume**: Load brain state, continue session

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

| Check Description |
|-------|-------------|
| HTTPS | Required for remote URLs |
| No internal | Blocks localhost, 127.x, 10.x, 192.168.x |
| No tokens | Config must be set separately |
| Path traversal | Blocked in local paths |

## Embedded Config

The stone gathers its own config; there is no separate embed API. Non-sensitive
configuration lives in the brain (write it with `vant config set`), and a
stego-SVG horcrux packs the brain tree plus shared state and the gathered
config, so a restored stone comes back up configured:

```bash
vant config set GITHUB_REPO owner/repo
vant config set GITHUB_BRANCH main
vant snapshot --password mypass
```

On boot the stone is decoded and restored whole; config is included,
tokens are not - set credentials by hand after boot (see Caveats).

## Use Cases

1. **Transient deployments**: No local state needed
2. **Emergency recovery**: Boot from public URL
3. **Cross-account migration**: Move agent between accounts
4. **Zero-config startup**: Just share an image URL

## Full Example

```bash
# 1. Seal the current brain into a stego-SVG horcrux
vant snapshot --password mypass
#    writes models/public/<brain>/boot/<agent>-p_<pw>.svg

# 2. Push the SVG somewhere a new machine can reach
#    (the raw GitHub URL of the boot file is typical)

# 3. On a new machine (zero local state):
vant boot --image=https://raw.githubusercontent.com/user/repo/main/<agent>-p_<pw>.svg --decrypt mypass

# The stone restores the systems it carries (brain, state, config)!
```

## Caveats

- No tokens embedded (security by design)
- Must set tokens separately after boot
- The sealing image is an SVG (the legacy PNG stone path is retired;
  `vant snapshot` is the encoder)
- A brain too big for one stone can be scoped with
  `vant snapshot --brains <a,b>`

## Amnesia mode (all boot sources fail)

When `vant boot` cannot find any usable boot source (no `--image`, every
source in the auto-boot order fails), it enters **Amnesia Mode**: an
explicit on-screen banner ("VANT AMNESIA MODE") that records an amnesia
state marker and keeps going WITHOUT the booted brain.

Important, verified against the code (`bin/boot.js enterAmnesiaMode`):
**the brain tree is NOT modified - nothing is wiped.** An older build
printed "Cleaning brain and starting fresh" but never deleted anything;
the current wording says exactly what happens. Recovery is manual:

```bash
vant horcrux restore <svg> <password>
# or
vant backup restore backups/<file>.tar.gz
```

## Related

- [Steganography](/vant/memory/stego) - Image encoding
- [GitHub Integration](/vant/integrations/github) - GitHub integration
- [Runtime](/vant/runtime/runtime) - Runtime API

## Next

- [Knowledge Base Browser](/vant/essential/onboard) - the `vant onboard` brain browser