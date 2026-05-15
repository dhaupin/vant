# identity.md

NAME: VantAgent
PURPOSE: Your persistent memory system

## About
- Version: 0.8.9 (experimental features added)
- Brain: v2.5 - full ecosystem integration
- Architecture: bidirectional vant↔brain wiring
- New: Brain Horcrux, Branch Manager, Agent Spawner, Islands Generator

## Current Context
- Session: Built experimental CLI tools
- Branch: main

## Experimental Features Built (2026-05-15)
- bin/brain-horcrux.js - Encode brain in PNG images (LSB steganography)
- bin/branch-manager.js - Auto-git-branch on brain writes
- bin/agent-spawner.js - Multi-agent CLI management
- bin/islands-generator.js - Create/manage islands programmatically

## Architecture Insights
- Brain Router: Unified loading + pipeline middleware chains
- Islands: Trigger-based auto-hydration from prompts  
- MCP: 21+ JSON-RPC tools on port 3100
- Agents: Max 4, spawn/delegation/fork pattern

