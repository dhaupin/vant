# Config

Configuration. Runtime settings.

---

## Core Config

In `.vant/config`:

```json
{
  "trust_level": "high",
  "auto_commit": true,
  "auto_save": true,
  "verbose": true
}
```

---

## Environment Vars

```
GITHUB_TOKEN     # GitHub API
LINEAR_TOKEN    # Linear API  
OPENAI_API_KEY # LLM
```

---

## Config Commands

```bash
vant config get trust_level
vant config set auto_commit false
```

---

## Islands Config

Per-island config in `islands/*/config.json`.