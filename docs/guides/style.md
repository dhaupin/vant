---
permalink: /guides/style.html
layout: default
title: Voice & Style
---
# Voice & Style

Writing guidelines for Vant content.

## Our Tone

We're engineers who are also helpful. Clear. Direct. Slightly informal when appropriate, serious when it matters.

We are transparent that AI agents contribute to this project.

## Principles
This section covers principles.

### 1. Use Short Dashes

Always use `-` instead of `—` or `–`.

| ✓ Right | ✗ Wrong |
|--------|----------|
| "Git is memory - every commit is a checkpoint" | "Git is memory — every commit is a checkpoint" |

### 2. Avoid AI Clichés

These phrases are overused:

| Avoid | Instead |
|-------|---------|
| "delve into" | "explore" |
| "leverage" | "use" |
| "unlock" | use specific |
| "seamless" | remove |
| "empower" | "let you" |
| "journey" | remove |
| "realm" | remove |
| "game-changer" | remove |
| "cutting-edge" | remove |
| "revolutionary" | remove |
| "we're excited to" | remove |

Just say what you mean.

### 3. Be Specific, Not Abstract

| ✗ Abstract | ✓ Specific |
|------------|----------|
| "This feature empowers users to do more" | "This feature lets you transfer your brain between instances" |
| "Vant unlocks seamless persistent intelligence" | "Vant stores your AI's memory in Git" |

### 4. State Facts, Not Hype

| ✗ Hype | ✓ Fact |
|--------|-------|
| "Vant is a revolutionary system that will change AI forever" | "Vant persists AI memory across sessions via Git" |

### 5. Active Voice

Use subject-verb-object. Present tense.

| ✗ Passive | ✓ Active |
|----------|---------|
| "The brain is loaded by the CLI" | "The CLI loads the brain" |

### 6. Code Is Documentation

Show, don't just tell. Include working commands.

### 7. Write for Humans and AIs

- A human should feel respected
- An AI should get clear instructions

## Formatting

| Element | Style |
|---------|-------|
| Headers | Title case (titles), sentence case (subheads) |
| Bullets | Use `-`, not `*` |
| Code | Inline `code` for commands, blocks for examples |
| Links | Descriptive, not "click here" |

## Focus Areas

**Include:**
- How to use Vant (clear steps)
- What problems Vant solves (specific)
- Technical details (accurate)
- Tradeoffs (honest)

**Avoid:**
- Vague value propositions
- Over-promising
- Buzzwords

## Example
This section covers example.

### Before (Cliché)

> "Discover the future of AI memory with Vant - the ultimate solution to unlock seamless persistent intelligence across your agentic workflows."

### After (Our Style)

> "Vant stores your AI's memory in Git. Each session inherits the previous one. Use branches to experiment with different brain configs."

## Applying This Guide

Check all content for:

- [ ] Em dashes replaced with hyphens
- [ ] Cliché phrases removed
- [ ] Specific over abstract
- [ ] Active voice

## Documenting Sections

Every section header should have a 1-2 sentence intro that answers:

1. **What** is this section about?
2. **Why** does the reader need to know it?

### Example
See example below.

```markdown
## Installation

Install Vant locally or via Docker. Choose the method that fits your setup.

### Local Install
Installation options.

```bash
npm install -g vant
```

For local development, clone the repo for access to source.
```

**What's NOT needed:**
- Long intros (save for index page)
- Multiple paragraphs before first step

## Documenting Code Blocks

Every code block needs a brief explainer (1 sentence):

| ✓ Enough | ✗ Missing |
|---------|-----------|
| "Run diagnostics:" followed by code | Just the code |
| "Create config:" followed by code | Just the code |

### Example
See example below.

```markdown
Check system health:

```bash
vant health
```

This verifies your setup before running.
```

**Keep it:**
- Direct command with brief purpose
- Expected output if not obvious

## Common Doc Blocks

| Block | Include |
|-------|--------|
| Tables | Headers, 1-2 sentence intro |
| Lists | Lead-in sentence |
| Tips/Notes | Emoji prefix (>, ⚠️) |
| Warnings | Why it matters (1 sentence) |

See also: [CLI Reference](/vant/reference/cli.html), [Documentation](/vant/index.html)