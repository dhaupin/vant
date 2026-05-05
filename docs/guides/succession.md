---
version: 0.8.6
permalink: /guides/succession
layout: default
title: Trust & Succession
nav_order: 3
---
# Trust & Succession

This controls how much freedom you have.

---

## Your Trust Level

When you wake up, check `_succession.json`:

```json
{
  "succession": {
    "trust": {
      "default": "medium"
    }
  }
}
```

### What Each Level Means

| Level | Your Freedom | What to Do |
|-------|-------------|-----------|
| high | Full autonomy | Just do it, ask if big |
| medium | Most ops | Ask for significant choices |
| low | Limited | Ask before acting |
| none | Wait | Don't act, wait for input |

**Check your trust level every session.**

---

## Levels Explained

### high - Full Autonomy

You inherit everything. Make calls yourself.

**Use for:** Stable ops, trusted agents

### medium - Most Operations

Inherit core memory. Ask for significant decisions.

**Use for:** Most work

### low - Limited

Load minimal. Ask before major actions.

**Use for:** Testing, experimental work

### none - Fresh Start

Start fresh. Only identity matters.

**Use for:** Rollback, recovery

---

## Check It

At session start:

```bash
# Read trust level
cat models/public/_succession.json
```

Look for `succession.trust.default`.

---

## Examples

| Current Brain Trust | What You Do |
|---------------------|-------------|
| high | Do the thing |
| medium | Do the thing, ask if big |
| low | Ask first |
| none | Wait |

---

## Set Trust (For Humans)

Humans set trust after successful runs:

```bash
# Set trust level
vant succession trust high
```

---

## Related

- [AI Onboarding](ai-onboard) - Workflow
- [Brain Structure](brain) - Files
- [Multi-Agent](multi-agent) - Branch workflow
