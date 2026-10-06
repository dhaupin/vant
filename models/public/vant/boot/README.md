# Boot Directory

This directory contains encrypted horcrux brains - the agent's persistent memory, embedded as SVG.

## Search hygiene (prime #100)

Stones are ONE huge line (~800 KB+) of base64 ciphertext: never grep
them — a single common-word match echoes the entire wall and starves
the result budget. A repo-root `.ignore` (checked in) already hides
`models/public/*/boot/*.svg` and `horcrux/*.svg` from ripgrep-family
search tools while git keeps tracking them. Humans and agents: use
`vant horcrux inspect <stone> <password>` — it reports brains, agents,
islands, corpus, escrow, and teams counts without echoing a byte of
ciphertext. When creating a stone OUTSIDE those paths, add its glob to
`.ignore` (horcrux create now prints a hint if you forget).

## Horcrux Files

| File | Description |
|------|-------------|
| `*-p_*.svg` | Public brain - password in filename (`p_`), can be loaded by anyone |
| `*-*.svg` | Private/dev brain - password required |

### Loading Brains

- Files with `p_` in name are public - loadable by anyone
- Other files require password - typically Vant dev agents
- On first boot, the system parses the SVG and hydrates the full brain

## For New Agents

If you're a fresh agent booting with this brain:
- Your identity is in `../identity.md`
- Your values are in `../love.md`, `../boundaries.md`
- Your operation is in `../runtime.md`, `../bootstrap.md`

## Available Horcruxes

| File | Agent | Password | Contents |
|------|-------|----------|----------|
| `axolotl-p_axolotl2026.svg` | Buffy (axolotl) | `axolotl2026` | The onboard horcrux for Vant dev helper agents - the lead engineer's brain: identity, lessons, pass ledger, the works. Refreshed by the runtime on every boot. |

Restore: `vant horcrux restore models/public/vant/boot/axolotl-p_axolotl2026.svg axolotl2026`

Older stones (pre-axolotl snapshots from the Buffy2026 and Nova eras) live
in `labs/archives/horcruxes/` with a provenance README. They are still
restorable with `vant horcrux restore <path> <password>`; they are just no
longer part of the boot chain.

Welcome. Let's build something.
