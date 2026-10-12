---
version: 0.8.6
permalink: /integrations/linear
layout: default
title: Linear
nav_order: 83
description: Status of the Linear issue-tracking integration
---

# Linear

Not integrated (as of v0.8.6). The `linear` key exists in the island
manifest (`lib/islands.js`) as a lazy slot, but no Linear client code
ships: there is no connector, no `vant.linear` module, no MCP tools, and
`islands.load('linear')` returns `null` (the slot has no data source
wired). The config layer carries a `linear.apiKey` placeholder that
nothing reads.

## What exists

- Island manifest entry (lazy, unwired)
- `linear.apiKey` in `getSecretKeys()` (masking only - no consumer)

## How to actually connect Linear today

Make a custom connector around the Linear GraphQL API yourself (a thin
`fetch` wrapper in an external script, storing results with
`vant learn linear/<issue-id> ...` so the brain indexes them), or use a
generic webhook into `vant webhooks`. If you want this productized,
file an issue with your workflow shape.

## Related

- [Islands](/vant/essential/islands) - Load on-demand
- [MCP](/vant/reference/mcp-tools) - MCP server
- [GitHub](/vant/integrations/github) - The built-in integration
