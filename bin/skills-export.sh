#!/bin/bash
# Agent Skills Export Utility
# Exports Vant brain as Agent Skills compatible format

set -e

SKILL_NAME="${1:-vant}"
OUTPUT_DIR="${2:-.}"
BRAIN_DIR="${3:-models/public}"

echo "Exporting Vant brain to Agent Skills format..."

# Create skill directory
mkdir -p "$OUTPUT_DIR/$SKILL_NAME"

# Copy skill manifest
cp "$BRAIN_DIR/vant/SKILL.md" "$OUTPUT_DIR/$SKILL_NAME/"

# Export brain files as references
mkdir -p "$OUTPUT_DIR/$SKILL_NAME/references"

# Copy key brain files
for file in identity goals lessons preferences errors audit; do
    if [ -f "$BRAIN_DIR/$file.md" ]; then
        cp "$BRAIN_DIR/$file.md" "$OUTPUT_DIR/$SKILL_NAME/references/" 2>/dev/null || true
    fi
done

# Copy succession config
if [ -f "$BRAIN_DIR/_succession.json" ]; then
    cp "$BRAIN_DIR/_succession.json" "$OUTPUT_DIR/$SKILL_NAME/references/"
fi

echo "Done! Skill exported to $OUTPUT_DIR/$SKILL_NAME/"
echo ""
echo "To use:"
echo "  1. Copy to your agent's skills directory"
echo "  2. Restart agent session"
echo "  3. Skill activates when memory/persistence is needed"