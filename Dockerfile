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
# all interfaces INSIDE the container, healthcheck on the real REST endpoint.
# Inside a container, 0.0.0.0 is the correct default: docker -p forwards to
# the container's eth0 IP, so a loopback-bound server would be unreachable
# through published ports. Exposure is controlled at the host edge - publish
# with -p 127.0.0.1:3456:3456 to keep the port off the host network, or
# behind a reverse proxy with TLS. The plaintext-HTTP rule (lib/server.js)
# allows loopback binds by default; startFull('all') opts into plaintext
# for exactly this container shape and warns on non-loopback plaintext.
# For direct TLS, mount certs and set VANT_SERVER_CERT/VANT_SERVER_KEY.

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
# All-interfaces INSIDE the container (docker -p forwards to the container
# IP, so loopback binds would be unreachable). Restrict at the host edge:
#   docker run -p 127.0.0.1:3456:3456 ...   # publish on host loopback only
ENV VANT_SERVER_BIND=0.0.0.0
ENV VANT_MCP_BIND=0.0.0.0

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
