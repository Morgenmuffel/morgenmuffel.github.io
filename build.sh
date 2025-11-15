#!/bin/bash

# Build script to inject password into protected HTML files
# Runs during Vercel deployment

# Get password from environment variable
PASSWORD="${PROTECTED_PAGES_PASSWORD:-change-this-default-password}"

# Replace placeholder in multi-agent-architecture.html
sed -i "s/PLACEHOLDER_PASSWORD/$PASSWORD/g" multi-agent-architecture.html

echo "✅ Password injected into protected pages"
echo "✅ Build complete"
