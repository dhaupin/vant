<!--
GitHub Discussion post - paste everything below the title into a new
discussion (category suggestion: Announcements). One-time post for the
axolotl -> main merge (PR #91). Doc links go live the moment the merge
lands and Cloudflare Pages redeploys the docs site.
-->

# Vant 0.9 is coming to main: your brain becomes multi-brain (you probably have to do nothing)

## What's happening

We are merging `axolotl` into `main` (PR #91, about 653 commits). Main goes
from v0.8.x to the 0.9 layout. The headline change: **Vant is multi-brain
now** - your memory stops being one flat folder and becomes named brains
with a stack, safer locking, and an automatic bridge that brings old
installs across. This post is the short version; the links at the bottom
are the long version.

## What "multi-brain" means now

Every brain is a named directory in both scopes, and `models/state.json`
holds the active stack:

```text
models/
  public/vant/
  public/nova/
  private/vant/
  private/nova/
  state.json            { "stack": ["nova", "vant"], ... }
```

- **Named brains:** several memory contexts in one install, switched by name.
- **A stack:** the loader checks your current brain first, then falls back
  through the stack, so a shared template brain can sit underneath a
  project brain.
- **Dual-mode reads:** reads check the current brain's root first, then the
  public root. Pin a scope when you do not want the fallback.
- **Same file formats:** markdown as always, plus JSON, YAML, and INI
  through the same read/save API.

## What happens to your existing install

If you run main today (including the Docker Hub image): **nothing about
your memory is lost, and you do not have to hand-move files.** On the first
`vant start` after upgrading, the migration detects your old layout by
content, imports it as a first-class brain, and prints a banner saying
which brain name it used. Detection is by content, not by a marker alone,
so it cannot be fooled by a stale flag file.

The one thing you might want to choose is the **name** of your imported
brain, picked in this order:

1. `--brain-name <name>` if you pass it
2. the brain-name environment variable, if your environment sets one
3. the default: `vant`

## Three lanes, pick one

**Lane 1 - do nothing.** `vant start` migrates you automatically. Done.

**Lane 2 - look first.** Preview without touching anything:

```bash
vant migrate --dry-run     # what would move, changes nothing
vant migrate --status      # layout version + detection evidence
```

**Lane 3 - migrate on your terms:**

```bash
vant migrate --brain-name mybrain   # choose the name, then:
vant migrate                        # apply the import
```

Already on the new layout? `vant migrate` is a no-op and says so.

## How the import keeps your memory safe

| Guarantee       | What it means                                                          |
|-----------------|------------------------------------------------------------------------|
| Content-based   | Detection reads your files, never trusts a marker alone                |
| Existing-wins   | A live brain file is never clobbered                                   |
| Symlink-safe    | The import never follows links out of `models/`                        |
| Verified        | The import must read back through the real loader before it succeeds   |
| Marked honestly | If verification fails, the success marker is withheld and the next run retries |
| Idempotent      | Re-runs are no-ops; a missing marker falls back to content detection   |

## Links

- Migration Guide (the full contract, naming rules, troubleshooting):
  https://docs.creadev.org/vant/getting-started/migration
- Setup (where the upgrade section lives):
  https://docs.creadev.org/vant/getting-started/setup
- The Brain (the new layout and read API):
  https://docs.creadev.org/vant/memory/brain
- Multi-brain (stacks, switching, agents per brain):
  https://docs.creadev.org/vant/multi-agent/brains
- CLI Reference (`vant migrate` flags):
  https://docs.creadev.org/vant/reference/cli
- MCP Tools (`brain_migration_status`):
  https://docs.creadev.org/vant/reference/mcp-tools
- Deploy (Docker, ports, TLS): https://docs.creadev.org/vant/getting-started/deploy
- Repo deploy notes: https://github.com/dhaupin/vant/blob/main/DEPLOY.md
- The merge itself: https://github.com/dhaupin/vant/pull/91

## What else shipped in this release (brief rundown)

- **The lock system:** a cross-process mutex plus a lease system with
  takeover on holder death, live-fired against SIGKILL storms, chained
  holder deaths, and replant attacks; a CI gate fails on any ad-hoc lock
  path. The final fix in the branch closed a real race where a descheduled
  agent could delete a competitor's fresh lock and double-hold a lease.
- **Security hardening:** deny-by-default agents and MCP, explicit
  escalation, argv-array git connectors, traversal and symlink-escape
  refusal in storage, and a fix for a REST auth bypass where a present-but-
  wrong API key was accepted.
- **Deploy truth:** the Docker image actually installs its dependencies
  now (non-root, healthcheck), the port map is coherent (REST 3456, MCP
  3457, webhooks 3467, health 3468, mesh 4890-4892), and the docs were
  audited against reality by lint gates.
- **Two end-to-end tours** drive the real CLIs and the real MCP door the
  way a user or agent would, on fresh-clone fixtures.

## Notes and known gaps

- The Docker Hub image updates after a build from the new main lands; if
  you pull right after the merge you may briefly get the previous image.
- `vant migrate --dry-run` is always safe. If anything looks wrong, that
  plus `vant migrate --status` is the fastest way to show us what the
  detection sees.
- Problems after upgrading: open an issue or drop a comment here. Include
  the output of `vant migrate --status` and `vant health`.

Feedback welcome - especially from anyone running an old install with
weird layouts. That is exactly what the content-based detection was built
for.
