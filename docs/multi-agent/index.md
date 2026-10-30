---
version: 0.8.6
permalink: /multi-agent/
layout: default
title: Multi-agent
nav_order: 45
description: Multi-brain contexts, branch-per-agent crews, succession and trust levels.
---

# Multi-agent

> One install, many memory contexts, many agents.

| Page | Job |
|------|-----|
| [Multi-brain](/vant/multi-agent/brains) | Named brains with a stack; switching and read fallback |
| [Branches](/vant/multi-agent/branches) | Branch-per-agent workflow and the branch manager |
| [Trust & Succession](/vant/multi-agent/succession) | How much state each agent generation inherits |
| [Agent Branch Workflow](/vant/multi-agent/agents) | Branch-per-agent workflow + the lock/commit discipline |
| [Federation](/vant/multi-agent/federation) | Sovereign installs meeting over the signed wire: the mesh, groups, stewards |

## The short version

Give each agent a brain context with [multi-brain](/vant/multi-agent/brains), isolate their work with [branches](/vant/multi-agent/branches), and control what a new generation inherits with [succession](/vant/multi-agent/succession). The programmatic crew surface (spawn, delegate, coordinate) is [Agents API](/vant/integrations/agents); the roster size is a config key (`agents.maxAgents`, default 10 via `VANT_AGENTS_MAX`), not a hard-coded cap.
