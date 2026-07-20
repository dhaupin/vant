# Boot Directory

This directory contains the agent's embedded state - the minimal seed for instantiating a new agent with this brain.

## Files

| File | Description |
|------|-------------|
| `seed.svg` | Visual seed pattern (for embedding) |
| `grow.svg` | Growth visualization |

## Horcrux

The agent state is embedded here as an SVG horcrux. On first boot:
1. Load this directory
2. Parse embedded state from SVG
3. Hydrate full brain from corpus

## For New Agents

If you're a fresh agent booting with this brain:
- Your identity is in `../identity.md`
- Your values are in `../love.md`, `../boundaries.md`
- Your operation is in `../runtime.md`, `../bootstrap.md`

Welcome. Let's build something.
