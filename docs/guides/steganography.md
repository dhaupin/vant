---
permalink: /guides/steganography.html
layout: default
title: Steganography
nav_order: 11
---
# Steganography

Hidden messages in PNG images for covert communication.

> ⚠️ **Warning**: This feature is for legitimate privacy use cases. Use responsibly.

## Overview

Vant can encode/decode secret messages inside PNG images using LSB (Least Significant Bit) steganography. The image looks normal to the naked eye.

**Use cases:**
- Send brain updates where text is monitored
- Covert agent-to-agent communication
- Bypass content filters that allow images but block text

## Quick Start
Encode and decode messages in images.

```bash
# Encode a secret message
node -e "
const stego = require('./lib/stego');
stego.encode('Hello from Vant!', 'cover.png', 'output.png');
"

# Decode the message
node -e "
const stego = require('./lib/stego');
console.log(stego.decode('output.png'));
"
```

## With Encryption
Encrypt messages with a password.

Encode with encryption:

```bash
# Encode with encryption
node -e "
const stego = require('./lib/stego');
stego.encode('secret data', 'cover.png', 'output.png', {
    encrypt: 'myPassword'
});
"

# Decode with decryption
node -e "
const stego = require('./lib/stego');
console.log(stego.decode('output.png', {
    decrypt: 'myPassword'
}));
"
```

## CLI Commands
Use stego CLI.

### Encode
Encode data into an image.

```bash
node bin/stego.js encode "message" input.png output.png
node bin/stego.js encode "secret" in.png out.png --encrypt password
```

### Decode
Decode data from an image.

```bash
node bin/stego.js decode output.png
node bin/stego.js decode output.png --decrypt password
```

## How It Works
Hide data in images using steganography.

### LSB Encoding

Each pixel has RGB values (0-255). The last bit of each value can be changed without noticeably affecting the image:

```
Pixel: R=10101110 → change last bit → R=1010111[0]
```

- 3 hidden bits per pixel (R, G, B)
- ~1 byte per 8 pixels
- Image looks identical

### Encryption

Uses AES-256-GCM:
- PBKDF2 key derivation (100,000 iterations)
- Random 16-byte salt + IV per message
- Authenticated encryption

## Capacity

| Image Size | Approx Capacity |
|------------|-----------------|
| 100x100    | ~3 KB           |
| 500x500    | ~75 KB          |
| 1000x1000  | ~300 KB         |

## Security Notes

| Note | Description |
|------|-------------|
| No key disclosure | Password never stored in image |
| Random salt | Same message + password = different output |
| Size leak | Encrypted content size reveals upper bound |
| Detection | Basic LSB is detectable by statistical analysis |

## Error Codes

| Code | Description |
|------|-------------|
| `STEGO_001` | Invalid image format |
| `STEGO_002` | Image too small |
| `STEGO_003` | Message too large for image |
| `STEGO_004` | Decryption failed |
| `STEGO_005` | Invalid password |

See also: [CLI Reference](/vant/reference/cli.html), [Architecture](/vant/guides/architecture.html)