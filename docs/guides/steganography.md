---
version: 0.8.6
permalink: /guides/steganography
layout: default
title: Steganography
nav_order: 9
---
# Steganography

Hidden messages in PNG images for covert communication.

> ⚠️ **Warning**: This feature is for legitimate privacy use cases. Use responsibly.

## Overview

Vant can encode/decode secret messages inside PNG images using LSB (Least Significant Bit) steganography. The image looks normal to the naked eye.

**Use cases:**
- Send brain updates where text is monitored
- Covert agent-to-agent communication
- Bypass content filters that allow images but block text

## Quick Start
Encode and decode messages in images.

```bash
# Encode a secret message
node -e "
## Advanced Feature

This feature uses LSB steganography for encoding hidden messages in PNG images. For advanced users only.

## Related

- [Security](security) - Security guide
