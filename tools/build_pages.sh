#!/usr/bin/env bash
# Copies the student pages into a folder for GitHub Pages. Leaves out the lesson dashboard
# (admin.html, js/admin.js), the local server, the tests, the data scripts and every backup.
#   bash tools/build_pages.sh _site            (NOINDEX=1 asks search engines not to list it)
set -euo pipefail
out=${1:-_site}
cd "$(dirname "$0")/.."
rm -rf "$out" && mkdir -p "$out/data" "$out/js" "$out/py"

for f in *.html; do [ "$f" = admin.html ] || cp "$f" "$out/"; done
cp -R css vendor "$out/"
[ -d img ] && mkdir -p "$out/img" && find img -maxdepth 1 -type f ! -name "*.md" -exec cp {} "$out/img/" \;
for f in js/*.js; do [ "$f" = js/admin.js ] || cp "$f" "$out/js/"; done
cp py/plotlab.py "$out/py/"
cp data/lessons.json "$out/data/"
cp -R data/files "$out/data/"

if [ "${NOINDEX:-}" = 1 ]; then
  perl -pi -e 's#<head>#<head>\n<meta name="robots" content="noindex, nofollow">#' "$out"/*.html
fi
touch "$out/.nojekyll"
echo "built $out: $(find "$out" -type f | wc -l | tr -d ' ') files, $(du -sh "$out" | cut -f1)"
