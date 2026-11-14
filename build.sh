#!/bin/bash
set -e
# Vercel build step. The site is static and already built:
#   - case-study pages are generated locally with `npm run build` (scripts/build.mjs) and committed;
#   - Dyver case studies are committed only as AES-GCM ciphertext, so no password is needed or injected here.
# This script just checks that the generated pages are present.
for f in index.html work/design-test-enrich.html work/conversational-flows-ai-health-coach.html assets/protected/key.json; do
  [ -f "$f" ] || { echo "Missing $f. Run npm run build locally and commit the output."; exit 1; }
done
echo "✅ Static site ready"
