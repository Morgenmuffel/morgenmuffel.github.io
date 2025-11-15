#!/bin/bash
set -e

# Build script to inject password into protected HTML files
# This approach is safer - uses Node.js to avoid sed escaping issues

PASSWORD="${PROTECTED_PAGES_PASSWORD:-change-this-default-password}"

# List of files to protect (add new files here)
PROTECTED_FILES=(
  "multi-agent-architecture.html"
  # Add more files like this:
  # "another-project.html"
  # "secret-page.html"
)

# Create a small Node.js script to do the replacement safely
cat > replace-password.js << 'EOJS'
const fs = require('fs');
const password = process.env.PROTECTED_PAGES_PASSWORD || 'change-this-default-password';

// Get files from command line arguments
const files = process.argv.slice(2);

// Properly escape password for JS string
const escapedPassword = password.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

let count = 0;
files.forEach(file => {
  if (fs.existsSync(file)) {
    // Read the HTML file
    let html = fs.readFileSync(file, 'utf8');

    // Replace the placeholder with actual password
    html = html.replace('PLACEHOLDER_PASSWORD', escapedPassword);

    // Write back
    fs.writeFileSync(file, html, 'utf8');
    console.log(`  ✓ ${file}`);
    count++;
  } else {
    console.log(`  ⚠ ${file} not found, skipping`);
  }
});

console.log(`✅ Password injected into ${count} protected page(s)`);
EOJS

# Run the Node.js script with all protected files
node replace-password.js "${PROTECTED_FILES[@]}"

# Clean up
rm replace-password.js

echo "✅ Build complete"
