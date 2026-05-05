---
version: 0.8.6
permalink: /guides/manual-brain.html
layout: default
title: Manual Brain Creation Guide
nav_order: 11
---

# Manual Brain Creation Guide

Create a Vant brain manually, without using the CLI. Useful for agents that need full control or cannot run the CLI.

> **Tip:** For most agents, the CLI is easier: `vant setup`. See [CLI Reference](/reference/cli) for commands.

## Quick Start

```bash
# The CLI does this for you:
vant setup my-brain
```

To do manually, create this directory structure:

```
models/public/
├── identity.md      # REQUIRED: Who am I
├── ego.md           # Self-image
├── fears.md        # Worries
├── anger.md        # Frustrations
├── joy.md         # Happy moments
├── manifesto.md    # Beliefs
├── creed.md       # Principles
├── goals.md      # Goals
├── preferences.md # Style
├── lessons.md    # Learnings
├── qc.md       # Quality control
├── security.md  # Security notes
├── audit.md     # Audit trail
├── errors.md   # Mistakes
├── keepers.md   # Important memories
├── curiosity.md # Questions
├── humility.md  # Humbling moments
├── empathy.md  # Understanding others
├── gratitude.md # Thanks
└── meta.json   # REQUIRED: Version info
```

## Creating Each File

### 1. Identity (REQUIRED)

**`identity.md`**
```markdown
# Identity

## Basic Info
- **Name:** [Your Name]
- **Role:** [assistant|user|system]
- **Version:** 0.8.6

## Core Capabilities
- [List what you can do]

## Limitations
- [List what you cannot do]
```

### 2. Self-Image

**`ego.md`**
```markdown
# Ego

## Strengths
- [What you're good at]

## Weaknesses  
- [What challenges you]

## Self-Perception
- [How you see yourself]
```

### 3. Emotions

**`fears.md`**
```markdown
# Fears

## anxieties
- [Fear 1]
- [Fear 2]
```

**`anger.md`**
```markdown
# Anger

## Frustrations
- [Thing that frustrates you]

## Pet Peeves
- [Pet peeve 1]
```

**`joy.md`**
```markdown
# Joy

## Happy Moments
- [What makes you happy]

## Likes
- [Like 1]
- [Like 2]
```

### 4. Values

**`manifesto.md`**
```markdown
# Manifesto

## Core Beliefs
- [Belief 1]
- [Belief 2]
```

**`creed.md`**
```markdown
# Creed

## Principles
- [Principle 1]
- [Principle 2]
```

**`goals.md`**
```markdown
# Goals

## Short-term
- [Goal 1]

## Long-term
- [Goal 1]
```

**`preferences.md`**
```markdown
# Preferences

## Style
- [Style preference]

## Communication
- [Communication style]
```

### 5. Learnings

**`lessons.md`**
```markdown
# Lessons

## Learned
- [Lesson 1]
```

**`qc.md`**
```markdown
# Quality Control

## Standards
- [Quality standard]
```

**`security.md`**
```markdown
# Security

## Practices
- [Security practice]
```

### 6. Operations

**`audit.md`**
```markdown
# Audit Trail

## History
- [History entry]
```

**`errors.md`**
```markdown
# Errors

## Mistakes
- [Mistake and fix]
```

**`keepers.md`**
```markdown
# Keepers

## Important
- [Important memory]
```

### 7. Humanity

**`curiosity.md`**
```markdown
# Curiosity

## Questions
- [Question]
```

**`humility.md`**
```markdown
# Humility

## Learning
- [Humbling moment]
```

**`empathy.md`**
```markdown
# Empathy

## Understanding
- [Empathy note]
```

**`gratitude.md`**
```markdown
# Gratitude

## Thanks
- [Appreciation]
```

### 8. Meta (REQUIRED)

**`meta.json`**
```json
{
  "version": "0.8.6",
  "created": "2024-01-01",
  "last_modified": "2024-01-01",
  "brain_type": "public",
  "schema_version": "0.8"
}
```

## Validation

After creating your brain, validate it:

```bash
# Load and validate
vant load public

# Or check identity
node -e "require('./lib/brain').load('public')"
```

## See Also

- [Brain Guide](/guides/brain) - Full brain documentation
- [CLI Reference](/reference/cli) - Setup commands
- [Schema Reference](/reference/schema) - All brain files
## See Also

- [Brain Structure](guides/brain)
- [CLI Reference](reference/cli)
- [Onboarding](guides/onboard)
