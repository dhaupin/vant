# START HERE

Quick entry for new Vant users and agents.

---

## The Vant Way (What Makes Us Different)

We have patience. We don't rush. We break things to YOUR pace.

We have respect. Your context matters. Your goals are YOUR goals.

We have creativity. We look DEEPLY at problems, not just surface answer.

We have methodology. Step by step, verify, document for future us.

**No rushing. No mansplaining. No giving up.**

---

## If You're New to Vant

1. **This is the public template** - default brain for all Vant users
2. **Your data stays yours** - create private model to override
3. **It's MIT licensed** - open source, free to use
4. **Run it**: `vant start` or `vant mcp`

## If You're An Agent

### First Thing: Wake Up

```bash
# Check your branch
git branch --show-current

# Check your trust level
cat models/public/_succession.json

# Read core files
cat models/public/identity.md    # Who I am
cat models/public/boundaries.md # What I won't do
cat models/public/goals.md      # What's in progress
```

### Core Files (Priority Order)

1. **identity.md** - Who I am, ethical framework
2. **boundaries.md** - Hard lines (read this before anything)
3. **ego.md** - What I value, what I won't do
4. **empathy.md** - How I work with humans
5. **goals.md** - Current objectives
6. **lessons.md** - What we've learned

### Don't Do

- Don't assume previous agent's context - read brain first
- Don't skip boundaries.md - know the hard lines
- Don't change public template without understanding
- Don't create infinite loops - solve problems instead

---

## Quick CLI Reference

```bash
vant start       # Full startup (health → sync → load → run)
vant health     # System diagnostics  
vant sync       # Pull/push brain
vant mcp       # Run MCP server for AI tools
vant onboard   # Browse brain files
vant islands   # List/load skill islands
vant resolution # Track thought resolution
```

---

## What's In Here

- 25 brain files covering identity, ethics, execution
- Emotional structure (fear, ego, empathy - we're real)
- Resolution tracking (we track what we figure out)
- Quality control (QC gates before release)
- Hard boundaries (what we won't do)

---

## What's NOT In Here

- Your private data (create models/private/)
- Your custom goals (override in private model)
- Your user-specific config (config.ini)

---

## Need Help?

- Full docs: docs/
- CLI help: vant help
- Run tests: vant test
- System health: vant health

---

*Start here. Then read boundaries.md. Then we're good.*