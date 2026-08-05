# Boot Directory

This directory contains encrypted horcrux brains - the agent's persistent memory, embedded as SVG.

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

Welcome. Let's build something.
