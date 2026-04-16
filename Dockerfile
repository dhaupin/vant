# VANT - Open Source Edition
# A persistent AI agent system with memory persistence
# 
# Usage:
#   docker build -t vant .
#   docker run dhaupin/vant
#
# Environment:
#   GITHUB_TOKEN - Required for sync
#   GITHUB_REPO  - Required (owner/repo)

FROM node:20-alpine

LABEL maintainer="VANT Project"
LABEL description="VANT AI Agent System - Open Source"

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
ENV VANT_VERSION=0.8.0
ENV NODE_ENV=production

# Expose for any future network features
EXPOSE 3000

CMD ["node", "bin/vant.js", "health"]