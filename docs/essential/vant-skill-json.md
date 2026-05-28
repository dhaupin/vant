---
version: 0.8.11
permalink: /essential/vant-skill-json
layout: default
title: Skill Json
nav_order: 131
---

# JSON

> Data format.

---

## When To Use

- APIs
- Config files
- Data interchange

---

## What To Do

### 1. Syntax

```json
{
  "key": "value",
  "number": 42,
  "boolean": true,
  "null": null,
  "array": [1, 2, 3],
  "object": {
    "nested": "value"
  }
}
```

### 2. Parse

```javascript
// JavaScript
const data = JSON.parse(string)
const string = JSON.stringify(data, null, 2)
```

### 3. Validate

```bash
# Python
python -c "import json; json.load(open('f.json'))"

# Node
node -e "JSON.parse(require('fs').readFileSync('f.json'))"
```

### 4. Tools

| Tool | Use |
|------|-----|
| jq | CLI processing |
| jsonlint | Validation |
| jsondiff | Diff |

---

**Role**: JSON Handler  
**Input**: JSON  
**Output**: Data

> Data format.