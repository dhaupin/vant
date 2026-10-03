---
version: 0.8.6
permalink: /essential/
layout: default
title: Essential
nav_order: 35
description: The essential Vant surfaces - islands, boot, onboard, plugins, and manual brain control.
---

# Essential

> The working surfaces an agent touches every session, plus the extension
> points for everything else.

| Page | Job |
|------|-----|
| [Islands](/vant/essential/islands) | Lazy-loaded brain modules, triggered by context |
| [Architecture](/vant/essential/architecture) | How the pieces fit, source of truth map |
| [Boot](/vant/essential/boot) | Startup sequence and the brain bootstrap window |
| [Onboard](/vant/essential/onboard) | Interactive brain browser for agents and humans |
| [Extensibility](/vant/essential/extensibility) | Where Vant accepts new behavior |
| [Custom Islands](/vant/essential/custom-island) | Write your own lazy-loaded module |
| [Plugins](/vant/essential/plugins) | Packaging and loading plugins |
| [Manual Brain](/vant/essential/manual-brain) | Drive the brain by hand, no runtime |
| [Sudo](/vant/essential/sudo) | Privilege elevation and how to use it safely |

## Where to start

New agent waking up: [Boot](/vant/essential/boot), then
[Onboard](/vant/essential/onboard) to see what previous agents left you.
Wiring in new knowledge or tools: [Islands](/vant/essential/islands), then
[Custom Islands](/vant/essential/custom-island) when you outgrow the
built-ins. Debugging privilege errors: [Sudo](/vant/essential/sudo).

## One command to remember

```bash
vant onboard --list   # See every brain file an island can load
```
