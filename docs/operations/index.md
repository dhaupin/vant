---
version: 0.8.6
permalink: /operations/
layout: default
title: Operations
nav_order: 51
description: Running Vant day to day - storage, sync, cron, CI, notifications, networking, and cleanup.
---

# Operations

> Day-to-day running: keep storage healthy, keep the brain synced, automate
> the rest.

| Page | Job |
|------|-----|
| [Storage](/vant/operations/storage) | The storage layer: statuses, stats, WAL, mirrors |
| [Locks](/vant/operations/locks) | The two lock types: lease and mutex, roots, failure postures |
| [Sync](/vant/operations/sync) | Git sync flows and troubleshooting |
| [Automation](/vant/operations/automation) | Scheduled and triggered workflows |
| [Webhooks](/vant/operations/webhooks) | Outbound and inbound webhooks |
| [Cron](/vant/operations/cron) | Scheduled jobs inside Vant |
| [Events](/vant/operations/events) | The event system and handlers |
| [Notifications](/vant/operations/notifications) | Slack, Discord, and push channels |
| [QoS](/vant/operations/qos) | Rate limiting and request budgets |
| [Network](/vant/operations/network) | Peer networking and the headless server |
| [Day-to-day CLI](/vant/operations/operations) | The commands you type most |
| [CI](/vant/operations/ci) | The GitHub Actions pipeline and local equivalents |
| [Testing](/vant/operations/testing) | Test suites and how to run them |
| [Steward Runbook](/vant/operations/steward-runbook) | Running a group's router install: orgs sharing one decision chain |
| [Federation Playbooks](/vant/operations/federation-playbooks) | Join, vote, sync, settle, catch up: mesh participant recipes |
| [Agora](/vant/operations/agora) | Cross-node votes and ledger sync: the `vant agora` verbs |
| [Notices](/vant/operations/notices) | The board: post, catch up, bridge decisions |
| [Settlement](/vant/operations/settlement) | Cross-node payment: claims-not-cash |
| [Cache](/vant/operations/cache) | Cache behavior and clearing |

## Where to start

Something feels slow or broken: [Storage](/vant/operations/storage) first,
then [Cache](/vant/operations/cache). Brain changes not landing on the
remote: [Sync](/vant/operations/sync). Wiring Vant into scheduled work:
[Cron](/vant/operations/cron) and [Automation](/vant/operations/automation).

## One command to remember

```bash
vant health   # Start here when anything looks off
```
