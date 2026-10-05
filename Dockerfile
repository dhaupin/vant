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
#
# Pass 127 (remote-ready): installs runtime deps, runs as non-root, binds
# loopback INSIDE the container and publishes ports explicitly, healthcheck
# on the real REST endpoint. VANT_SERVER_BIND stays 127.0.0.1 on purpose:
# docker port publishing reaches loopback-bound servers; set 0.0.0.0 only
# when the container runs on a host network.

ARG VERSION=0.8.6
FROM node:20-alpine

LABEL maintainer="VANT Project"
LABEL description="VANT AI Agent System - Open Source"
LABEL org.opencontainers.image.title="VANT"
LABEL org.opencontainers.image.description="Persistent AI Agent Memory System"
LABEL org.opencontainers.image.source="https://github.com/dhaupin/vant"
LABEL org.opencontainers.image.version="${VERSION}"

WORKDIR /app

# Copy manifests first so dependency install layers cache independently of
# source changes. (Pass 127: the image previously shipped NO node_modules -
# every command died with MODULE_NOT_FOUND for chalk/js-yaml/yaml.)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy public files
COPY bin/ ./bin/
COPY lib/ ./lib/
COPY models/public/ ./models/public/
COPY index.js ./
COPY config.example.ini ./
COPY settings.example.ini ./
COPY mood.example.ini ./
COPY .env.example ./
COPY README.md ./

# Default config
ENV VANT_VERSION=${VERSION}
ENV NODE_ENV=production
# Ports (REST 3456, MCP 3457, webhooks 3467, metrics/health 3468)
ENV VANT_SERVER_PORT=3456
ENV VANT_MCP_PORT=3457
ENV VANT_WEBHOOK_PORT=3467
ENV VANT_HEALTH_PORT=3468
# Loopback INSIDE the container by default - publish ports with -p, or set
# VANT_SERVER_BIND=0.0.0.0 when running with --network host on a VPS.
ENV VANT_SERVER_BIND=127.0.0.1
ENV VANT_MCP_BIND=127.0.0.1

# Expose for REST (3456) and MCP (3457) servers
EXPOSE 3456 3457

# Multi-arch: create platform-specific symlinks for node
RUN if [ "$(uname -m)" = "aarch64" ]; then \
      apk add --no-cache python3 make g++; \
    fi

# Non-root runtime: chown app tree (models/private is runtime-writable state)
RUN addgroup -S vant && adduser -S -G vant vant \
    && mkdir -p /app/models/private /app/models/state.json \
    && touch /app/models/state.json \
    && chown -R vant:vant /app
USER vant

# Healthcheck: the REST server answers /health (lib/server.js). A bare
# container (default CMD) exits 0 after checks by design - do not mark the
# default command container "unhealthy" for that; HEALTHCHECK applies to
# server-mode containers (see docker-compose.yml).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3456/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Long-running runtime: MCP (3457) + REST (3456) servers via startFull('all')
# (pass 127 fixed 'all' mode - it previously started neither server).
CMD ["node", "bin/vant.js", "all"]
