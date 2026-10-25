---
version: 0.8.6
permalink: /discussions
layout: default
title: Release Posts
description: The family docs/discussions release-post convention for vant - one file per release, the file IS the post, drafted against shipped versions only.
nav_order: 140
---

# Release posts (docs/discussions)

The release trail lives in the same tree as the changelog it summarizes.
One file per release announcement, dropped into a GitHub Discussions
post when the release goes live.

## Conventions (family-level, from crashtest's index)

Source of truth (link-not-copy):
https://github.com/dhaupin/crashtest/blob/main/docs/discussions/index.md

- **One file per release**: `docs/discussions/announcing-vX.Y.Z.md`.
- **The file IS the post**: below the frontmatter, the body is the
  announcement itself - no wrapper prose, no nested code fences. View
  the file, strip the frontmatter, paste. Posting mechanics stay HERE,
  in this index, never inside a post.
- **Draft against a RELEASED version only.** A post describing a version
  that is not on the registry yet is fiction by promotion. This applies
  with extra force to vant: until the first npm dist-tag exists, the
  first post waits for that landing.
- Frontmatter shape follows crashtest's first post:
  https://github.com/dhaupin/crashtest/blob/main/docs/discussions/announcing-v1.0.0.md

## Index

| Post | Version | Status |
|------|---------|--------|
| `announcing-v0.9.0.md` | next release | (not yet filed - draft only after the release is live) |

No posts yet. The first one is written the day vant's first release
actually ships, against the shipped version.
