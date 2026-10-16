#!/usr/bin/env bash
# Build v2 and publish dist/ to the gh-pages branch (served at actionshrimp.com/bayeux-viewer/).
set -euo pipefail
cd "$(dirname "$0")"
npm run build
touch dist/.nojekyll
rev=$(git rev-parse --short HEAD)
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy v2 viewer (${rev})"
git push -q -f git@github.com:actionshrimp/bayeux-viewer.git gh-pages
rm -rf .git
echo "Deployed ${rev}. GitHub Pages usually updates within a minute."
