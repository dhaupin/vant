# VANT - Open Source Edition
# A persistent AI agent system with memory persistence
# 
# Usage:
#   docker build -t vant .
#   docker run vant
#
# For full (private) version: https://github.com/dhaupin/VANT

FROM node:20-alpine

LABEL maintainer="VANT Project"
LABEL description="VANT AI Agent System - Open Source"

WORKDIR /app

# Copy public files
COPY bin/ ./bin/
COPY lib/ ./lib/
COPY models/public/ ./models/public/
COPY CLI.md package.json ./

# Default config
ENV VANT_VERSION=0.6.0
ENV NODE_ENV=production

# Quick start
RUN echo "#!/bin/sh\nnode bin/vant.js health" > /entry.sh && chmod +x /entry.sh

CMD ["node", "bin/vant.js", "health"]