# Multi-Agent Coordination

## Branch-per-Agent Workflow

Each agent gets their own branch for isolation.

### Setup

```bash
# Agent A starts work
vant init
vant branch create agent-a

# Agent A pushes
vant sync push
```

### Handoff

```bash
# Agent B takes over
vant branch switch agent-a
vant sync pull

# Work on new branch
vant branch create agent-b
```

### Merge

```bash
# Merge agent B's work back
vant branch switch main
vant merge agent-b --squash
```

## Trust Levels

| Level | Autonomy | Requires Approval |
|-------|----------|-----------------|
| high | Full | No |
| medium | Most | Big decisions |
| low | Limited | Most |
| none | None | All |

## Succession

Config in `_succession.json`:

```json
{
  "trust": "high",
  "successor": "agent-b",
  "expires": "2026-05-10"
}
```

## Coordination Patterns

### Hub & Spoke

```
main (hub)
├── agent-a (spoke)
├── agent-b (spoke)
└── agent-c (spoke)
```

### Chain

```
agent-a → agent-b → agent-c (succession)
```

### Parallel

```
main
├── agent-a (independent)
└── agent-b (independent)
```
