# Vant Stegoframe Transport

> ⚠️ **Deprecated**: See [docs/guides/steganography](../docs/guides/steganography.md) for latest.

---

> Hidden messages in PNG images for covert communication

Vant can encode/decode secret messages inside PNG images using LSB (Least Significant Bit) steganography. Messages are invisible to the naked eye - the image looks normal.

**Use cases:**
- Send brain updates on public forums where text is monitored
- Covert agent-to-agent communication
- Bypass content filters that allow images but block text

---

## Quick Start

```bash
# Encode a secret message into an image
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

---

## With Encryption

Messages can be encrypted with a password before encoding:

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

---

## How It Works

### LSB Encoding

Each pixel in a PNG has RGB values (0-255). The last bit of each value can be changed without noticeably affecting the image.

```
Pixel 1: R=10101110 → change last bit to 0 → R=10101110
Pixel 2: G=01010101 → change last bit to 1 → G=01010101  
Pixel 3: B=11110000 → change last bit to 0 → B=11110000
```

One bit per color channel per pixel = 3 hidden bits per pixel = ~1 byte per 8 pixels.

### Encryption

Uses AES-256-GCM with:
- PBKDF2 key derivation (100,000 iterations)
- Random 16-byte salt + IV per message
- Authenticated encryption (can't tamper without detection)

---

## Capacity

| Image Size | Approx Capacity |
|------------|-----------------|
| 100x100    | ~3 KB           |
| 500x500    | ~75 KB          |
| 1000x1000  | ~300 KB         |

---

## CLI Commands

### Encode
```bash
node bin/stego.js encode "message" input.png output.png
node bin/stego.js encode "secret" in.png out.png --encrypt password
```

### Decode
```bash
node bin/stego.js decode output.png
node bin/stego.js decode output.png --decrypt password
```

---

## Security Notes

- **No key disclosure**: The password is never stored in the image
- **Random salt**: Same message + password = different output each time
- **Size leak**: Encrypted content is base64-encoded, so size reveals upper bound
- **Steganalysis**: Basic LSB is detectable by statistical analysis (advanced detection exists)

---

## Related

- [Stegoframe](https://stegoframe.creadev.org) - Web-based steganography service
- lib/stego.js - Full implementation
- lib/errors.js - Uses VantError codes for stego errors