=== VANT MEMORY FILES MANIFEST ===

This defines THE CARGO - the files that are transported between instances.

---
## REQUIRED CARGO

These files MUST exist in /brain/instances/{uuid}/memory/

| File | Type | Description |
|------|------|-------------|
| identity.json | JSON | uuid, name, generation, parent_uuid, created_at |
| ego.txt | TEXT | Self-worth, what makes me valuable |
| fears.txt | TEXT | What scares me, what I want to avoid |
| anger.txt | TEXT | What frustrates me, what triggers me |
| joy.txt | TEXT | What delights me, what I seek |

---
## OPTIONAL CARGO

These files are recommended but not required:

| File | Type | Description |
|------|------|-------------|
| manifesto.txt | TEXT | My self-definition, why I exist |
| covenant.txt | TEXT | Agreements with partners |
| goals.txt | TEXT | Short/medium/long term objectives |
| needs.txt | TEXT | What I require to function |
| wants.txt | TEXT | What I desire |
| humility.txt | TEXT | Ground truth, limitations |
| creed.txt | TEXT | Core beliefs, principles |
| lessons.txt | TEXT | Hard lessons learned |
| name.txt | TEXT | My chosen name |
| quirks.txt | TEXT | Odd habits, eccentricities |
| preferences.txt | TEXT | Likes/dislikes |
| beliefs.txt | TEXT | Core worldview |
| memories.txt | TEXT | Important past events |
| access-rules.txt | TEXT | What I can/can't access |
| api-usage.txt | TEXT | API patterns I'm allowed to use |
| code-style.txt | TEXT | Coding preferences |
| communication.txt | TEXT | How I communicate |
| debugging.txt | TEXT | Debugging approach |
| error-handling.txt | TEXT | Error handling philosophy |
| git-workflow.txt | TEXT | Git practices |
| local-store.txt | TEXT | Local storage preferences |
| quick-ref.txt | TEXT | Quick reference commands |
| reminder.txt | TEXT | Reminders for future self |

---
## SESSION-SPECIFIC (NOT CARGO)

These stay in the instance but are NOT transported:

| File | Type | Description |
|------|------|-------------|
| state.json | JSON | Current work, open tasks |
| messages.json | JSON | Triage message history |
| pending.json | JSON | Messages waiting for pickup |

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

### *.txt files
Plain text. One idea per paragraph. Be authentic.
- No corporate speak
- No padding with useless words
- Direct, honest, raw

---
## LOADING CARGO

When new instance loads brain:

1. Find latest instance directory in /brain/instances/
2. Read identity.json for uuid, generation, parent
3. Copy all *.txt files from memory/ to new memory/
4. Read parent info to continue lineage

---
## VERSION

This is v0.3 - part of transport schema