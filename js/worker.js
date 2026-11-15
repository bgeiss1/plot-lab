// A module worker (Pyodide 314 needs one). Runs Python in the background so the page never freezes. Loads Pyodide (vendor/pyodide),
// numpy and matplotlib once, copies the practice data files into Python's working folder,
// then runs each piece of student code through py/plotlab.py.
//
// Messages in:  { id, type: 'init', files: [names] }
//               { id, type: 'run', code, check, dpi }
// Messages out: { type: 'status', text }      while loading
//               { id, type: 'ready' }
//               { id, type: 'result', result } result is plotlab.run()'s JSON
//               { id, type: 'failed', message }
import { loadPyodide } from '../vendor/pyodide/pyodide.mjs';

const base = new URL('../', self.location.href).href;
let py = null;
let data = {}; // file name -> bytes, rewritten before every run so a student can't damage them
const HOME = '/home/pyodide';

const say = text => self.postMessage({ type: 'status', text });

async function init(files) {
  say('Starting Python (the first visit downloads about 25 MB, later visits use the cached copy)...');
  py = await loadPyodide({ indexURL: base + 'vendor/pyodide/', stdout: () => {}, stderr: () => {} });
  say('Loading numpy and matplotlib...');
  await py.loadPackage(['numpy', 'matplotlib'], { messageCallback: () => {}, errorCallback: () => {} });
  say('Copying the data files...');
  const [src, ...bytes] = await Promise.all([
    fetch(base + 'py/plotlab.py').then(r => r.text()),
    ...files.map(f => fetch(base + 'data/files/' + f).then(r => {
      if (!r.ok) throw new Error(`data/files/${f} is missing`);
      return r.arrayBuffer();
    }))
  ]);
  files.forEach((f, i) => { data[f] = new Uint8Array(bytes[i]); });
  py.FS.mkdirTree('/plotlab');
  py.FS.writeFile('/plotlab/plotlab.py', src);
  py.runPython(`import sys\nsys.path.insert(0, '/plotlab')\nimport plotlab`);
  say('Warming up matplotlib...');
  py.runPython(`plotlab.run('import matplotlib.pyplot as plt\\nplt.plot([0, 1])', render=True)`);
}

// Empty the working folder and put the data files back, so every run starts the same way and
// a file saved by savefig in an earlier run can't make a check pass by accident.
function freshFolder() {
  py.FS.chdir(HOME);
  for (const name of py.FS.readdir(HOME)) {
    if (name === '.' || name === '..') continue;
    const path = `${HOME}/${name}`;
    try {
      if (py.FS.isDir(py.FS.stat(path).mode)) py.FS.rmdir(path); else py.FS.unlink(path);
    } catch { /* a folder with things in it stays, which is harmless */ }
  }
  for (const [name, bytes] of Object.entries(data)) py.FS.writeFile(`${HOME}/${name}`, bytes);
}

self.onmessage = async ({ data: msg }) => {
  try {
    if (msg.type === 'init') {
      await init(msg.files || []);
      self.postMessage({ id: msg.id, type: 'ready' });
    } else if (msg.type === 'run') {
      freshFolder();
      py.globals.set('_code', msg.code);
      py.globals.set('_check', msg.check || null);
      const out = py.runPython(`plotlab.run(_code, _check, ${Number(msg.dpi) || 90})`);
      self.postMessage({ id: msg.id, type: 'result', result: JSON.parse(out) });
    }
  } catch (e) {
    self.postMessage({ id: msg.id, type: 'failed', message: String(e && e.message || e) });
  }
};
