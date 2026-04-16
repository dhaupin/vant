# vant CLI

A lightweight CLI tool for AI agent session management with GitHub-backed state.

## Installation

```bash
npm install -g vant
# Or use directly
node bin/vant.js <command>
```

## Commands

| Command | Description |
|---------|-------------|
| `vant start` | Health check, ready to sync |
| `vant start --sync` | Health check + sync from GitHub |
| `vant sync pull` | Pull latest from GitHub |
| `vant sync push` | Push changes to GitHub |
| `vant health` | System diagnostics |
| `vant test` | Run build tests |
| `vant load [version]` | Load brain files |
| `vant changelog` | View git history |
| `vant summary` | Session summary |
| `vant bump [version]` | Bump version & tag |
| `vant watch` | Monitor GitHub for changes |
| `vant setup` | Interactive setup |

## Examples

```bash
# Quick start
vant health
vant start --sync

# Sync manually
vant sync pull
# do work
vant sync push "Made changes"

# Version bump
vant bump patch
git push && git push --tags
```

## For Vant System

Full system at: https://github.com/dhaupin/vant
For full brain with YAML categories: https://github.com/dhaupin/vant-brain

## License

MIT