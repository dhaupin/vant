# Audits Archive

Retired audit and wave-era working documents, preserved for history. Nothing
here is a live tracker anymore - each file was a point-in-time audit, census,
or ledger whose work is done. Code comments and test headers still cite
section numbers from LOCKS.md and findings from the others; the paths here
are where those citations now resolve.

| File | What it was |
|------|-------------|
| AUDIT_FINDINGS.md | Security and code audit of the axolotl branch (2026-09-18, Kilo subagents, 8 core modules, ~25K lines). Its closed-criticals ledger is what test/integration-criticals.test.js guards against regressing. |
| COHESION_AUDIT.md | 2026-09-20 cohesion audit: a findings table for wiring everything through the unified runtime surface (storage, pipeline, error, event, brain facade). Findings were fixed or logged; this is the record. |
| DEAD_EXPORTS.md | 2026-09-20 automated dead-export sweep (P3): ~150 zero-consumer exports across ~35 files cataloged with false-positive caveats. Deliberately NOT mass-deleted (c7009da corruption incident); removals happen case by case. |
| LOCKS.md | Pass-101 locks inventory and canonicalization. Section 8 grew into the full-system locks PRD (stages S1-S6, delivered as lib/brain-lock.js + scripts/audit-locks.js); audit-locks comments still cite its section numbers. |
| MULTIBRAIN_CENSUS.md | Pass-73 census (2026-09-29): which subsystems resolve through the active brain stack and which predate the convention. Drove the v0.9 multibrain migration work. |
| QC_WAVE.md | QC wave sweeps and go/no-go ledger (2026-09-22/23). The v1 gap list that spawned follow-ups like branch-manager. |
| SESSION_PASS24.md | Pass-24 session notes (2026-09-23) that could not land in TASKS.md that day (workspace sync refusal) and were parked here instead. |
| STABILITY.md | v1.0.0 stability tracker (from pass 31): per-area status and the fire log for labs/node-crew/stress.js. The harness's triage comments still name it. |
| WAVE_RETROSPECTIVE.md | 2026-09-22 retrospective of the audit-to-green arc: what was broken, what was done about it, what it cost, what it taught. |

Archived: 2026-10-06 (pass 137, owner call). Move was `git mv`; content
untouched, including the historical cross-references between these files.
Restoring one? `git mv labs/archives/audits/<FILE>.md labs/` and update the
citing comments (grep the file name first).
