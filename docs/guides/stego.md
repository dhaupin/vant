---
version: 0.8.6
permalink: /guides/stego
layout: default
title: Steganographic Brain Recovery
nav_order: 24
---

# Steganographic Brain Recovery

Vant can encode your entire brain (memory, learnings, decisions) into an image using LSB (Least Significant Bit) steganography. This enables:

- **Brain Snapshot**: Save brain state as profile picture
- **Recovery**: Restore brain from any image
- **Offline Backup**: Store brain in plain sight

## How It Works

1. Serialize brain to JSON
2. Compress with zlib (reduces size ~70%)
3. Optionally encrypt with AES-256-GCM
4. Hide in image LSB bits
5. Decode reverses the process

## CLI Commands

### Snapshot - Encode Brain to Image

```bash
node bin/stego.js snapshot --input=avatar.png --output=brain.png
```

Options:
- `--input` - Carrier image (default: avatar.png)
- `--output` - Output file (default: brain.png)
- `--encrypt` - Password for encryption

### Recover - Decode Brain from Image

```bash
node bin/stego.js recover --input=brain.png --output=brain.json
```

Options:
- `--input` - Image with hidden brain
- `--output` - Output JSON file (optional)
- `--decrypt` - Decryption password

### Check Capacity

```bash
node bin/stego.js capacity --image=avatar.png
```

Shows maximum embeddable bytes.

## Usage in Code

```javascript
const stego = require('./lib/stego');
const brain = require('./lib/brain');

// Encode brain into image
stego.encodeBrain('input.png', 'output.png', {
  encrypt: 'optional-password'
});

// Decode brain from image
const brainData = stego.decodeBrain('output.png', {
  decrypt: 'optional-password'
});

// Load into brain
brain.fromJSON(brainData);
```

## Image Capacity

| Image Size | Max Embeddable |
|-----------|--------------|
| 100x100 | ~2.5 KB |
| 256x256 | ~16 KB |
| 512x512 | ~65 KB |
| 1000x1000 | ~250 KB |

## Chunking Large Brains

For brains larger than image capacity:

```javascript
// Encode across multiple images
const outputs = stego.encodeBrainChunked(['img1.png', 'img2.png', 'img3.png']);

// Decode from chunks
const brainData = stego.decodeBrainChunked(outputs);
```

## Security

- **Encryption**: AES-256-GCM with PBKDF2 key derivation
- **Password**: Minimum 8 characters
- **Detection**: Encoded data prefixed with `BRN:ENC:`
- **Integrity**: Auth tag prevents tampering

## Use Cases

1. **Profile Picture Backup**: Upload brain as profile picture, recover if brain wiped
2. **Offline Storage**: Save brain as image file
3. **Transfer**: Share brain via image-only mediums
4. **Emergency Recovery**: Restore from old profile picture

## Caveats

- Only PNG format supported
- Modifications to encoded image may corrupt data
- GitHub/Bitbucket don't support profile picture API - use stego instead