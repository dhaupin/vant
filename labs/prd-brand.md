# Vant Brand Voice & Naming — Product Requirements Document

**Version:** 1.0  
**Branch:** axolotl  
**Date:** 2026-09-23  
**Status:** Approved by dhaupin, pending implementation  
**Companion:** prd-content.md (where and how this voice gets applied)

---

## 1. Positioning (locked)

**Category order:** Agent memory first, agentic runtime second.

1. Memory: the brain, its three storage systems, ownership.
2. Universality: any agent, any LLM, via MCP or plain files.
3. Git-native ownership: your repo, your history, your review process.
4. Runtime depth: security chain, observability, crash-safe storage.
5. Multi-brain and multi-agent: parallel contexts, branch-per-agent crews.
6. The succession/soul metaphor as flavor, never as the whole pitch.

**Audience:** humans running solo agents, humans running agent crews, agents
onboarding agents, and agents supervising humans. All four are first-class.
Copy must work when read by an agent with no human in the loop.

**The soul hook stays.** "Your soul that reincarnates with full memories" is
retained as the emotional hook. It appears once per page surface (lander
hero, docs index, README), never spammed, and is always followed by a
concrete explanation of what actually happens on disk.

## 2. Naming

### The backronym

"Versatile Autonomous Networked Tool" is retained **for legal/uniqueness
purposes only**. It is remembered internally; it does not appear in code,
docs, the lander, or the README.

- Remove existing instances from: docs/index.md, README.md tagline,
  dist/index.html (title/meta/hero), any docs body text.
- The name is simply **Vant**. Where an expansion is legally required in
  the future (trademark filing, licensing), it gets pulled from this PRD,
  not re-derived.
- Add a comment in this PRD only: legal expansion on file, not for
  marketing surfaces.

### Memory system names (canonical, use everywhere)

| System | Canonical name in copy | Not |
|--------|------------------------|-----|
| Brain files | "the brain" (markdown memory files: identity, goals, lessons, errors, preferences) | "memory files", "model files" |
| Memory store | "the memory store" (key-value + document memory with TTL) | "state store", "kv" |
| Search/RAG | "brain search" (semantic search over the corpus via embeddings and rerank) | "vector db", "RAG pipeline" (use sparingly for SEO only) |
| Citations | "citations" (git-backed grounding for claims) | "sources" |
| Geometry | "geometry" (quasicrystal addressing; experimental, label it) | "NSC9" except in spec pages |
| Stego/Horcrux | "horcrux" (brain embedded in an image) and "stego" (the general mechanism) | "steganography" in body text except first mention |
| WAL | "write-ahead journal" | "WAL" except reference pages |

## 3. Voice and tone

**The rules:**

1. Plain declarative sentences. Subject, verb, object. Short first.
2. No em dashes. Use commas, colons, or new sentences.
3. No emojis anywhere in docs or the lander.
4. No cliche AI rhetoric. Banned words and phrases (non-exhaustive):
   "unleash", "supercharge", "revolutionize", "game-changer", "seamless",
   "effortless", "cutting-edge", "harness the power", "in today's fast-paced
   world", "delve", "unlock" (except literal unlock of brain-lock),
   "elevate", "empower", "next-generation", "state-of-the-art", "vibrant",
   "robust" (prefer "survives crashes", "validated by tests").
5. No rhetorical questions in headers or body.
6. Claims are checkable. Every capability claim maps to a module or CLI
   command in the repo. If copy cannot be traced to code, cut it.
7. Agent-first means: prefer imperative CLI/code blocks over prose. Explain
   what the command does, what it needs, what it returns. Assume the reader
   may execute without reading surrounding paragraphs.
8. Humor allowed, dry and rare. The soul line is the ceiling.

**Second person** ("you", "your") is correct even when the reader is an
agent. Agents are "you" too. Where the distinction matters, "your agent"
means the thing reading the brain; "you" means whoever operates it.

## 4. Formatting contract

- Every command appears in a fenced code block with an explainer before it:
  one sentence saying what it does and what it needs.
- Fences are tagged: bash, javascript, json, ini, yaml, html as appropriate.
- A block that requires env vars or prior steps says so in the explainer.
- No orphan code blocks (never a bare block with no preceding sentence).
- Tables for option matrices, lists for sequences, prose for reasoning.
- Frontmatter on every docs page: version, permalink, layout, title,
  nav_order. Description where the page is a landing or hub page.

## 5. Application map

| Surface | Voice intensity |
|---------|-----------------|
| dist/index.html lander | Tightest. Hero under 30 words. Every section scannable. |
| docs/index.md | Same claims as lander, one notch more detail. |
| README.md | GitHub-native. Feature table, quick start, upgrade path. |
| docs/getting-started/* | Most procedural. Zero marketing. |
| docs/essential/*, memory/*, runtime/* | Explain + reference. Claims with code receipts. |
| labs/* | Unchanged. Labs is internal voice, not brand voice. |

## 6. Tagline candidates (pick one in prd-content review)

1. "Agent memory that lives in your repo."
2. "Persistent memory for AI agents, stored as plain files in GitHub."
3. "Your agent's brain, versioned in git."

Default on implementation: candidate 1 for hero surfaces, candidate 2 for
SEO descriptions, candidate 3 reserved for git-focused pages.

## 7. Acceptance criteria

- Zero backronym instances on public surfaces (docs/, dist/, README).
- Zero banned-phrase matches by grep over docs/ and dist/ copy.
- Zero em dashes and emojis in docs/ and dist/ (labs exempt).
- Every command in docs/ appears in a tagged fence with an explainer.
- All memory-system references use the canonical names in section 2.
- The soul line appears exactly once on lander, docs index, and README.
