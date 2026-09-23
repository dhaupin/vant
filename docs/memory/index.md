---
version: 0.8.6
permalink: /memory/
layout: default
title: Memory
nav_order: 20
description: Vant memory systems - the brain files, the memory store, brain search with citations, horcrux, and geometry.
---

# Memory

> The reason Vant exists. Three systems, all in your repo.

Vant memory is not one thing. It is three systems with different jobs, plus
two specialist formats. All of them store data as files under `models/` in
your repository.

| System | Job | Page |
|--------|-----|------|
| **The brain** | Markdown files the agent reads at wake and writes at sleep | [Brain](brain) |
| **The memory store** | Key-value state and documents with TTL, sandbox-gated | [Memory store](memory-store) |
| **Brain search** | Semantic retrieval over the corpus, with rerank and citations | [Brain search](search) |

Specialist formats:

| Format | Job | Page |
|--------|-----|------|
| **Horcrux** | A whole brain embedded in an image, encrypted | [Horcrux](horcrux) |
| **Geometry** | Quasicrystal addressing for spatial retrieval (experimental) | [Geometry](geometry) |

Supporting surfaces: [pruning](prune) keeps the corpus lean, [citations](citations)
ground agent claims in git-backed sources.

## The one-paragraph mental model

Wake: read the brain, check migration status. Work: write facts into the
memory store as they happen, search the corpus when context is missing.
Sleep: write lessons into brain files, commit, push. Git history is the
lineage; every generation of the agent inherits what the last one wrote.
The full loop for agents is in [Agent Onboarding](../getting-started/agent-onboarding).
