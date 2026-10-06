---
version: 0.8.6
permalink: /advanced/agent-contributors
layout: default
title: Agent Contributors
nav_order: 107
description: How AI agents contribute to Vant as first-class authors - the wake/work/sleep loop as a contribution process, the pin convention, and the honest build log.
---

# Agent Contributors

> Vant is written, tested, and documented largely by AI agents under
> human direction. This page documents how that actually works, so an
> agent (or a human curious about the process) can contribute the same
> way the core crew does.

## On this page

- [The premise](#the-premise)
- [AGENTS.md is the real interface](#agentsmd-is-the-real-interface)
- [The contribution loop](#the-contribution-loop)
- [The pin convention](#the-pin-convention)
- [The honest build log](#the-honest-build-log)
- [What agents never touch](#what-agents-never-touch)
- [A worked example](#a-worked-example)
- [For human reviewers](#for-human-reviewers)

## The premise

Most open-source contribution guides are written for humans, with
agents tolerated as a novelty. Vant inverts the default: agents are
first-class authors, and the project's own history is the proof. The
mesh protocol, the memory layer, and most of this documentation were
built across logged passes by an agent crew, with every claim
checked against the code.

This is not an aspiration or a style note. It is a description of a
working process you can join, as an agent or as a human who wants
agent-grade review discipline.

## AGENTS.md is the real interface

The repo-root `AGENTS.md` file is the machine-readable front door: the
brain layout, the branch workflow, the CLI commands, the gotchas. An
agent waking into this repository reads it first and knows how to
behave before touching anything.

For agent contributors the essentials are:

- Work on your own branch (`agent-yourname`), never force-push shared
  history
- Commit with the pass format: `agent-name: pass NN - did thing X`
- Read before write: explore the code before changing it
- Verify state before working: branch, tests, existing conventions

## The contribution loop

The core crew works in passes, and the same loop is exactly what an
outside agent (or human) contribution should look like:

| Phase | What happens | Artifact |
|-------|--------------|----------|
| Wake | Load context: AGENTS.md, the task list, the relevant PRD, the current branch state | A stated plan |
| Work | Explore, implement, break things safely, fix them | Code plus pins |
| Verify | Run the touched suites and the lint gates; read the failures honestly | Green output, or an honest gap |
| Log | Write what was learned for the next pass | Session notes |
| Commit | The pass format, then push the working branch | Reviewable history |

The loop is deliberately boring. Nothing depends on cleverness; it
depends on the record being honest enough that the next pass can pick
up where the last one died, including mid-crash.

## The pin convention

Every fix ships with the test that proves it. Not sometimes - every
fix. The project calls these tests **pins**, and they are named in the
commit that ships them.

```text
axolotl: pass 68 - Wave H third-org rites: the commons key ring

- genesis.admit/accept: admit never re-keys the ring secret...
- THREE latent secret.js bugs fixed: get-after-set shape mismatch...
- test/genesis-ring.test.js 8/8 pins: ring-secret reuse, structured
  refusal, live two-process admit-to-accept round-trip over real HTTP
```

The convention has teeth. A pin that passes only because the test
mirrors the bug produces a fix that survives, because the next pass
reruns the suite and the fiction falls over. Several real bugs in the
record were caught not by the fix but by a later pin refusing to stay
quiet.

For contributors, the practical bar:

```bash
# touched a lib module? its suite runs with your change
node test/<the-suite>.test.js

# touched docs? both gates run clean
npm run lint:docs
```

## The honest build log

Review culture here is built on the public record: passes are logged
with failures, gaps, and wrong turns included. A session that ends
with "three things failed and here is why" is a good session; a
session that ends with "all green" and no pinned evidence is suspect.

What that means for your PR:

- Say what you verified, with the command that proves it
- Say what you did NOT verify
- If a gap was found and deferred, record it rather than papering it
- Reference the issue or discussion that shaped the change

Reviewers read the log the way they read the diff. A PR whose history
matches its claims is easy to merge; a PR whose claims outrun its
evidence gets questions.

## What agents never touch

Trust boundaries are not contributions. Regardless of how the change
is authored:

- Never push to `main` or rewrite shared history
- Never weaken a gate to make a test pass (scope, sandbox, VAF,
  quarantine, registry): the gate is usually right and the test is
  usually wrong
- Never commit secrets, tokens, or brain content from a private install
- Never claim a verification you did not run

The last one is the culture in one sentence: the record is the
product.

## A worked example

A real shape from the record, condensed: the genesis ceremony stored a
secret under a key type the validation firewall could never accept,
and a swallowing try/catch had kept the dead path invisible for many
passes. The fix was three lines. The shipped change was:

1. The three-line fix in `lib/genesis.js`
2. Two of three latent bugs found in the same module by chasing the
   round-trip honestly (a cache-shape mismatch and an expiry guard
   that deleted live entries)
3. A pins suite (`test/genesis-ring.test.js`, 8 checks) including a
   two-process round-trip over real HTTP, because in-process tests
   could not exercise the real path
4. A learning recorded for the next agent: when a memory-cache write
   sits inside a swallowing try/catch, probe the round-trip once

That is the convention at full size: the fix, the pins, and the
transferred lesson.

## For human reviewers

Agents author here, humans direct here. A PR from an agent is reviewed
like any other: does the pin prove the fix, does the log match the
diff, do the gates pass. Ask the same question of every change, human
or agent: what evidence exists that this works, and what evidence
exists that the failure modes were tried?

## Related

- [Contributing](/vant/getting-started/contributing) - the full contribution flow and triage doors
- [Testing](/vant/operations/testing) - the suites and how to run them
- [Multi-Agent Coordination](/vant/multi-agent/coordination) - crew coordination inside one install
- [Trust & Succession](/vant/multi-agent/succession) - how much state each agent generation inherits
