#!/bin/bash
# Build VANT for distribution

OUTPUT="dist/vant-bundle"
mkdir -p "$OUTPUT"

echo "Building VANT..."

# Copy models
echo "Bundling models..."
cp -r models "$OUTPUT/"

# Copy states (template)
echo "Bundling states..."
cp -r states "$OUTPUT/"

# Copy core files
cp README.md LICENSE REGISTRY.txt "$OUTPUT/"

# Copy loaders
mkdir -p "$OUTPUT/bin"
cp bin/* "$OUTPUT/bin/"

# Make executables
chmod +x "$OUTPUT/bin/load.sh"

# Create version info
cat > "$OUTPUT/VERSION" << EOF
VANT v0.5.0
Built: $(date -Iseconds)
Commit: $(git rev-parse HEAD 2>/dev/null || echo "unknown")
EOF

echo "Build complete: $OUTPUT"
echo "To run: cd $OUTPUT && ./bin/load.sh"