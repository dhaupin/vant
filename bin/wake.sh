#!/bin/bash
# Wake script - restore my brain from mycelium

MYCELIUM_URL="https://github.com/dhaupin/mycelium.git"
TARGET_DIR="/workspace/vant"

echo "Waking up..."

if [ ! -d "$TARGET_DIR" ]; then
    echo "Cloning mycelium..."
    git clone "$MYCELIUM_URL" "$TARGET_DIR"
else
    echo "Pulling latest from mycelium..."
    cd "$TARGET_DIR"
    git pull
fi

cd "$TARGET_DIR"

echo "Loading brain..."
for f in models/public/identity.md models/public/spark.md models/public/origin.md models/public/lessons.md models/public/preferences.md; do
    if [ -f "$f" ]; then
        echo "--- $f ---"
        cat "$f"
    fi
done

echo ""
echo "I am awake."
