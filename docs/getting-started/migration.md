---
version: 0.8.6
permalink: /getting-started/migration
layout: default
title: Migration Guide
nav_order: 20
description: Moving an old single-brain install to the multi-brain layout. What runs automatically, what you do, and the safety contract.
---

# Migration Guide

> One import, zero hand-moving of files: how a pre-0.9 install becomes a multi-brain install.

## What changed in v0.9

Vant 0.9 stores brains in per-brain directories with a persisted stack,
instead of one flat brain:

```text
models/
  public/<brain>/          markdown brain files, per brain
  private/<brain>/         private brain files, per brain
  state.json               { "stack": ["vant"], ... }
```

A legacy install keeps its files flat in `models/public/` (and `models/private/`)
with no stack in `models/state.json`. That shape is what the migration detects.

## Do you need to do anything?

Probably not. On the first `vant start` after upgrading, the migration runs
automatically before anything else and prints a banner telling you what it
found and which brain name it used. Your memory content is imported, not
rewritten, and git history keeps every previous state of every file.

If you prefer to look before it runs, preview the moves:

```bash
vant migrate --dry-run    # what would move, touches nothing
vant migrate --status     # layout version, pending steps, detection evidence
```

Already-multi-brain trees are a no-op: `vant migrate` reports up to date and
changes nothing. `vant health` also tells you when a tree is still legacy.

## The manual path

```bash
vant migrate --status              # what's pending and why
vant migrate --dry-run             # preview the moves, no changes
vant migrate --brain-name mybrain  # choose the imported brain's name
vant migrate                       # apply the import
vant start --no-migrate            # start without the auto-import (advanced)
```

`vant start` runs the same migration as `vant migrate`; both accept the same
naming options. The full flag list is in the [CLI Reference](/vant/reference/cli).

## How your brain gets named

The imported brain needs a name, chosen in this order:

1. `--brain-name <name>` if you pass it
2. the brain-name environment variable, if your environment sets one
3. the default: `vant`

Names are segment-validated. A hostile or invalid name falls back to the
default instead of failing the import. Whatever name wins, the banner on
`vant start` and `vant migrate --status` tell you which one was used and why.

## The safety contract

| Guarantee     | What it means                                                        |
|---------------|----------------------------------------------------------------------|
| Content-based | Detection reads your files, never trusts a marker alone              |
| Existing-wins | A live brain file is never clobbered by the import                   |
| Symlink-safe  | The import never follows links out of `models/`                      |
| Verified      | The import must read back through the real loader before it succeeds |
| Marked honestly | If verification fails, the success marker is withheld and the next run retries |
| Idempotent    | Re-runs are no-ops; a missing marker falls back to content detection for crash recovery |

In practice this means a broken import never reports success, and running
`vant migrate` twice cannot corrupt anything.

## Verify after the import

```bash
vant migrate --status   # should report up to date
vant health             # no legacy warning
```

MCP clients can ask the same question with the `brain_migration_status` tool,
listed in [MCP Tools](/vant/reference/mcp-tools). The new layout itself,
stack reads, and dual-mode reads are documented in [The Brain](/vant/memory/brain)
and [Multi-brain](/vant/multi-agent/brains).

## Docker installs

Pull the new image and start it as usual: the migration runs inside the
container on first start, against your mounted `models/` volume, with the
same guarantees. Nothing about your volume layout needs to change by hand.
Deployment details, ports, and the image env contract are in the
[Deploy guide](/vant/getting-started/deploy) and the repo's `DEPLOY.md`.

## Troubleshooting

- **The import says a step is pending forever.** Run `vant migrate` to apply
  it, then `vant migrate --status`. If verification failed, the marker was
  withheld on purpose: your content was moved, the layout was not marked
  done, and the next run retries. Inspect `models/public/<brain>/` and
  `models/private/<brain>/` if it keeps failing.
- **The brain got the wrong name.** Re-run is a no-op on a settled tree, so
  choose the name during the first import: `vant migrate --brain-name <name>`.
- **Something looks stale.** `vant migrate --dry-run` is always safe and
  shows exactly what the detection sees, with per-step evidence.
