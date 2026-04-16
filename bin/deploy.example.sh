#!/bin/bash
# VANT Deploy Example - Build and deploy to Docker
#
# COPY THIS FILE AND REMOVE .example TO USE
# Edit the values before running
#
# Usage: ./deploy.example.sh [--push] [--tag v0.5.8]
#   --push: Push to registry after build
#   --tag:  Docker tag (default: latest)

set -e

TAG=${2:-latest}
PUSH=false

if [[ "$1" == "--push" ]]; then
    PUSH=true
    TAG=${2:-latest}
fi

# EDIT THESE VALUES FOR YOUR SETUP
IMAGE="vant:${TAG}"
REGISTRY="docker.io/YOUR_USERNAME/vant"

echo "╔═══════════════════════════════════════╗"
echo "║       VANT Deploy Example            ║"
echo "╚═══════════════════════════════════════╝"
echo "Image: $IMAGE"
echo ""

# Check docker
if ! command -v docker &> /dev/null; then
    echo "⚠️  Docker not found"
    exit 1
fi

# Build
echo "→ Building $IMAGE..."
docker build -t $IMAGE .

# Push (optional)
if [ "$PUSH" = true ]; then
    echo "→ Pushing to $REGISTRY..."
    docker push $IMAGE
    echo "✓ Deployed: $IMAGE"
else
    echo "✓ Built: $IMAGE (use --push to deploy)"
fi