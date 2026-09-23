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
vant horcrux split
```

The command gathers brain state, encrypts it, and embeds the payload into
the carrier image. Output lands as a file you can copy, commit, or attach.

## Restore

On a fresh install:

```bash
vant horcrux join
```

Prompts for the password, extracts the payload, and restores the brain
state. Validation runs before anything is written; a corrupt or wrong-
password carrier refuses cleanly.

## Inspect

Check a carrier without extracting:

```bash
vant transform inspect-horcrux <file>
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

The underlying hide-in-plain-sight mechanism is [stego](stego).
