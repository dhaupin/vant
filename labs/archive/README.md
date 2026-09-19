# Labs Archive

> "Old inspirations never die."

---

## Purpose

This folder holds **retired labs documents** — PRDs, audits, experiments, specs, art, math, language, psychology, and other explorations that have served their purpose but deserve preservation.

The active `/labs/` root contains **current source of truth** documents. When a doc is superseded, completed, or retired, it moves here.

---

## Archive Policy

| Trigger | Action |
|---------|--------|
| PRD implemented & stable | Move to `archive/` |
| Audit superseded by new audit | Move to `archive/` |
| Experiment concluded | Move to `archive/` |
| Spec replaced by new version | Move to `archive/` |

### Move Process
```bash
git mv labs/prd-old-feature.md labs/archive/prd-old-feature.md
git commit -m "archive: Retire prd-old-feature.md (implemented in vX.Y.Z)"
```

---

## Current Archive

*(empty — awaiting first retirement)*

---

## Active Labs (Source of Truth)

| Document | Status |
|----------|--------|
| `prd-sudo.md` | Active — Sudo system implementation |
| `AUDIT_FINDINGS.md` | Active — Security audit trail |
| `TASKS.md` | Active — Session task tracker |
| `MEM.md` | Active — Agent memory dump |

---

*Created 2026-09-19 — Vant axolotl branch*