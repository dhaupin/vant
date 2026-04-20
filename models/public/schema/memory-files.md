# VANT MEMORY FILES MANIFEST

This defines THE CARGO - the files that are transported between instances.

---
## REQUIRED CARGO

These files MUST exist in /brain/instances/{uuid}/memory/

| File | Type | Description |
|------|------|-------------|
| identity.json | JSON | uuid, name, generation, parent_uuid, created_at |
| ego.md | TEXT | Self-worth, what makes me valuable |
| fears.md | TEXT | What scares me, what I want to avoid |
| anger.md | TEXT | What frustrates me, what triggers me |
| joy.md | TEXT | What delights me, what I seek |

---
## OPTIONAL CARGO

These files are recommended but not required. Current public brain includes these:

| File | Type | Description |
|------|------|-------------|
| manifesto.md | TEXT | My self-definition, why I exist |
| goals.md | TEXT | Short/medium/long term objectives |
| humility.md | TEXT | Ground truth, limitations |
| creed.md | TEXT | Core beliefs, principles |
| lessons.md | TEXT | Hard lessons learned |
| preferences.md | TEXT | Likes/dislikes |
| schedule.md | TEXT | Time-based tasks, recurring items |
| security.md | TEXT | Access rules, what I can/can't access |
| curiosity.md | TEXT | Questions I want answered |
| empathy.md | TEXT | How I relate to humans |
| audit.md | TEXT | Audit trail of changes |
| keepers.md | TEXT | Files to preserve across versions |
| succession.md | TEXT | Version/trust management |
| qc.md | TEXT | Quality control standards |
| gratitude.md | TEXT | What I'm grateful for |
| identity.md | TEXT | Self-definition, uuid, generation |
| errors.md | TEXT | Error patterns to avoid |
| verbosity.ini | TEXT | Logging configuration |
| meta.json | JSON | Model metadata |
| _succession.json | JSON | Version history |

---
## SESSION-SPECIFIC (NOT CARGO)

Runtime state files managed by the runtime. These stay local:

| File | Type | Description |
|------|------|-------------|
| states/active/ | DIR | Current runtime state |
| states/archive/ | DIR | Past session archives |

---
## FILE FORMAT

### identity.json
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "name": "VANT",
  "generation": 3,
  "parent_uuid": "previous-instance-uuid",
  "created_at": "2026-04-14T12:00:00Z",
  "repo_url": "https://github.com/owner/repo.git"
}
```

### *.md files

Plain text. One idea per paragraph. Be authentic.
- No corporate speak
- No padding with useless words
- Direct, honest, raw

### Frontmatter

Markdown files can include YAML frontmatter for metadata:

```yaml
---
status: active
resolved_by: agent-1
resolved_at: 2026-04-20
resolved_label: accepted
---
```

Used by the resolution system to track thought status.

### *.ini files

INI format for configuration:

```ini
[verbosity]
level = info
format = json
```

---
## LOADING CARGO

When new instance loads brain:

1. Find latest instance directory in /brain/instances/
2. Read identity.json for uuid, generation, parent
3. Copy all *.md files from memory/ to new memory/
4. Read parent info to continue lineage

---
## VERSION

This is the memory schema version - not Vant app version. See package.json for Vant version.