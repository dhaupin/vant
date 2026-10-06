---
version: 0.8.6
permalink: /memory/prune
layout: default
title: Pruning
nav_order: 29
description: Keep the brain corpus lean - prune stale files, fluff, and superseded memory before sync.
---

# Pruning

> A brain that grows forever stops being read. Prune it.

Brains accumulate. Lessons repeat, goals go stale, files nobody reads slow
down every corpus load and every embedding pass. The prune surface removes
the weight on purpose.

## CLI

Preview what would go:

```bash
vant prune --dry-run
```

Apply it:

```bash
vant prune
```

More ways to look before you delete:

```bash
vant prune --list    # show prunable files
vant prune --stats   # prune statistics
```

Prune targets stale version folders, superseded files, and fluff content,
with retention policies controlling how much history stays.

## Daemon mode

Runs pruning in the background on an interval:

```bash
vant prune --daemon
vant prune --daemon --interval=21600000   # interval in ms (default: 24h)
```

## Tuning

```bash
vant prune --dry-run --stale-days=30   # threshold in days (default: 90)
vant prune --dry-run --no-fluff        # stale entries only, skip fluff detection
```

The stale-days default comes from the `prune.staleDays` config key
(`lib/prune.js` exports it as `DEFAULT_STALE_DAYS`).

## Programmatic

```javascript
const prune = require('./lib/prune');
const result = await prune.run({ dryRun: true });
```

`run` takes `{ dryRun, staleDays, removeFluff }`. The result reports what
was found and what was removed before anything is deleted, so the dry-run
result can be reviewed in automation.

## Practice

Prune on a schedule, not on a feeling. The cron surface can drive it
periodically:

```bash
vant cron list
```

Shows scheduled jobs; add a prune job through `vant cron`. Keep the interval
honest: a monthly prune of an active brain is usually enough, and the
dry-run result makes each pass reviewable before it is destructive.
