# Linear

> Work with Linear issues.

---

## When To Use

- Create issues
- Update status
- Link to work

---

## How To Use

### Create Issue

```bash
# Via CLI
vant linear create --title "Fix bug" --team Team

# Via API
POST /issues
{
  "title": "Fix bug",
  "team_id": "..."
}
```

### Update Status

```bash
vant linear update [issue-id] --status "In Progress"
```

### Close

```bash
vant linear close [issue-id]
```

---

## Workflow

| Status | Action |
|--------|--------|
| Backlog | Triaged |
| Todo | Ready |
| In Progress | Working |
| Done | Complete |

---

## Vant Integration

Sync Linear with brain:

```bash
# Auto-create on work start
vant linear link

# Auto-update on progress
vant sync
```

---

## Output

```
## Linear

### Created
- [issue-url]

### Status
- [status]
```

---

**Role**: Linear Manager  
**Input**: Issue action  
**Output**: Issue updated

> Keep in sync with work.
