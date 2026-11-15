#!/usr/bin/env bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.."
REPO=bgeiss1/plot-lab
say() { printf '\n== %s\n' "$1"; }

say "1. The Pages workflow"
mkdir -p .github/workflows
cat > .github/workflows/pages.yml <<'YML'
# Publishes the student pages (not the dashboard) to GitHub Pages on every push to main.
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: actions/setup-python@v5
        with:
          python-version: '3.13'
      - run: pip install numpy matplotlib==3.10.8
      - run: npm test
      - run: NOINDEX=1 bash tools/build_pages.sh _site
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site
      - id: deploy
        uses: actions/deploy-pages@v4
YML
chmod +x tools/*.sh

say "2. Tests"
VSCODE="/Applications/Visual Studio Code.app/Contents/MacOS/Code"
if command -v node >/dev/null; then node tests/run.mjs
elif [ -x "$VSCODE" ]; then ELECTRON_RUN_AS_NODE=1 "$VSCODE" tests/run.mjs
else echo "No Node found, tests skipped here. GitHub runs them before every deploy."; fi

say "3. Git"
[ -d .git ] || git init -b main
git config user.name "Brian Geiss"
git config user.email "128843394+bgeiss1@users.noreply.github.com"
git add -A
git diff --cached --quiet || git commit -m "Plot Lab: matplotlib practice for MIP 662"

say "4. The GitHub repo ($REPO, public)"
if gh repo view "$REPO" >/dev/null 2>&1; then
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$REPO.git"
  git push -u origin main
else
  gh repo create "$REPO" --public --source=. --remote=origin --push --description "Plot Lab: matplotlib practice for MIP 662"
fi

say "5. GitHub Pages"
if gh api "repos/$REPO/pages" >/dev/null 2>&1; then
  gh api -X PUT "repos/$REPO/pages" -f build_type=workflow >/dev/null && echo "set to Actions"
else
  gh api -X POST "repos/$REPO/pages" -f build_type=workflow >/dev/null && echo "turned on"
fi
sleep 3
gh workflow run pages.yml --ref main 2>/dev/null && echo "deploy started" || echo "the push will deploy it"

say "6. The dashboard launcher"
bash tools/make_app.sh

say "Done"
echo "Live in about 2 minutes: https://bgeiss1.github.io/plot-lab/"
echo "Deploy progress:         https://github.com/$REPO/actions"
