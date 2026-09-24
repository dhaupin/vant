---
version: 0.8.6
permalink: /memory/horcrux
layout: default
title: Horcrux
nav_order: 25
description: Embed a whole brain in an image, encrypted. Transport memory as a file, restore it anywhere.
---

# Horcrux

> A whole brain, hidden in an image, encrypted with a password.

Horcrux takes the gathered brain state and embeds it into an SVG or PNG
using steganography. The result is one portable file that carries the brain.
Any Vant install can restore it. Nothing about the content is visible
without the password.

## Create one

From the CLI, embedding the current brain into an image:

```bash
vant horcrux create <path> <password>
```

The command gathers brain state, encrypts it, and embeds the payload into
the carrier image. Output lands as a file you can copy, commit, or attach.
Without a path it defaults to
`models/public/<currentBrain>/boot/<brain>-p_<password>.svg` — the naming
convention boot-time discovery scans for.

## Refresh (keep it current)

A horcrux is a point-in-time snapshot; the live brain drifts from it every
session. Regenerate the discovered boot horcrux IN PLACE with fresh state:

```bash
vant horcrux refresh
```

The password resolves the same way as restore (arg → `VANT_BRAIN_PASSWORD`
env → `p_<password>` in the filename). The fresh snapshot is written to a
temp file and round-trip validated before it replaces the original, so a
failed refresh never destroys your only backup; after the swap the final
file is re-verified and the previous bytes restored if verification fails.
Run this after meaningful
brain changes if you rely on horcrux restore for disaster recovery.

## Restore

On a fresh install:

```bash
vant horcrux restore [path] [password]
```

Without a path it scans the brain stack's boot dirs for `<agent>-p_*.svg`.
Prompts for the password if not given, extracts the payload, and restores
the brain state. Validation runs before anything is written; a corrupt or
wrong-password carrier refuses cleanly.

## Inspect

Check a carrier without extracting:

```bash
vant horcrux inspect [path] [password]
```

Reports whether the file holds a valid horcrux payload and which formats it
contains.

## Programmatic use

```javascript
const transform = require('./lib/transform');
const data = await transform.toHorcrux({ outputPath: 'brain.svg', password: 'passphrase' });
```

And the restore side:

```javascript
const restored = await transform.restore('brain.svg', 'passphrase');
```

## When to use one

- Cold backups that survive even if the repo is gone.
- Moving a brain between machines without git access.
- Handing a brain to a successor agent as a single artifact.

The underlying hide-in-plain-sight mechanism is [stego](/vant/memory/stego).
