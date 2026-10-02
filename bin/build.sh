#!/bin/bash
# Build VANT for distribution
#
# (pass 96) Was stale + broken: hardcoded "VANT v0.5.0" while the package is
# 0.8.6, and copied `states` and `REGISTRY.txt` which no longer exist (the
# cp errors were silent without set -e). Version is now read from
# package.json and absent files are skipped. The output dir is wiped first
# so repeat builds don't accumulate stale files.

OUTPUT="dist/vant-bundle"
rm -rf "$OUTPUT"
mkdir -p "$OUTPUT"

VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
echo "Building VANT v$VERSION..."

# Copy models
echo "Bundling models..."
cp -r models "$OUTPUT/"

# Copy core files (only those that exist)
echo "Bundling core files..."
for f in README.md LICENSE REGISTRY.txt; do
    if [ -e "$f" ]; then cp "$f" "$OUTPUT/"; fi
done

# Copy loaders
mkdir -p "$OUTPUT/bin"
cp bin/* "$OUTPUT/bin/"

# Make executables
if [ -e "$OUTPUT/bin/load.sh" ]; then chmod +x "$OUTPUT/bin/load.sh"; fi

# Create version info
cat > "$OUTPUT/VERSION" << EOF
VANT v$VERSION
Built: $(date -Iseconds)
Commit: $(git rev-parse HEAD 2>/dev/null || echo "unknown")
EOF

echo "Build complete: $OUTPUT"
echo "To run: cd $OUTPUT && ./bin/load.sh"
