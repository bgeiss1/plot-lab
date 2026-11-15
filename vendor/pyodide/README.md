# Pyodide 314.0.7 (only the parts Plot Lab uses)

Copied from the official release, https://github.com/pyodide/pyodide/releases/tag/314.0.7
(pyodide-314.0.7.tar.bz2): the core files (pyodide.js, pyodide.mjs, pyodide.asm.mjs,
pyodide.asm.wasm, python_stdlib.zip, pyodide-lock.json, package.json) and the wheels for numpy,
matplotlib and their dependencies (contourpy, cycler, fonttools, kiwisolver, packaging, pillow,
pyparsing, python-dateutil, pytz, six). About 26 MB.

Kept in the repo, rather than loaded from a CDN, so the site works on any network that can
reach GitHub Pages and the version never changes underneath the lessons.

Pyodide is distributed under the Mozilla Public License 2.0. numpy, matplotlib and the other
packages keep their own licences, which are inside each wheel.

To upgrade: download a newer release tarball, replace these files with the same names from it
(the wheel names change with versions, so copy the ones pyodide-lock.json lists for numpy and
matplotlib and their dependencies), then run the tests and open a lesson.
