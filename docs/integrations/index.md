---
version: 0.8.6
permalink: /integrations/
layout: default
title: Integrations
nav_order: 80
description: Connecting Vant to external services - GitHub, Telegram, Docker, LLM providers, and skills.
---

# Integrations

Vant talks to the outside world through a small set of well-worn doors. Some
have a full guide below; others are config-only connectors that ship inside
`lib/connectors/` and activate from `config.ini` or `config.get` keys.

## With a guide

| Page | Job |
|------|-----|
| [GitHub](/vant/integrations/github) | Brain storage, sync, and the GitHub API |
| [Repos](/vant/integrations/repos) | Mounting external repositories |
| [Telegram Bot](/vant/integrations/telegram-bot) | Control and query Vant over Telegram |
| [Providers](/vant/integrations/providers) | LLM provider configuration |
| [Agent Skills](/vant/integrations/agent-skills) | Skill packages agents can load |
| [Hybrid Sync](/vant/integrations/hybrid) | Public/private brain split sync |

Sync is not GitHub-only. The sync layer auto-detects the host from the remote
URL, so GitLab, Bitbucket, Gitea, and self-hosted Git work with the same
`vant sync` door (see [Sync](/vant/operations/sync)).

## Config-only connectors

These ship in the box and are enabled through configuration rather than a
separate guide:

| Connector | Activates via | Notes |
|-----------|--------------|-------|
| GitLab / Bitbucket / Gitea / self-hosted Git | provider auto-detected from the remote URL (env tokens: `GITLAB_TOKEN`, `GITEA_TOKEN`, `BITBUCKET_TOKEN`) | Same brain storage + sync doors as GitHub; see [Sync](/vant/operations/sync) |
| S3-compatible object storage (AWS S3, Cloudflare R2, MinIO, B2) | `getStorage('remote', { provider, bucket, ... })` / `VANT_REMOTE_*` env, CLI `vant s3` | SigV4 wire client behind [RemoteStorage](/vant/reference/storage) |
| Pinecone vector store | `PINECONE_API_KEY` / `PINECONE_ENV` / `PINECONE_INDEX` env, CLI `vant connector` | Optional remote vector index for [search](/vant/memory/search) |
| Language sidecars (rust, julia, python, go, ruby, php, node) | `vant compute` | See [Compute](/vant/reference/compute) |
| Hermes connector | `require('./connectors').hermes(config)` | Read/write brain format for hermes-agent installs |
| CrewAI connector | `require('./connectors').crewai(config)` | Multi-agent brain format interop |

The `qdrant` and `weaviate` connector factories exist in `lib/connectors/index.js` but
their backing modules are not shipped yet (same stub situation as
Linear).

## Deployment, not integration

[Docker](/vant/integrations/docker) is about running Vant in containers -
heads there when you want the container story.

## Not integrated (on purpose, for now)

[Linear](/vant/integrations/linear) is a manifest stub only: the page exists,
no connector is wired. It stays listed so nobody mistakes it for a shipped
door.

## Elsewhere in the docs

[MCP](/vant/runtime/mcp) is the tool surface for AI clients,
[Embed](/vant/reference/embed) covers embedding providers, and
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

## Related

- [Agents API](/vant/integrations/agents) - the programmatic crew surface other stacks call
- [Telegram bot](/vant/integrations/telegram-bot) - command your install's brain from any chat
- [Hybrid Sync](/vant/integrations/hybrid) - split public/private brain between repos
