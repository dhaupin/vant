---
title: Extensibility
description: How to extend Vant with custom agents and skills
nav_order: 6
---

# Extensibility

Vant's brain system follows a **public/private pattern** - defaults live in `models/public/`, your customizations go in `models/private/`.

## Brain Locations

| Path | Purpose |
|------|---------|
| `models/public/` | Vant's default brain files |
| `models/private/` | Your customizations (overrides public) |

When loading, Vant checks **private first** → falls back to **public**.

## Agents

Pre-built agents live in `models/public/agents/`:

```bash
# 26 agents
ls models/public/agents/
```

To customize an agent:

```bash
# 1. Copy to your private brain
cp -r models/public/agents/vant-agent-assistant models/private/agents/my-assistant

# 2. Edit the definitions
edit models/private/agents/my-assistant/AGENT.md
```

### Included Agents

| Agent | Purpose |
|-------|---------|
| vant-agent-assistant | General-purpose helper |
| vant-agent-engineer | Code writing & editing |
| vant-agent-architect | System design |
| vant-agent-qc | Quality control |
| vant-agent-ci | CI/CD pipeline |
| vant-agent-debug | Debugging & troubleshooting |
| vant-agent-tester | Test writing |
| vant-agent-docs | Documentation |

And more: backend, frontend, content, designer, emergency, grep, help, integrate, iterate, ops, reliability, sed, seo

## Skills

Pre-built skills live in `models/public/skills/`:

```bash
# 70 skills
ls models/public/skills/
```

To customize a skill:

```bash
# 1. Copy to your private brain
cp -r models/public/skills/vant-skill-git models/private/skills/my-git

# 2. Edit the definitions
edit models/private/skills/my-git/SKILL.md
```

### Included Skills

**Core:**
- api, git, github, shell, docker, npm, python

**Auditing:**
- audit-ci, audit-deploy, audit-general, audit-ops, audit-qc, audit-qos, audit-reliability, audit-security, audit-seo

**Testing:**
- test-unit, test-e2e, test-integration, test-contract, test-load, test-fuzz, test-chaos, test-regression, test-smoke, test-snapshot, test-pen

**Chain Skills:**
- chain-ci, chain-deploy, chain-pen, chain-qc, chain-security, chain-team, chain-test, chain-full-audit

**Reviews:**
- review-code, review-docs, review-efficiency, review-performance, review-seo

**Other:**
- aws, browser, css, deno, email, environment, graphql, hat-black, hat-grey, hat-white, help, island, json, kubernetes, linear, markdown, mcp, postgresql, react, redis, regex, sql, supabase, sync, tailwind, typescript, vite, yaml

## Chaining Skills

Chain skills compose multiple skills into workflows:

```yaml
---
name: chain-ci
description: Run CI pipeline
skills:
  - audit-ci
  - test-unit
  - security
...
```

Use them to build multi-step workflows.

## Override Priority

When you create `models/private/agents/my-agent/`, it takes precedence over `models/public/agents/vant-agent-*`.

Same for skills: `models/private/skills/my-skill/` → `models/public/skills/vant-skill-*`

This lets you:
- Extend Vant without forking
- Keep customizations separate
- Update Vant without losing changes

## Best Practices

1. **Copy, don't modify** - Start from public copies
2. **Keep private changes** - Store in your private brain
3. **Use descriptive names** - `vant-agent-fork` → `my-custom-agent`

## Related

- [brain.md](essential/brain) - Brain system internals
- [islands.md](essential/islands) - Lazy-loading brain modules
- [multi-agent.md](essential/multi-agent) - Multi-agent coordination