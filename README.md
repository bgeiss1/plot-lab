# Plot Lab

matplotlib practice for MIP 662. Students write real Python in the browser (Pyodide, bundled in
`vendor/pyodide/`), see the figure their code draws, and get a list of checks that read the
figure itself. Eleven lessons, 31 exercises, all using course-style data (pLDDT, GROMACS energies
and RMSD, iPTM / ipAE, PAE). Ungraded practice: progress lives in each student's browser.

## Run it locally

```bash
cd ~/Desktop/Code/MIP662_practice_tool/plot-lab
node serve.mjs                 # http://localhost:8005/  and  http://localhost:8005/admin.html
```

No Node on the Mac? Use the copy inside VS Code:

```bash
ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app/Contents/MacOS/Code" serve.mjs
```

`bash tools/make_app.sh` builds **Plot Lab Dashboard.app** on the Desktop. Double clicking it
starts the server (port 8005) and opens the dashboard.

The pages must be opened through a server (not by double clicking the .html file), because
Python runs in a web worker and browsers do not allow workers from `file://`.

## Edit lessons

`admin.html` (local only, never published) edits `data/lessons.json`: lesson readings, each
exercise's task, starting code, answer, check code and hints. **Test this exercise** runs the
answer and the starting code through the checks in the same Python students use. **Test every
exercise** does all of them (about 15 seconds). **Save** writes the file and keeps a backup in
`data/backups/`. **Publish** commits `data/lessons.json` and pushes.

### How checking works

After the student's code runs, the exercise's check code runs in the same Python. It reads the
figure the student made through helpers in `py/plotlab.py` (`lines()`, `line_y()`,
`scatters()`, `bar_heights()`, `images()`, `xlabel()`, `has_hline(70)`, `saved("x.png")`
and others, all listed in the dashboard) and calls `check(what, condition, hint)` for each thing
it wants to confirm. Because the checks read the figure and not the code, any correct way of
writing the code passes (`plt.` or the Axes style, any colour spelling, and so on).

## Tests

```bash
npm test
# or: ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app/Contents/MacOS/Code" tests/run.mjs
```

Checks the lessons file, the style rules on all prose, the server, the Pages build, and (when a
Python with numpy and matplotlib is around) runs every exercise: each answer must pass all its
checks and no starting code may.

## Data

`data/files/` is the working folder of every exercise. `tools/make_data.py` rebuilds the files
and says which are real (the magainin 2 GROMACS run, the BindCraft2 campaign counts) and which
are made-up examples (pLDDT profile, 96 designs, PAE matrix). The site labels each one the same
way, so no student is told an example is a measurement.

## Publish

See `PUBLISH.md`.
