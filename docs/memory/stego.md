---
version: 0.8.6
permalink: /memory/stego
layout: default
title: Stego
nav_order: 26
description: The steganography mechanism - hide data, and whole brains, in images. Behind horcrux and standalone recovery.
---

# Stego

> Hide data in images. The mechanism underneath [horcrux](/vant/memory/horcrux), also
> usable on its own for brain snapshots and recovery.

Vant can encode an entire brain (memory, learnings, decisions) into an
image using LSB (Least Significant Bit) steganography. The pipeline is:
serialize the brain to JSON, compress with zlib (about 70 percent smaller),
optionally encrypt with AES-256-GCM, then hide the payload in the image's
low bits. Decoding reverses the process.

## What it is for

- **Brain snapshot:** save brain state as a profile picture.
- **Recovery:** restore a brain from any image.
- **Offline backup:** store a brain in plain sight.
- **Covert channel:** pass data between agents through image-only mediums.

## CLI

Hide the brain in an image:

```bash
vant stego snapshot --input=avatar.png --output=brain.png
```

Options: `--input` is the carrier image (default `avatar.png`), `--output`
is the result (default `brain.png`), and `--encrypt` takes a password.

Extract the brain again:

```bash
vant stego recover --input=brain.png --output=brain.json
```

Options: `--input` is the image with the hidden brain, `--output` is the
JSON destination (optional), `--decrypt` takes the password.

Check how much an image can hold:

```bash
vant stego capacity --image=avatar.png
```

## Code

```javascript
const stego = require('./lib/stego');

// Encode a brain into an image
stego.encodeBrain('input.png', 'output.png', { encrypt: 'optional-password' });

// Decode it back
const brainData = stego.decodeBrain('output.png', { decrypt: 'optional-password' });
```

Large brains can span several images:

```javascript
const outputs = stego.encodeBrainChunked(['img1.png', 'img2.png', 'img3.png']);
const brainData = stego.decodeBrainChunked(outputs);
```

The same module carries the SVG variant that horcrux uses
(`encodeSvg` / `decodeSvg`) plus the manifest functions behind
[hocrux bootstrap](/vant/memory/horcrux-bootstrap).

## Capacity

| Image size | Max payload |
|------------|-------------|
| 100x100 | about 2.5 KB |
| 256x256 | about 16 KB |
| 512x512 | about 65 KB |
| 1000x1000 | about 250 KB |

## Security notes

- Encryption is AES-256-GCM with PBKDF2 key derivation.
- Encoded payloads are prefixed with `BRN:ENC:` for detection.
- The auth tag prevents tampering; a modified image fails validation.
- Only PNG is supported for the snapshot flow.
- Edits to an encoded image can corrupt the payload.

## Related

- [Horcrux](/vant/memory/horcrux) - encrypted brain-in-image packaging
- [Horcrux bootstrap](/vant/memory/horcrux-bootstrap) - zero-config boot from an image
- [Boot](/vant/essential/boot) - the startup sequence
