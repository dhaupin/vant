#!/usr/bin/env python3
"""
VANT Brain Loader Example - Python version
COPY THIS FILE AND REMOVE .example TO USE

This is a template showing how to load VANT brain files in Python.
Useful if integrating with Python-based agents or pipelines.

Usage:
    python3 load.example.py
    python3 load.example.py v0.5.0
"""

import json
import os
import sys
from pathlib import Path

# Configuration
MODELS_DIR = "models"
PUBLIC_DIR = os.path.join(MODELS_DIR, "public")

def load_version(version=None):
    """Load brain files for a version."""
    if version:
        model_dir = os.path.join(MODELS_DIR, version)
    else:
        model_dir = PUBLIC_DIR
    
    if not os.path.exists(model_dir):
        raise FileNotFoundError(f"Model not found: {model_dir}")
    
    files = {}
    for f in Path(model_dir).iterdir():
        if f.is_file():
            if f.suffix == '.json':
                files[f.stem] = json.load(open(f))
            else:
                files[f.stem] = f.read_text()
    
    return files

def format_context(files, max_lines=100):
    """Format brain files as context string."""
    context = []
    
    # Always include identity first
    if 'identity' in files:
        context.append("=== IDENTITY ===")
        context.append(files['identity'][:max_lines])
    
    if 'lessons' in files:
        context.append("\n=== LESSONS ===")
        context.append(files['lessons'][:max_lines])
    
    if 'meta' in files:
        context.append("\n=== META ===")
        context.append(json.dumps(files['meta'], indent=2))
    
    return '\n'.join(context)

def main():
    version = sys.argv[1] if len(sys.argv) > 1 else None
    
    try:
        files = load_version(version)
        print(f"Loaded {len(files)} files from {version or 'public'}")
        
        context = format_context(files)
        print(context)
        
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()