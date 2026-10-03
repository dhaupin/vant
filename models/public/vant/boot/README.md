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
| `*-*.svg` | Private/dev brain - password required (e.g., nova-p_nova2026.svg) |

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
| `buffy-p_buffy2026.svg` | Buffy | `buffy2026` | Private brain snapshot (identity.md + learnings.md): fs→storage cohesion pass patterns, 13+ modules migrated, R-1..R-4 security finds |

Restore: `vant horcrux restore models/public/vant/boot/buffy-p_buffy2026.svg buffy2026`

Welcome. Let's build something.
