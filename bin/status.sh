#!/bin/bash
# VANT Status - Quick system status
# Usage: ./bin/status.sh

set -euo pipefail

echo "╔═══════════════════════════════════════╗"
echo "║          VANT Status v0.5.6           ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Config
if [ -f "config.ini" ]; then
    echo "--- Config ---"
    grep -E "^(VANT_VERSION|MODEL_PATH|STEGOFRAME_ROOM|GITHUB_BRANCH)=" config.ini || true
    echo ""
fi

# Model
if [ -d "models" ]; then
    echo "--- Brain ---"
    LATEST=$(ls -1 models | grep -E '^v' | sort -V | tail -1)
    echo "Latest model: $LATEST"
    if [ -f "models/$LATEST/identity.txt" ]; then
        head -1 models/$LATEST/identity.txt
    fi
    echo ""
fi

# Room
if [ -f "states/active/room-meta.json" ]; then
    echo "--- Stegoframe ---"
    ROOM=$(jq -r '.room' states/active/room-meta.json)
    POLLS=$(jq -r '.poll_count' states/active/room-meta.json)
    echo "Room: $ROOM | Polls: $POLLS"
    
    # Check expiry
    if command -v jq &> /dev/null; then
        CREATED=$(jq -r '.created_at' states/active/room-meta.json)
        if [ "$CREATED" != "null" ]; then
            AGE=$(($(date +%s) - $(date -d "$CREATED" +%s) / 86400))
            echo "Age: $AGE days"
        fi
    fi
    echo ""
fi

# Rate limit
if [ -f "states/active/rate-limit.json" ]; then
    echo "--- Rate Limit ---"
    REMAINING=$(jq -r '.max_per_hour - .requests_this_hour' states/active/rate-limit.json)
    echo "Remaining: $REMAINING/hr"
    echo ""
fi

# Mood
if [ -f "mood.ini" ]; then
    echo "--- Mood ---"
    grep "^MOOD=" mood.ini || true
fi

echo "The Covenant persists."