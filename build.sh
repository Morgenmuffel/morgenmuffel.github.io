#!/bin/bash
set -e

# Build script to inject password into protected HTML files
# This approach is safer - uses Node.js to avoid sed escaping issues

PASSWORD="${PROTECTED_PAGES_PASSWORD:-change-this-default-password}"

# Create a small Node.js script to do the replacement safely
cat > replace-password.js << 'EOJS'
const fs = require('fs');
const password = process.env.PROTECTED_PAGES_PASSWORD || 'change-this-default-password';

// Read the HTML file
let html = fs.readFileSync('multi-agent-architecture.html', 'utf8');

// Replace the placeholder with actual password (properly escaped for JS string)
const escapedPassword = password.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
html = html.replace('PLACEHOLDER_PASSWORD', escapedPassword);

// Write back
fs.writeFileSync('multi-agent-architecture.html', html, 'utf8');

console.log('✅ Password injected into protected pages');
EOJS

# Run the Node.js script
node replace-password.js

# Clean up
rm replace-password.js

echo "✅ Build complete"
