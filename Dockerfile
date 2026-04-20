# VANT - Open Source Edition
# A persistent AI agent system with memory persistence
# 
# Multi-arch support: amd64 (x86_64) and arm64 (Apple Silicon, Raspberry Pi)
# 
# Usage:
#   # Build for current platform
#   docker build -t vant .
#   
#   # Build multi-arch (requires docker buildx)
#   docker buildx create --name vant-builder
#   docker buildx use vant-builder
#   docker buildx build --platform linux/amd64,linux/arm64 -t dhaupin/vant --push .
#
# Environment:
#   GITHUB_TOKEN - Required for sync
#   GITHUB_REPO  - Required (owner/repo)

ARG VERSION=0.8.3
FROM node:20-alpine

LABEL maintainer="VANT Project"
LABEL description="VANT AI Agent System - Open Source"
LABEL org.opencontainers.image.title="VANT"
LABEL org.opencontainers.image.description="Persistent AI Agent Memory System"
LABEL org.opencontainers.image.source="https://github.com/dhaupin/vant"
LABEL org.opencontainers.image.version="${VERSION}"

WORKDIR /app

# Copy public files
COPY bin/ ./bin/
COPY lib/ ./lib/
COPY models/public/ ./models/public/
COPY config.example.ini ./
COPY settings.example.ini ./
COPY mood.example.ini ./
COPY .env.example ./
COPY README.md ./
COPY CLI.md package.json ./

# Default config
ENV VANT_VERSION=${VERSION}
ENV NODE_ENV=production

# Expose for health endpoint
EXPOSE 3000

# Multi-arch: create platform-specific symlinks for node
RUN if [ "$(uname -m)" = "aarch64" ]; then \
      apk add --no-cache python3 make g++; \
    fi

CMD ["node", "bin/vant.js", "health"]