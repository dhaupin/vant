# QC - Quality Control

Standards, checks, and validation rules for Vant brain.

---

## Build Standards

- All tests pass before release: `vant test` must be 14/14
- No breaking changes without major version bump
- Backward compatibility for at least 1 minor version

## Code Standards

- Use synchronous Node.js APIs where possible (simpler, more reliable)
- No external dependencies unless necessary (lib/ only)
- Console.log for output, no fancy loggers in public
- Error handling: catch, log, and recover

## Model Standards

- Memory files: .md preferred over .txt
- JSON for structured data (identity.json, meta.json)
- One concept per file
- No secrets in public model

## CLI Standards

- All commands: vant <command> --help for usage
- Help command shows all available commands
- Exit codes: 0 = success, 1 = error
- New: vant resolution - Thought status tracking

## Resolution System

- Track thoughts as resolved/deprecated/rejected
- `vant resolution resolve <file> <entry> <reason>` - Mark resolved
- `vant resolution deprecate <file> <entry> <reason>` - Mark deprecated
- `vant resolution reject <file> <entry> <reason>` - Mark rejected
- Frontmatter updates directly in brain files: headings and bullets

## New Features

- vant mcp - MCP server for AI tool integrations
- vant onboard - Onboarding wizard for new brains
- vant succession - Brain version/trust management
- vant bot - Telegram bot integration
- vant watch - Monitor GitHub for updates

## Testing

- Run: `node bin/vant.js test`
- Include health check: `vant health`
- Include load check: `vant load`

---

## QC Check List

Before any release:
- [ ] All tests pass
- [ ] Health check passes
- [ ] Load check passes  
- [ ] No .txt files in public model (convert to .md)
- [ ] CHANGELOG updated
- [ ] VERSION in lib/config.js updated
- [ ] Resolution system tested (`vant resolution status`)
