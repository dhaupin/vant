# Stego Interop Audit — Vant ↔ Stegoframe (SVG)

> **What this is:** the impact audit requested before making Vant's SVG
> stego interoperable with [Stegoframe](https://github.com/dhaupin/stegoframe)
> (pass 178, 2026-10-09). Goal both ways readable — but the two formats
> drifted, and the wire details are NOT the same. Written down before a
> byte is changed so the "will this mess up lots of stuff in Vant?"
> question has a real answer: **mostly no, and here are the 4 exact seams.**

---

## 1. What Vant currently writes (the wire format, exactly)

`lib/stego.js encodeSvg(message, svgContent, password)`:

```xml
<!-- 1. namespace added if absent -->
<svg xmlns:brn="urn:vant" ...>
<!-- 2. payload embedded as SVG <metadata> child -->
<metadata><brn:secret>BASE64</brn:secret></metadata>
```

where `BASE64 = base64('BRN:ENC:' + Encrypt.encrypt(message, password))`.

`Encrypt.encrypt` (lib/encrypt.js, the ONLY cipher in the chain):

| Field | Value |
|---|---|
| Cipher | AES-256-GCM |
| KDF | PBKDF2-HMAC-SHA256, **100,000 iters**, 32-byte key |
| Salt | **16 bytes** random, lowercase hex |
| IV | **16 bytes** random, lowercase hex ⚠️ |
| Auth tag | 16 bytes, lowercase hex |
| Ciphertext | lowercase hex |
| Wire order | `salt:iv:authTag:ciphertext`, literal colons |

Decode (`decodeSvg`): regex `<brn:secret>([A-Za-z0-9+/=]+)</brn:secret>`
— **requires a bare opening tag** (no attributes), strips `BRN:ENC:`,
decrypts, refuses plaintext (`Invalid format: encrypted data required`).

Password discovery: argument → `<path>-p_([^.]+).svg` filename convention
(`p_PASSWORD-b_BOOTSTRAPFLAGS_EXTRA.svg`, flags `[endcv]`).

## 2. What Stegoframe (current main) writes

Same packet core, different wrap:

```xml
<svg xmlns="http://www.w3.org/2000/svg" ...>
  <desc data-f="1.0"/>
  <brn:secret xmlns:brn="http://steganography.dev/brn">BASE64</brn:secret>
  <!-- decorative artwork -->
```

| Difference from Vant | Vant | Stegoframe |
|---|---|---|
| Wrapper element | `<metadata><brn:secret>` | bare `<brn:secret>` (in `<desc>`-bearing SVG) |
| Namespace URI | `urn:vant` | `http://steganography.dev/brn` |
| Opening tag attrs | none (decoder regex requires none) | `xmlns:brn="…"` present |
| **IV length** | **16 bytes** | **12 bytes** (GCM-standard 96-bit) |
| Filename password convention | `p_<pw>-b_<bs>` flags `[endcv]` | none (passphrase passed directly) |
| SVG side marker | none | `<desc data-f="1.0"/>` |
| Whole-file data URL | n/a | `data:image/svg+xml;base64,…` |
| LSB PNG mode | separate raw-offset impl | red-channel LSB, MSB-first (and its own lsbr is internally suspect — README's SGF/8-byte-header framing does not match its lsbr) |

**Both split Web/GCM tag handling the same way: tag before ciphertext,
concatenated `ciphertext+tag` for Node's decipher.** Same KDF, same
iterations, same field order. The ONLY crypto divergence is IV length.

## 3. Impact audit — what in Vant consumes this surface?

| Consumer | How | Break risk from a format change |
|---|---|---|
| `lib/transform.js` `toHorcrux` (→1213) | `stego.encodeSvg(json, template, password)` → horcrux SVG | HIGH if decode regex loses the bare-tag requirement; MEDIUM if harness changes |
| `lib/transform.js` `validateHorcruxFile` (→1371–1385, 1730, 1828) | `hasBrnSecret = content.includes('brn:secret')` + `decodeSvg` | HIGH |
| `bin/horcrux.js` inspect/restore/refresh | password chain: arg → `VANT_BRAIN_PASSWORD` → `p_<pw>` filename | MEDIUM (filename convention MUST survive) |
| `bin/brain-unlock.js` (→82, 112) | raw `includes('<brn:secret>')` + `decodeSvg` | MEDIUM |
| `lib/canvas.js` (→408, 432, 452) | horcrux art encode/decode | LOW-MED |
| `lib/boot.js` `_discoverBootHorcruxes` + horcrux-safe | boot dir `<agent>-p_*.svg` discovery (`.tmp.svg` skip) | NONE for wire change (file naming, not payload) |
| Existing user stones on disk | all past `.svg` horcruxes + galleries | **HIGH — must stay decodable** (restores happen months later) |

Tests pinning behavior: horcrux round-trips, snapshot/restore, `vant
horcrux verify|anchor` exit codes, transform suite (~15 suites).

## 4. The interoperable design (proposed, smallest possible)

Two rules, no format fork:

1. **Vant becomes lenient, Stegoframe-compatible on read.**
   `decodeSvg` regex widens to accept the opening tag with OR without an
   `xmlns:brn` attribute, and also looks inside `<metadata>` vs bare
   element (one regex covers both). Nothing else in the read path moves.
   → **Vant reads Stegoframe SVGs today, with zero writes changed.**
2. **Vant writes standard-GCM (12-byte IV), tagged clearly.** Bump
   `Encrypt.encrypt` IV to the GCM-standard 96 bits and have `decrypt`
   sniff IV length from hex width (24→12B, 32→16B legacy). Then encrypt:
   - with `options.brnStd = true` (default) writes the shared packet
     shape; legacy-16 decode remains. → **Stegoframe reads Vant**.
   - A `fam`/marker is optional; IV-width sniffing already disambiguates,
     so no extra magic needed (KISS).

Mitigations required (from §3):

- Keep the `<agent>-p_<pw>.svg` filename convention EXACTLY (boot
  discovery + horcrux password chain pin on it).
- `hasBrnSecret` sniff already tolerant (`includes`) — keep.
- Existing stones: legacy 16-byte-IV records remain decodable via the
  sniff — no migration script needed.
- `desc data-f="1.0"` marker: write it on new stones (cheap, gives future
  tools a format tag), never require it on read.

## 5. Test plan before merging (acceptance)

1. `encodeSvg → Stegoframe's decoder` (paste of their `_up` logic) reads it.
2. Stegoframe-generated SVG → `decodeSvg` reads it (no password, with).
3. Legacy stone (16-byte IV, `<metadata>` wrap) → still decodes.
4. Horcrux gather→validate→restore round-trip unchanged.
5. `vant horcrux verify/anchor` exit codes unchanged.
6. Full transform + horcrux suites green.

## 6. Residual risks / notes

- Stegoframe README describes an SGF binary frame its own code doesn't
  implement — interop target is the CODE, not the README.
- Stegoframe's LSB mode is internally inconsistent (writer vs reader
  framing); SVG is the only solid interop surface for now.
- Vant PNG `stego.encode` (raw-offset LSB) is a THIRD pipeline; not part
  of this interop unless asked.

*Audit only — no wire changes made this pass.*
