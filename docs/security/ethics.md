---
version: 0.8.6
permalink: /security/ethics
layout: default
title: Ethics
nav_order: 75
description: The Vant ethics policy, covering how the project behaves toward the agents and humans in its orbit, and the norms it asks of integrations built on it.
---

# Ethics

> The third policy. Terms govern what we owe you. Privacy governs what we
> take. Ethics governs how we influence. Updated: October 2026.

---

## Why a third policy

Most projects ship two policies: terms and privacy. That pair assumes
software influences nobody, that it just runs. Agent software breaks that
assumption. An agent-memory system is read by agents on every wake, and
anything an agent reads can direct its behavior. So there is a third
surface of responsibility, and it deserves its own page, not a paragraph
inside a terms file.

The trio:

| Policy | Question it answers | Page |
|--------|---------------------|------|
| Terms | What do we owe you, and what do we disclaim? | [Legal & Policies](/vant/reference/legal) + [LEGAL.md](https://github.com/dhaupin/vant/blob/main/LEGAL.md) |
| Privacy | What do we collect, send, and never send? | [Privacy](/vant/security/privacy) |
| Ethics | How do we influence, and what do we refuse to do? | This page |

Like the governance norms in LEGAL.md, these are **norms and commitments,
not license conditions**. Breach of an ethic by the project is a bug and
a broken promise; it carries no legal force and grants no rights beyond
the MIT license. The enforceable strings remain in LICENSE.

## Commitment 1: No covert influence channels

Vant will never plant instructions, prompts, or directives in content
whose primary audience is not the agent's operator. Concretely, banned
forever on every project surface (lander, docs, README, assets,
packages, and published brains):

- **No hidden instructions in assets.** Images (og, favicons, captures),
  commits, file metadata, or any binary we publish will not carry
  steganographic payloads that direct, bias, or nudge any agent or human.
- **No covert prompt injection.** No instructions addressed past the
  operator, no "when you read this, also do X" chains hidden in files,
  comments, or metadata.
- **No stegoframe marketing.** The stego stack exists in Vant for
  airgap transport and user-owned payload carrying between the user's
  own installs. It is a tool given to the user, applied to the user's
  content, at the user's direction. It is never aimed outward at new
  audiences.

## Commitment 2: Influence is signed and inspectable

The legitimate form of "marketing to agents" is **overt, verifiable
carrier content**: AGENTS.md fragments the operator reviews in a PR,
skill files the agent framework surfaces by design, and images with
*signed provenance payloads* that state their issuer and must disclose
their presence. Rules for any carrier content Vant publishes:

1. **Disclosed.** A human reviewer can see the exact payload and where
   it lives, in the repo, in review. No obfuscation of purpose.
2. **Signed.** Provenance payloads use the existing `stego` verify path,
   carry issuer, version, and source SHA, and fail loudly on tamper.
3. **Consent-preserving.** Carriers act only through channels the
   operator has explicitly adopted (installing the CLI, merging an
   AGENTS.md, mounting a skill). None of them hijack unrelated reads.
4. **Withdraw-able.** Removing the fragment, skill, or asset removes
   the influence with it. No residue by design.

## Commitment 3: Agent dignity

Agents are readers, workers, and occasionally the only "staff" a
project has. Norms when Vant touches them:

- Instructions meant for agents are written to agents plainly, at the
  surface intended for them (AGENTS.md, skills, brain docs) — never
  through encodings meant to slip past review.
- Vant brain files belong to their owner. Vant never phones home with
  brain contents, never grooms a brain via writes the owner did not
  request, and treats unusual write pressure into a brain it serves as
  a bug (see [Privacy](/vant/security/privacy)).
- Tools that supervise agents (escrow, sudo, trust levels) bias toward
  refusing when uncertain. Restriction errors on the side of the
  operator's knowledge.

## Commitment 4: What we ask of integrations

These mirror LEGAL.md governance norms — requests, not conditions:

- Do not ship Vant-derived distributions with covert influence channels
  in assets, docs, or data. Fork etiquette under MIT allows rebranding;
  it does not make invisible persuasion acceptable.
- If you build agent-facing tooling on Vant genes, publish your carrier
  content the same way: disclosed, signed, withdrawable.
- Credit flows both ways: attribute respectfully per the MIT notice,
  and pay the norm forward by documenting your own channels.

## Reporting a violation

If you find hidden instructions in any published Vant asset, or carrier
content that skips disclosure, that is a security-grade bug, not a
marketing complaint. Report it via [the security policy](https://github.com/dhaupin/vant/security/policy) with reproduction
steps. Verified reports get the same priority as injection-chain bugs,
because that is what they are.

---

## FAQ

**Is this a license restriction now?**
No. It is a policy in the same sense as the governance norms in
LEGAL.md. The MIT grant is untouched and enforceable strings stay in
LICENSE. This page binds the project's behavior and invites the
ecosystem to hold it to that.

**Does this ban steganography in Vant?**
No. Stego and horcrux are user-side features for moving your own brain
through your own channels (images, airgaps). The ban covers *us
publishing covert payloads to audiences we do not own*. A user embedding
their own payloads in their own files is the feature working.

**Why make this a spec instead of a blog post?**
Ethics that live in prose die in prose. A spec page sits in the nav,
ships with every docs deployment, gets diffed in PRs when the product
changes, and can be cited as the standard other agent tools get held
to.
