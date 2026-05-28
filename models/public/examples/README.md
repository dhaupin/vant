# Vant Examples

Demo files for newcomers learning Vant steganography.

## Files

| File | Description |
|------|-------------|
| `hello-world.svg` | SVG with embedded secret |
| `hello-world.clue` | Password hint |

## How to Discover the Secret

1. Read `hello-world.clue` for hint
2. Find password in git history (separate channel!)
3. Run decode:

```javascript
const stego = require('./stego');
const fs = require('fs');

const svg = fs.readFileSync('hello-world.svg', 'utf8');
const secret = stego.decodeSvg(svg, 'vant');
console.log(secret);
```

## Password Channel Principle

**NEVER put password in the same file/medium as the secret!**

Options for sharing password:
- Verbal / DM / Signal
- Git commit message (different commit)
- Filename of separate file
- URL anchor `#password` (not sent to server)
- Hardcoded Q&A puzzle in plain view

## Supported Formats

- **SVG**: `encodeSvg()`, `decodeSvg()` - strings
- **PNG**: `encode()`, `decode()` - needs existing PNG file
- **Buffer**: `encodeToBuffer()`, `decodeFromBuffer()` - raw data