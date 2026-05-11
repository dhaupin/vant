---
version: 0.8.11
permalink: /skills/vant-skill-audit-seo.md
layout: default
title: Skill Audit seo
nav_order: 80
---

# SEO Audit

> Is it findable?

---

## When To Use

- New page
- Before launch
- Traffic drop

---

## What To Check

### 1. Index

```bash
# Is it indexed?
curl "https://www.google.com/search?q=site:yourdomain.com+page"
```

| Index | Status |
|-------|--------|
| Yes | Found |
| No | Add to sitemap |

### 2. Sitemap

```xml
<!-- sitemap.xml -->
<url>
  <loc>https://yoursite.com/page</loc>
</url>
```

| Check | Issue |
|-------|-------|
| File exists | Add |
| Has URL | Fix |
| Updated | Refresh |

### 3. Robots.txt

```bash
# robots.txt
User-agent: *
Allow: /
```

| Check | Issue |
|-------|-------|
| Allows crawler | Fix |
| Blocks important | Fix |

---

## Fixes

| Issue | Fix |
|-------|-----|
| Not indexed | Add to sitemap |
| Blocked | Allow in robots.txt |
| No meta | Add meta tags |

---

## Output

```
## SEO Audit

### Index
- [INDEXED/NOT] page

### Sitemap
- [PRESENT/MISSING]

### Robots
- [ALLOWS/BLOCKS]
```

---

**Role**: SEO Auditor  
**Input**: URL  
**Output**: Findable?

> Make it discoverable.
