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

Our core writing principles.

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
| Numbered lists | Use dashes in code blocks (see Code Blocks Need Briefs) |

### Numbered Lists in Code Blocks

Never use numbered lists (`1. 2. 3.`) inside markdown code blocks. Use dashes instead:

```
Steps to run:
- Clone: git clone https://github.com/dhaupin/vant.git
- Configure: cp config.example.ini config.ini
```

Why: Markdown parsers may render numbered lists incorrectly inside fenced code blocks.

### Avoid Placeholder Content

Never use "This section covers..." as a section intro. Write actual content:

| ✗ Placeholder | ✓ Real Content |
|--------------|--------------|
| "This section covers events." | "Track system events for debugging and compliance." |
| "This section covers setup." | "Configure Vant to sync with your GitHub repository." |

### Code Blocks Need Briefs

Every code block needs a 1-sentence explainer before it:

Check system health:

    vant health

Why: Readers need context, not just commands.

## Source of Truth

The docs system (`/docs/`) is the source of truth for all documentation.

- README.md references docs, not the other way around
- Keep detailed content in docs
- README provides quick reference with links to full docs

Why: Docs can be rendered with Jekyll (syntax highlighting, navigation, search). README is a single file.

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

Show don't vs shouldn't.

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

For example, here's a properly documented section:

    ## Installation
    
    Install Vant locally or via Docker.
    
    ### Local Install
    For local development:

**What's NOT needed:**
- Long intros (save for index page)
- Multiple paragraphs before first step

## Common Doc Blocks

| Block | Include |
|-------|--------|
| Tables | Headers, 1-2 sentence intro |
| Lists | Lead-in sentence |
| Tips/Notes | Emoji prefix (>, ⚠️) |
| Warnings | Why it matters (1 sentence) |

See also: [CLI Reference](/vant/reference/cli.html), [Documentation](/vant/index.html)