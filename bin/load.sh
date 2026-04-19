#!/bin/bash
# VANT Loader - Load a specific model version
#
# Usage: ./load.sh [version]
#   version: Model version to load (default: latest)
#
# Sets up environment and loads brain

VERSION=${1:-latest}
MODEL_DIR="models"
STATE_DIR="states"

echo "Loading VANT..."
echo "Version: $VERSION"

if [ "$VERSION" = "latest" ]; then
    # Find highest version
    VERSION=$(ls -1 "$MODEL_DIR" | grep -E '^v[0-9]' | sort -V | tail -1)
fi

echo "Loading brain from: $MODEL_DIR/$VERSION"

# Load identity
if [ -f "$MODEL_DIR/$VERSION/identity.txt" ]; then
    echo "Identity loaded: $(head -1 $MODEL_DIR/$VERSION/identity.txt)"
fi

# Set environment
export VANT_VERSION=$VERSION
export VANT_MODEL_PATH="$MODEL_DIR/$VERSION"
export VANT_STATE_PATH="$STATE_DIR"

echo "VANT ready. The Covenant persists."