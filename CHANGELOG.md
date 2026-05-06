# Changelog

All notable changes to Vant will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Agent Skills Format (agentskills.io)**: New skill format compatible with Claude Code, OpenAI Codex, Cursor, and other agents
  - `models/public/vant/SKILL.md` - Skill manifest with YAML frontmatter
  - `models/public/vant/references/context-optimization.md` - Entropy patching, semantic seeds, context budgets
  - `models/public/vant/references/multi-agent.md` - Branch workflow, trust levels, coordination
  - `bin/skills-export.sh` - Export utility for agent skills
- **MCP Extended Tools**: 11 new tools added (total 20)
  - Islands: vant_get_islands, vant_load_island
  - Resolution: vant_resolution_track
  - Stego: vant_stego_encode, vant_stego_decode
  - Config: vant_config_get, vant_config_set
  - Audit: vant_audit_log, vant_audit_list
  - Trust: vant_succession_info
  - Search: vant_search

## [0.8.6] - 2026-05-05

### Added
- **Code Block Styling**: Syntax highlighting (tok-com, tok-kw, tok-str, tok-var)
- **CSS DSL**: Semantic classes (.ma-t, .pa-l, .term, .term-sm)
- **main Landmark**: Screen reader accessibility
- **robots.txt**: SEO crawler rules
- **sitemap.xml**: 10 docs URLs with priorities
- **Enhanced Schemas**: SoftwareApplication + FAQPage JSON-LD
- **Cloudflare Analytics**: Web Analytics + Zaraz tracking
- **MCP Tools**: 9 tools (get/set memory, branches, commit, sync, lock, health)

### Fixed
- **Code Block HTML**: Proper nesting `<pre><code>...</code></pre>`
- **Malformed Tags**: Missing </code> close tags
- **Inline Styles**: Reduced from 6 to 0

### Changed
- **CLI Code Block**: Now uses `<pre class="term"><code>`