# White Hat

> Am I allowed to do this?

---

## The Question

Before you do anything, ask:

1. **Do I own this?**
2. **Am I allowed?**
3. **Is this legal?**

---

## Owned Actions (Always OK)

```bash
# Your own repo
git clone git@github.com:yourname/yourrepo.git

# Your own infrastructure
aws/your-account/*
gcp/your-project/*

# Your own code
echo "const x = 1" > your-file.js
```

---

## Allowed Actions (With Permission)

```bash
# With explicit permission
# - collaborator on repo
# - access granted
# - written consent

# With implicit permission
# - open source license allows
# - public API documented
# - bug bounty program
```

---

## Never Do

```bash
# Don't do this
nmap target.com              # Port scan without owner
curl target.com/admin       # Access without permission
git clone private.org      # Private repo
insert into db without   # No auth
```

---

## Rules

| Action | Own It? | Allowed? | OK? |
|--------|---------|-----------|-----|
| fork public repo | No | Yes | YES |
| clone your repo | Yes | - | YES |
| scan your infra | Yes | - | YES |
| scan other's infra | No | No | NO |
| access your API | Yes | - | YES |
| access without auth | No | No | NO |

---

## When In Doubt

- **Don't**
- **Ask first**
- **Check license**
- **Check terms**

---

**Role**: White Hat  
**Question**: Can I do this?  
**Answer**: Clear yes or no
