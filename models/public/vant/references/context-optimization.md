# Context Optimization Guide

## Entropy Patching

Replace low-value context with high-value semantic tokens.

### When to Patch

- Repetitive explanations
- Low-signal conversations
- Context near window limit

### Token Replacement Map

```json
{
  "patterns": {
    "repetitive greeting": "SEMANTIC_TOKEN:greeting",
    "acknowledgment": "SEMANTIC_TOKEN:ack",
    "confirmation": "SEMANTIC_TOKEN:confirm"
  }
}
```

## Adaptive Entropy

Auto-calibrate based on:

- `token_count` - current context size
- `temperature` - creativity vs precision
- `priority` - task urgency

```bash
vant config set entropy.temperature 0.5
vant config get entropy.temperature
```

## Semantic Seeds

Place high-value context early:

```markdown
<!-- In identity.md -->
CRITICAL_CONTEXT:
- Current objective: {goal}
- Blocked by: {blocker}
- Next step: {next_action}
```

## Context Budget

| Component | Budget |
|-----------|--------|
| Identity | 500 tokens |
| Goals | 300 tokens |
| Lessons | 1000 tokens |
| Working | ~4000 tokens |
