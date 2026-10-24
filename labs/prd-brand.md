# Vant Brand Voice & Naming — Product Requirements Document

**Version:** 1.0  
**Branch:** axolotl  
**Date:** 2026-09-23  
**Status:** Approved by dhaupin, pending implementation  
**Companion:** prd-content.md (where and how this voice gets applied)

---

## 1. Positioning (GRADUATED — owner directive 2026-10-23)

**The graduation.** Vant graduates from "agent memory tool" to **the
memory-first agent OS**. Two rules hold the move honest:

1. **Memory stays the wedge.** It is still the door buyers walk through
   and the head noun of engagement-tier copy. "Agent OS" is the
   depth descriptor: README's what-is paragraph, docs hub, the
   architecture page, the whitepaper tier. Tier copy never leads with
   "OS"; it leads with the brain and lets the layer carry it.
2. **Every OS claim maps to modules.** "Operating layer" is only
   speakable because the layer exists as code: boot discipline, storage
   with WAL, the fail-closed security chain, crews, governance,
   transports, doors. The layer map lives in
   docs/essential/architecture.md and is the receipts file for every
   "OS" sentence. Claims-are-checkable (§3.6) is what makes the
   graduation true instead of aspirational.

The original ordering below still stands, now inside the graduated
category:**Category order:** Agent memory first, agent OS layer second.

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
purposes only**. It does not appear in code, marketing surfaces, the
lander, or the README.

**KEEP-forever (owner directive 2026-10-23):** the expansion is part of
Vant's identity record and is intentionally broad. It is never deleted,
shortened, or rewritten, and its spelling is EXACTLY "Versatile" — the
word is load-bearing (wrong-spelling variants are a banned word class,
see the guard below). The two sanctioned appearances stay:

- `LEGAL.md` license notice — the expansion as the formal name record
- `ROADMAP.md` header — the repo's own identity line

Where an expansion is legally required in the future (trademark filing,
licensing), it gets pulled from this PRD, not re-derived.

**Misspelling guard:** variants ("versitile", "versitle", "versitile",
"versatil") are named-boxed in this PRD because the broad expansion is
part of the brand's standing and a typo'd version anywhere is a brand
fingerprint. Swept 2026-10-23: zero instances across README, ROADMAP,
LEGAL, docs/, labs/, lib/, bin/, models/, web/. Correct spellings:
LEGAL.md:85, ROADMAP.md:3, this line.

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
| web/home/index.html (home page) | Tightest. Hero under 30 words. Every section scannable. |
| docs/index.md | Same claims as lander, one notch more detail. |
| README.md | GitHub-native. Feature table, quick start, upgrade path. |
| docs/getting-started/* | Most procedural. Zero marketing. |
| docs/essential/*, memory/*, runtime/* | Explain + reference. Claims with code receipts. |
| labs/* | Unchanged. Labs is internal voice, not brand voice. |

## 6. Tagline (ADOPTED — owner directive 2026-10-23)

**The Vant tagline:**

> **Trusting the universe, but with receipts.**

Adopted verbatim from the migration case-study thread (one sentence, no
em dash, no banned word, dry and rare per rule 8). It is the BRAND line;
it never tries to describe the product (that is the descriptors' job
below). Surfaces it rides: home hero kicker, site footer closer, README
epigraph, docs hub quote, AGENTS.md intro, and the public brain's
"THE WAY". Voice rules apply everywhere it lands.

The descriptive lines keep their roles (they are claims, not the
motto): candidate 1 "Agent memory that lives in your repo." stays the
README/docs hero descriptor, candidate 2 stays the SEO description
family, candidate 3 stays reserved for git-focused pages.

## 7. Acceptance criteria

- Zero backronym instances on public surfaces (docs/, dist/, README).
- Zero banned-phrase matches by grep over docs/ and dist/ copy.
- Zero em dashes and emojis in docs/ and dist/ (labs exempt).
- Every command in docs/ appears in a tagged fence with an explainer.
- All memory-system references use the canonical names in section 2.
- The soul line appears exactly once on lander, docs index, and README.

## 8. Lander architecture v2 (pass 318)

The pass 316 rebuild fixed the story; the pass 318 audit maps the FULL
feature set onto it so no capability goes unclaimed on the public face.
Order on the page, with the why:

1. Hero: one hook, "Every session starts over. Except yours."
2. 01 The session loop: the product in three moves.
3. 02 Five minutes: the fastest win.
4. 06 The whole surface, one screen (NEW): an 8-card capability matrix
   over memory / search / crews / interfaces / mesh / compute /
   governance / dashboard. Breadth ONCE, then out-loud reassurance that
   nobody needs all of it.
5. 07 The tier ramp: solo builder, crew, fleet and mesh. Scale is a
   choice, not a migration.
6. 08 The enterprise mesh: the distributed depth run.
7. 09 Watch it live (NEW): the Brain dashboard as proof, placed BEFORE
   the trust copy so the mesh claim lands with something visible.
8. 10 Runs anywhere: deployment posture.
9. 11 Fit check and 12 FAQ: the honesty half, GUI question added.

Rationale: believe fast (1-3), see everything (4), choose scale (5-7),
prove it is real (7-9), then trust (8, 11, 12). The matrix is the
catch-all contract: every feature family carries a claim AND its docs
door, so copy and docs cannot drift apart unnoticed. The same six doors
land in the docs home via the "Looking for something else" line, so
both gateways tell one story.
