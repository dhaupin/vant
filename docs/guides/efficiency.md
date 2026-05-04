---
version: 0.8.4
permalink: /guides/efficiency.html
layout: default
title: Efficiency
nav_order: 14
---

# Efficiency & Performance

> Guide to optimizing Vant for minimal API usage, fast execution, and token conservation.

## Overview

Vant is designed to be lightweight and efficient. This guide covers optimization strategies.

## Token Optimization

### Prompt Shortening

- Use concise prompts
- Avoid repetition
- Leverage brain files for context

### Context Window

- Load only needed brain files
- Use succession to manage context growth
- Archive old learnings

## API Efficiency

### Rate Limiting

- Check rate limit: `vant rate`
- Batch requests when possible
- Use caching

### Batching

- Group related operations
- Reduce round trips
- Use bulk operations

## Execution Speed

### Startup

- Skip sync if not needed: `vant start --no-sync`
- Use local mode: `vant start --local`
- Pre-load brain

### Caching

- Cache GitHub responses
- Use etag headers
- Avoid redundant fetches

## See Also

- [Operations](/guides/operations.html)
- [Configuration](/reference/configuration.html)
