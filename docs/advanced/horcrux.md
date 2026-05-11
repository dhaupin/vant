---
version: 0.8.6
permalink: /guides/horcrux
layout: default
title: Horcrux Manifest
nav_order: 65
24
---

# Horcrux Manifest - Zero-Config Bootstrap

The Horcrux system enables Vant to boot from zero local state. When combined with steganography |
- a single PNG image becomes a complete "horcrux" containing your agent's consciousness and configuration.

## How It Works

```
Image (PNG) → Stego Decode → Manifest + Brain → Resume Session
```

The image contains:
1. **Brain data** - Compressed brain JSON
2. **Manifest** - Encrypted config (urls |
- provider |
- branch)

## Architecture

```javascript
{
    version: '1.0',
    type: 'vant-horcrux',
    provider: 'github',
    branch: 'main',
    primaryUrl: 'https://github.com/user/repo',
    secondaryUrl: 'https://gitlab.com/user/repo',
    created: '2026-05-05T12:00:00Z',
    ttl: null
}
```

## Usage

### 1. Create Horcrux

```javascript
const horcrux = require('./lib/horcrux');
const stego = require('./lib/stego');

// Generate manifest
const manifest = horcrux.generateManifest({
    provider: 'github',
    primaryUrl: 'https://github.com/user/repo',
    secondaryUrl: 'https://gitlab.com/user/repo',
    branch: 'main'
});

// Embed in brain
horcrux.embedInBrain(manifest);

// Encode as image
stego.encodeBrain('avatar.png', 'horcrux.png');
```

### 2. Boot from Horcrux

```bash
# Zero config - just the image URL!
vant boot --image=https://example.com/horcrux.png
```

On boot:
1. Decode stego → brain
2. Extract manifest
3. Configure providers from manifest (URLs only!)
4. Set tokens separately as environment
5. Resume synced state

## Security

| Feature
- Protection |
|--------|------------|
| Encrypted
- AES-256-GCM with PBKDF2 |
| No tokens
- Config has URLs only |
| HTTPS required
- Remote URLs validated |
| No internal
- localhost blocked |

## Flow Diagram

```
┌─────────────────┐     ┌─────────────────┐
│  Horcrux Image   │────▶│   Decode Stego  │
│  (any location)  │     │                │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              ┌─────▼──────┐          ┌──────▼──────┐
              │ Manifest  │          │ Brain Data  │
              │ (config) │          │ (state)    │
              └─────┬────┘          └──────┬──────┘
                   │                      │
            ┌──────┴──────┐       ┌──────▼──────┐
            │ Set URLs +   │       │  Load      │
            │ Configure  │       │  Brain    │
            └───────────┘       └───────────┘
```

## Use Cases

1. **Transient Deployment**: Deploy anywhere with just an image URL
2. **Disaster Recovery**: Restore from old profile picture
3. **Provider Migration**: Move between GitHub ↔ GitLab
4. **Zero-Config Start**: No `.env` file needed

## Related

- [Stego](stego) - Image steganography
- [Boot](boot) - Zero-config boot