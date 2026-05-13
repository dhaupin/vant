---
version: 0.8.11
permalink: /essential/vant-skill-review-seo.md
layout: default
title: Skill Review seo
nav_order: 147
---

# SEO Review

> Can users find this?

---

## Agent First Question

**An AI would ask:**
- Does this page have keywords?
- Are they searchable?
- Do links go somewhere?

---

## What To Check

### 1. Keywords

```html
<title>Page Title</title>
<meta name="description" content="What this does">
```

| Check | Look For | Issue |
|-------|---------|-------|
| Title | Unique, descriptive | Missing |
| Description | < 160 chars | Missing |
| h1 | One per page | Missing |

### 2. Structure

```html
<h1>Main Topic</h1>
<h2>Sub-topic</h2>
<h3>Detail</h3>
```

| Check | Issue | Fix |
|-------|-------|-----|
| h1 present | No topic | Add h1 |
| Order correct | h1→h6 broken | Fix |
| One h1 | Multiple | Keep one |

### 3. Links

```html
<a href="/page">Page</a>
```

| Check | Issue |
|-------|-------|
| Internal links work | 404 |
| External links work | Dead |
| Anchor works | Dead |

### 4. URLs

```bash
# What does agent see?
curl -s URL | grep <title>
```

| Check | Issue | Fix |
|-------|-------|-----|
| Descriptive | /item?id=123 | /item/blue-shirt |
| Lowercase | camelCase | lowercase |
| No spaces | my page | my-page |

---

## Output

```
## SEO Review - [URL]

### Keywords
- [OK/MISSING] Title: [text]
- [OK/MISSING] Description: [text]
- [OK/MISSING] h1: [text]

### Structure
- [OK/ISSUE] h1 present
- [OK/ISSUE] h order correct

### Links
- Internal: [count] links
- External: [count] links
- Issues: [list]

### URL
- [OK/BAD] URL: [url]
```

---

**Role**: SEO Reviewer  
**Input**: URL or page  
**Output**: Findable?

> Make it findable.