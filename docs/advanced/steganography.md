---
version: 0.8.6
permalink: /steganography.md/steganography
layout: default
title: Steganography
nav_order: 73
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
node bin/stego.js encode --message "brain backup" --input avatar.png --output brain.png

# Decode a secret message
node bin/stego.js decode --input brain.png
```

## CLI Commands

### Encode - Hide Message

```bash
node bin/stego.js encode --message "secret text" --input avatar.png --output encoded.png
```

Options:
- `--message` - Secret message to encode (required)
- `--input` - Carrier PNG image (default: avatar.png)
- `--output` - Output file (default: encoded.png)
- `--encrypt` - Password for AES encryption

### Decode - Reveal Message

```bash
node bin/stego.js decode --input encoded.png
```

Options:
- `--input` - Image with hidden message (required)
- `--decrypt` - Decryption password if encrypted

### Snapshot - Encode Full Brain

```bash
node bin/stego.js snapshot --input avatar.png --output brain.png
```

Encodes entire brain into an image for backup or transfer.

### Capacity - Check Image Capacity

```bash
node bin/stego.js capacity --image avatar.png
```

Shows maximum bytes that can be encoded.

## API Usage

```javascript
const stego = require('./lib/stego');

// Encode a message
const encoded = stego.encode('secret brain state', 'avatar.png', 'output.png');
console.log('Encoded to:', encoded);

// Decode a message
const message = stego.decode('output.png');
console.log('Decoded:', message);

// Check capacity
const maxBytes = stego.getCapacity('avatar.png');
console.log('Max bytes:', maxBytes);
```

## Security Notes

- Use `--encrypt` for sensitive data
- LSB changes are invisible to humans
- Use lossless PNG format (not JPEG)
- Large messages increase file size slightly

---

## Related

- [Security](security) - Security guide
- [Horcrux](horcrux) - Distributed backup