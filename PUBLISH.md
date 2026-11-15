# Publishing Plot Lab to GitHub Pages

Same setup as the GROMACS, BindCraft2 and RFD4 sites. The workflow builds the student pages
with `tools/build_pages.sh` (which leaves out `admin.html`, `js/admin.js`, `serve.mjs`, the
tests and the data scripts) and adds a `noindex` tag, so the site is reachable by link but not
listed by search engines.

## 1. Create the workflow file

A cloud session cannot write files under `.github/workflows/`, so paste this:

```bash
cd ~/Desktop/Code/MIP662_practice_tool/plot-lab
mkdir -p .github/workflows
cat > .github/workflows/pages.yml <<'YML'
# Publishes the student pages (not the dashboard) to GitHub Pages on every push to main.
# Settings > Pages > Source must be "GitHub Actions".
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
```

matplotlib 3.10.8 is the version inside the bundled Pyodide, so the tests check the exercises
against the same matplotlib the students run.

## 2. Create the repo and turn on Pages

```bash
cd ~/Desktop/Code/MIP662_practice_tool/plot-lab
chmod +x tools/*.sh
npm test        # or the VS Code node line from README.md

git init -b main
git config user.name "Brian Geiss"
git config user.email "128843394+bgeiss1@users.noreply.github.com"
git add -A
git commit -m "Plot Lab: matplotlib practice for MIP 662"
gh repo create bgeiss1/plot-lab --public --source=. --remote=origin --push
gh api -X POST repos/bgeiss1/plot-lab/pages -f build_type=workflow
```

If the last line says Pages already exists, set it in the web interface instead:
**Settings, then Pages, then Source: GitHub Actions**.

The site lands at <https://bgeiss1.github.io/plot-lab/> a minute or two after the Actions
run goes green. It is about 27 MB, most of it Pyodide.

## Afterwards

The dashboard's **Publish** button commits `data/lessons.json` and pushes, which redeploys the
site. Drop `NOINDEX=1` from the workflow when you want search engines to list it.
