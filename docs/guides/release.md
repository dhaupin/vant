---
permalink: /guides/release.html
layout: default
title: Release Process
---
# Release Process

How to release a new version of Vant.

## Versioning

Vant uses [Semantic Versioning](https://semver.org/):

```
MAJOR.MINOR.PATCH
v0.8.4
```

| Type | Example | When |
|------|---------|-------|
| PATCH | 0.8.4 → 0.8.5 | Bug fixes |
| MINOR | 0.8.4 → 0.9.0 | New features |
| MAJOR | 0.8.4 → 1.0.0 | Breaking changes |

## Release Checklist

### 1. Pre-Release

- [ ] All tests pass
- [ ] No lint errors
- [ ] Update CHANGELOG.md
- [ ] Update version in lib/version.js

### 2. Release

```bash
# Bump version
vant bump         # patch
vant bump minor   # minor
vant bump major  # major

# Tag and push
git push origin main --tags
```

### 3. Post-Release

- [ ] Verify CI passes
- [ ] Update GitHub release notes
- [ ] Announce (if applicable)

## Bump Command

```bash
# Patch release (0.8.4 → 0.8.5)
vant bump

# Minor release (0.8.4 → 0.9.0)
vant bump minor

# Major release (0.8.4 → 1.0.0)
vant bump major
```

## Git Tags

Tags are created automatically:

```bash
# List tags
git tag -l

# Push tags
git push origin main --tags
```

## GitHub Releases

After pushing tags:

1. Go to [Releases](https://github.com/dhaupin/releases)
2. Click "Draft a new release"
3. Select the tag
4. Add release notes
5. Publish

## Docker Tags

```bash
# Build and push
docker build -t dhaupin/vant:v0.8.5 .
docker push dhaupin/vant:v0.8.5

# Latest tag
docker tag dhaupin/vant:v0.8.5 dhaupin/vant:latest
docker push dhaupin/vant:latest
```

See also: [CLI Reference](/vant/reference/cli.html), [Docker](/vant/guides/docker.html)