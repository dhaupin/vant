# Security Policy

Vant is security-first software: fail-closed gates, HMAC-signed wire
traffic, capability sandboxes, and adversarial live-fire passes are part
of how it is built — and logged in the public build record. When you
find a hole, you've found something we genuinely want.

## Supported versions

Security fixes land on the active development branch and ship in the
next release. Vant is a young, fast-moving project — the best
mitigation is staying current.

| Version | Supported |
|---------|-----------|
| latest release | ✅ |
| older releases | ❌ (upgrade) |

## Reporting a vulnerability

**Do not open a public issue for anything exploitable.**

Use [GitHub's private vulnerability reporting](https://github.com/dhaupin/vant/security/advisories/new):
it is private to maintainers, keeps a paper trail, and lets us credit
you on the fix.

Please include:

- What you found and the impact you assess (worst case, honestly stated)
- A reproduction — a probe script, request sequence, or test that
  demonstrates it
- Which surface: lib module, CLI, MCP tool, crew-bus transport, HTTP
  server, docs-claimed-but-wrong behavior (phantom endpoints count —
  we document what we defend)

If the finding involves the mesh protocol (crew-bus envelopes, genesis,
sync legs), note whether it breaks scope isolation, wire authenticity,
or the merge-only invariants — those are the trust boundaries that
matter.

## What to expect

1. **Acknowledgment** within a few days of the report.
2. **Fix in a logged pass** — the project fixes live-fire style: a
   reproduction first, the fix second, a pinned test third (see the
   pass history; security fixes are always pinned).
3. **Credit** in the fix commit and changelog, unless you prefer
   anonymity.
4. **Coordination** on disclosure timing — we won't sit on a real hole,
   but we'll work with you on the landing order.

## Scope notes

- In scope: everything in the repo — including the docs' claims (a
  documented endpoint that behaves differently than documented is a
  security bug here, by policy).
- Out of scope: social engineering, volumetric DoS against self-hosted
  instances, and findings requiring physical access.
- The transport binds to loopback by default (`VANT_WEBHOOK_BIND` and
  `VANT_MCP_BIND` are the explicit opt-outs); network-exposed
  deployments are the reporter's strongest ground — but local
  privilege/sandbox escapes are equally wanted.
