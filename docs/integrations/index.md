---
version: 0.8.6
permalink: /integrations/
layout: default
title: Integrations
nav_order: 80
description: Connecting Vant to external services - GitHub, Telegram, Linear, Docker, LLM providers, and skills.
---

# Integrations

> Vant talks to the outside world through a small set of well-worn doors.

| Page | Job |
|------|-----|
| [GitHub](/vant/integrations/github) | Brain storage, sync, and the GitHub API |
| [Agent Skills](/vant/integrations/agent-skills) | Skill packages agents can load |
| [Linear](/vant/integrations/linear) | Issue tracking island |
| [Docker](/vant/integrations/docker) | Running Vant in containers |
| [Telegram Bot](/vant/integrations/telegram-bot) | Control and query Vant over Telegram |
| [Providers](/vant/integrations/providers) | LLM provider configuration |
| [Hybrid Sync](/vant/integrations/hybrid) | Public/private brain split sync |
| [Repos](/vant/integrations/repos) | Mounting external repositories |

Elsewhere in the docs: [MCP](/vant/runtime/mcp) is the tool surface for AI
clients, [Embed](/vant/reference/embed) covers embedding providers, and
[Node Registry](/vant/reference/node-registry) covers peer discovery.

## Where to start

Storing your brain: [GitHub](/vant/integrations/github). Driving Vant from
chat: [Telegram Bot](/vant/integrations/telegram-bot). Tool-calling agents:
[MCP](/vant/runtime/mcp).

## One example

```bash
vant repos add my-notes https://github.com/you/notes.git
vant repos sync my-notes
```
