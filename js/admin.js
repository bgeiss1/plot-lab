// The lesson dashboard (admin.html): edit data/lessons.json lesson by lesson, test an exercise
// in the same Python the students use, Save through serve.mjs (POST /api/lessons) and Publish
// (POST /api/publish). Same Save / Publish / backup behaviour as the other MIP 662 dashboards.
import { $, esc, Python } from './site.js';
import { Editor } from './editor.js';
import { validateSite, KINDS } from './validate.js';
import { QTYPES } from './questions.js';

const BANNED = /\b(importantly|notably|interestingly|indeed|crucially|simply put|of course|moreover|furthermore|hence|consequently|nevertheless|remarkable|exciting|cutting-edge|transformative|groundbreaking|novel|unprecedented)\b/i;
const KIND_NAMES = { fix: 'Fix the bug', complete: 'Finish the code', recreate: 'Recreate the figure', write: 'Write it yourself', explore: 'Try it' };
const HELPERS = [
  ['check(what, condition, hint)', 'Records one check. what is shown to the student with a tick or a cross. hint is shown only when it fails.'],
  ['lines(i) / line_x(i, k) / line_y(i, k)', 'Lines drawn by plot on panel i (0 = first). line_y(0, 1) is the y data of the second line. axhline/axvline lines are left out.'],
  ['has_hline(v, i) / has_vline(v, i)', 'True if axhline / axvline drew a line at v.'],
  ['scatters(i) / scatter_xy(i, k)', 'Scatter plots on panel i, and the (x, y) points of one of them.'],
  ['bars(i) / bar_heights(i, k)', 'Bars from bar(), and their heights.'],
  ['hist_patches(i)', 'Every bar a histogram drew.'],
  ['errorbars(i)', 'Error bar groups (from errorbar or bar(..., yerr=)).'],
  ['images(i) / colorbars()', 'Images from imshow, and colour bars.'],
  ['xlabel(i) / ylabel(i) / title(i) / suptitle()', 'The text of the labels and titles.'],
  ['xlim(i) / ylim(i) / xscale(i) / yscale(i)', 'Axis ranges and scales.'],
  ['legend_texts(i) / has_legend(i) / texts(i) / has_grid(i)', 'Legend entries, text on the plot, and the grid.'],
  ['same_color(artist, "tab:red")', 'True if a line, scatter or bar is that colour.'],
  ['axes() / ax(i) / fig() / figs()', 'The panels and figures themselves, for anything the helpers do not cover.'],
  ['same(a, b, tol)', 'True if two arrays have the same shape and values.'],
  ['has_words(text, "a", "b")', 'True if every word is in the text, ignoring case.'],
  ['xvg(name) / csv_columns(name)', 'Read a data file the way the lessons do, for comparing.'],
  ['var("name")', 'A variable from the student\'s code (None if it does not exist).'],
  ['printed', 'Everything the student\'s code printed, as one piece of text.'],
  ['saved("name.png")', 'Facts about a file the student saved: exists, width, height, dpi, format.']
];

let saved, draft, sel = { t: 'site' }, python = null;
const editors = [];
const clone = o => JSON.parse(JSON.stringify(o));
const J = o => JSON.stringify(o);

function styleWarnings(html) {
  const text = String(html).replace(/<pre[\s\S]*?<\/pre>/gi, '').replace(/<code>[\s\S]*?<\/code>/gi, '').replace(/<[^>]+>/g, '').replace(/&\w+;|&#\d+;/g, '');
  const out = [];
  if (/[—–]/.test(text)) out.push('Style: no em or en dashes. Use a comma, a period or brackets.');
  if (/;/.test(text)) out.push('Style: no semicolons in prose. Split it into two sentences.');
  const b = text.match(BANNED);
  if (b) out.push(`Style: "${b[0]}" is on the list of words to avoid.`);
  for (const tag of ['code', 'b', 'p', 'pre', 'a', 'li', 'ul', 'ol', 'em']) {
    const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length, close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    if (open !== close) out.push(`There ${open === 1 ? 'is' : 'are'} ${open} &lt;${tag}&gt; and ${close} &lt;/${tag}&gt;. Every tag needs its closing tag.`);
  }
  return out;
}
const safe = v => String(v).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+=/gi, ' data-x=');

function current() {
  if (sel.t === 'lesson') return draft.lessons[sel.l];
  if (sel.t === 'ex') return draft.lessons[sel.l].exercises[sel.e];
  return draft;
}
// ------------------------------------------------------------------ the tree
function drawTree() {
  const sl = id => saved.lessons.find(l => l.id === id);
  const siteChanged = ['title', 'subtitle', 'intro', 'dataIntro'].some(k => draft[k] !== saved[k]) || J(draft.files) !== J(saved.files);
  let html = `<button type="button" data-t="site" aria-current="${sel.t === 'site'}"><span>Home page and data files</span>${siteChanged ? '<span class="ch">changed</span>' : ''}</button>`;
  draft.lessons.forEach((l, li) => {
    const s = sl(l.id);
    const lch = !s || ['id', 'title', 'summary', 'intro'].some(k => l[k] !== s[k]);
    html += `<button type="button" class="lesson" data-t="lesson" data-l="${li}" aria-current="${sel.t === 'lesson' && sel.l === li}"><span>${li + 1}. ${esc(l.title)}</span>${lch ? '<span class="ch">changed</span>' : ''}</button>`;
    l.exercises.forEach((e, ei) => {
      const se = s?.exercises.find(x => x.id === e.id);
      html += `<button type="button" class="ex" data-t="ex" data-l="${li}" data-e="${ei}" aria-current="${sel.t === 'ex' && sel.l === li && sel.e === ei}"><span>${ei + 1}. ${esc(e.title)}</span>${!se || J(se) !== J(e) ? '<span class="ch">changed</span>' : ''}</button>`;
    });
  });
  html += '<button type="button" data-add-lesson class="lesson">+ Add a lesson</button>';
  $('tree').innerHTML = html;
}

// ------------------------------------------------------------------ the form
function textField(key, label, obj, { html = false, note = '' } = {}) {
  const v = obj[key] ?? '';
  if (!html) return `<div class="field"><label for="f-${key}">${label}${note ? ` <small>${note}</small>` : ''}</label><input type="text" id="f-${key}" data-k="${key}" value="${esc(v)}"></div>`;
  return `<div class="field"><label for="f-${key}">${label}${note ? ` <small>${note}</small>` : ''}</label>
    <textarea class="html" id="f-${key}" data-k="${key}" data-html spellcheck="true">${esc(v)}</textarea>
    <div class="warns" data-w="${key}">${styleWarnings(v).map(w => `<span>${w}</span>`).join('')}</div>
    <div class="preview prose" data-p="${key}">${safe(v)}</div></div>`;
}
const codeField = (key, label, note) => `<div class="field"><div class="lab">${label} <small>${note}</small></div><div data-code="${key}"></div></div>`;

function drawForm() {
  editors.length = 0;
  const f = $('form');
  const o = current();
  if (sel.t === 'site') {
    f.innerHTML = `<h2>Home page</h2>
      ${textField('title', 'Site title', o)}${textField('subtitle', 'Subtitle', o)}
      ${textField('intro', 'Introduction', o, { html: true })}
      <h2>Data files</h2>
      ${textField('dataIntro', 'Introduction to the data files', o, { html: true })}
      <p class="help">Each file must also exist in <span class="mono">data/files/</span>. Mark a file as example data when the numbers are made up, so students are never told an example is a measurement.</p>
      ${o.files.map((file, i) => `<div class="field"><div class="lab"><span class="mono">${esc(file.name)}</span>
        <label class="small"><input type="checkbox" data-file-real="${i}" ${file.real ? 'checked' : ''}> real data</label></div>
        <input type="text" data-file-about="${i}" value="${esc(file.about)}" aria-label="What ${esc(file.name)} is"></div>`).join('')}`;
    return;
  }
  if (sel.t === 'lesson') {
    const li = sel.l;
    f.innerHTML = `<div class="sol-head"><h2>Lesson ${li + 1}</h2><span class="acts">
        <a class="btn small" href="lesson.html?l=${esc(o.id)}" target="_blank" rel="noopener">Open on the site</a>
        <button type="button" class="btn small" data-act="lesson-up" ${li === 0 ? 'disabled' : ''}>Move up</button>
        <button type="button" class="btn small" data-act="lesson-down" ${li === draft.lessons.length - 1 ? 'disabled' : ''}>Move down</button>
        <button type="button" class="btn small" data-act="lesson-delete">Delete lesson</button></span></div>
      ${textField('title', 'Title', o)}${textField('id', 'Id', o, { note: 'lower case and dashes, used in links and saved progress' })}
      ${textField('summary', 'One line summary (home page)', o)}
      ${textField('intro', 'Reading', o, { html: true, note: 'shown above the exercises' })}
      <div class="acts"><button type="button" class="btn" data-act="ex-add">+ Add an exercise</button></div>`;
    return;
  }
  const ei = sel.e, l = draft.lessons[sel.l];
  f.innerHTML = `<div class="sol-head"><h2>${esc(l.title)}, exercise ${ei + 1}</h2><span class="acts">
      <a class="btn small" href="lesson.html?l=${esc(l.id)}&e=${esc(o.id)}" target="_blank" rel="noopener">Open on the site</a>
      <button type="button" class="btn small" data-act="ex-up" ${ei === 0 ? 'disabled' : ''}>Move up</button>
      <button type="button" class="btn small" data-act="ex-down" ${ei === l.exercises.length - 1 ? 'disabled' : ''}>Move down</button>
      <button type="button" class="btn small" data-act="ex-copy">Duplicate</button>
      <button type="button" class="btn small" data-act="ex-delete">Delete</button></span></div>
    ${textField('title', 'Title', o)}${textField('id', 'Id', o, { note: 'lower case and dashes' })}
    <div class="field"><label for="f-kind">Kind</label><select id="f-kind" data-k="kind">${KINDS.map(k => `<option value="${k}" ${k === o.kind ? 'selected' : ''}>${KIND_NAMES[k]}</option>`).join('')}</select>
      <small class="muted">"Recreate the figure" shows the answer's figure as the target.</small></div>
    ${textField('prompt', 'Task', o, { html: true })}
    ${codeField('starter', 'Starting code', 'what the student sees first')}
    ${codeField('solution', 'Answer', 'shown under "Show an answer", and drawn as the target for Recreate')}
    ${codeField('check', 'Check code', 'Python run after the student\'s code. It reads the figure and calls check(...)')}
    <details class="ref"><summary>What the check code can use</summary><table>${HELPERS.map(([a, b]) => `<tr><td class="mono">${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table></details>
    <div class="field"><div class="lab">Hints <small>shown one at a time, in this order</small></div>
      ${o.hints.map((h, i) => `<div class="hint-row"><textarea class="html" data-hint="${i}" aria-label="Hint ${i + 1}">${esc(h)}</textarea><button type="button" class="btn small" data-act="hint-del" data-i="${i}">Remove</button></div>`).join('')}
      <div><button type="button" class="btn small" data-act="hint-add">+ Add a hint</button></div></div>
    <div class="field"><div class="lab">Questions <small>answered in boxes beside the task, not in the code. The exercise is done when the code checks pass and every question is right.</small></div>
      ${(o.questions || []).map((q, i) => `<div class="card q-edit" data-qi="${i}">
        <div class="sol-head"><b>Question ${i + 1}</b><button type="button" class="btn small" data-act="q-del" data-i="${i}">Remove</button></div>
        <label class="small">Question <textarea class="html" data-qf="ask" aria-label="Question ${i + 1}">${esc(q.ask)}</textarea></label>
        <label class="small">Kind <select data-qf="type">${QTYPES.map(t => `<option value="${t}" ${t === q.type ? 'selected' : ''}>${{ choice: 'Pick one option', number: 'Type a number', text: 'Type a word or phrase' }[t]}</option>`).join('')}</select></label>
        ${q.type === 'choice' ? `<label class="small">Options, one per line <textarea class="html" data-qf="options">${esc((q.options || []).join('\n'))}</textarea></label>` : ''}
        <label class="small">${q.type === 'text' ? 'Accepted answers, one per line (case, spaces and quotes are ignored)' : q.type === 'choice' ? 'Right answer (must match an option exactly)' : 'Right answer'}
          ${q.type === 'text' ? `<textarea class="html" data-qf="answer">${esc((Array.isArray(q.answer) ? q.answer : [q.answer]).join('\n'))}</textarea>` : `<input type="text" data-qf="answer" value="${esc(q.answer)}">`}</label>
        ${q.type === 'number' ? `<label class="small">Allowed difference (0 for exact) <input type="text" data-qf="tol" value="${esc(q.tol ?? 0)}"></label>` : ''}
        <label class="small">Hint when wrong <input type="text" data-qf="hint" value="${esc(q.hint || '')}"></label>
      </div>`).join('')}
      <div><button type="button" class="btn small" data-act="q-add">+ Add a question</button></div></div>
    ${textField('explain', 'After the answer', o, { html: true, note: 'optional, shown under the answer' })}
    <div class="acts"><button type="button" class="btn primary" data-act="test">Test this exercise</button></div>
    <div class="test-out" id="test-out"></div>`;
  for (const host of f.querySelectorAll('[data-code]')) {
    const key = host.dataset.code;
    const ed = new Editor(host, { label: key, onChange: v => { o[key] = v; changed(); }, onRun: () => testOne() });
    ed.value = o[key];
    editors.push(ed);
  }
}

// ------------------------------------------------------------------ changes
function changed() {
  const n = J(draft) !== J(saved);
  $('save').disabled = !n;
  $('discard').disabled = !n;
  drawTree();
  const bad = validateSite(draft);
  $('problems').innerHTML = bad.length ? `<div class="problems"><b>Fix these before saving:</b><ul>${bad.map(b => `<li>${esc(b)}</li>`).join('')}</ul></div>` : '';
}
function status(msg, k = '') { $('status').className = 'status ' + k; $('status').innerHTML = msg; }

function onInput(e) {
  const t = e.target, o = current();
  if (t.dataset.k) {
    o[t.dataset.k] = t.value;
    if (t.dataset.html !== undefined) {
      $('form').querySelector(`[data-p="${t.dataset.k}"]`).innerHTML = safe(t.value);
      $('form').querySelector(`[data-w="${t.dataset.k}"]`).innerHTML = styleWarnings(t.value).map(w => `<span>${w}</span>`).join('');
    }
  } else if (t.dataset.hint !== undefined) o.hints[Number(t.dataset.hint)] = t.value;
  else if (t.dataset.fileAbout !== undefined) draft.files[Number(t.dataset.fileAbout)].about = t.value;
  else if (t.dataset.fileReal !== undefined) draft.files[Number(t.dataset.fileReal)].real = t.checked;
  else return;
  changed();
}

function uniqueId(base, taken) {
  let id = base, n = 2;
  while (taken.includes(id)) id = `${base}-${n++}`;
  return id;
}

function act(name, btn) {
  const L = draft.lessons;
  const swap = (arr, i, j) => { [arr[i], arr[j]] = [arr[j], arr[i]]; };
  if (name === 'lesson-up') { swap(L, sel.l, sel.l - 1); sel.l--; }
  else if (name === 'lesson-down') { swap(L, sel.l, sel.l + 1); sel.l++; }
  else if (name === 'lesson-delete') {
    if (!confirm(`Delete the lesson "${L[sel.l].title}" and its ${L[sel.l].exercises.length} exercises? Nothing is lost until you Save.`)) return;
    L.splice(sel.l, 1); sel = { t: 'site' };
  } else if (name === 'ex-add' || name === 'ex-copy') {
    const l = L[sel.l];
    const base = name === 'ex-copy' ? clone(l.exercises[sel.e]) : { title: 'New exercise', kind: 'write', prompt: '<p>Describe the task.</p>', starter: 'import numpy as np\nimport matplotlib.pyplot as plt\n', solution: 'import numpy as np\nimport matplotlib.pyplot as plt\n\nplt.plot([1, 2, 3])\n', check: 'check("There is a line", len(lines()) == 1, "Call plt.plot(...).")\n', hints: [], explain: '' };
    base.id = uniqueId(name === 'ex-copy' ? base.id + '-copy' : 'new-exercise', l.exercises.map(e => e.id));
    if (name === 'ex-copy') base.title += ' (copy)';
    const at = name === 'ex-copy' ? sel.e + 1 : l.exercises.length;
    l.exercises.splice(at, 0, base);
    sel = { t: 'ex', l: sel.l, e: at };
  } else if (name === 'ex-up') { swap(L[sel.l].exercises, sel.e, sel.e - 1); sel.e--; }
  else if (name === 'ex-down') { swap(L[sel.l].exercises, sel.e, sel.e + 1); sel.e++; }
  else if (name === 'ex-delete') {
    if (!confirm(`Delete the exercise "${current().title}"? Nothing is lost until you Save.`)) return;
    L[sel.l].exercises.splice(sel.e, 1); sel = { t: 'lesson', l: sel.l };
  } else if (name === 'hint-add') current().hints.push('');
  else if (name === 'hint-del') current().hints.splice(Number(btn.dataset.i), 1);
  else if (name === 'test') return void testOne();
  drawForm();
  changed();
}

// ------------------------------------------------------------------ testing in Pyodide
function getPython() {
  if (!python) python = new Python(draft.files.map(f => f.name), t => { if (t) status(esc(t)); });
  return python;
}

async function testExercise(e) {
  const py = getPython();
  const sol = await py.run(e.solution, e.check, 70);
  const st = await py.run(e.starter, e.check, 70);
  const solOk = !sol.error && sol.results.length && sol.results.every(r => r.ok);
  const stDone = !st.error && st.results.length && st.results.every(r => r.ok);
  return { sol, st, solOk, stDone };
}

async function testOne() {
  const e = current(), out = $('test-out');
  out.innerHTML = '<p class="muted">Testing (the first test starts Python, which takes a few seconds)...</p>';
  try {
    const { sol, st, solOk, stDone } = await testExercise(e);
    const list = r => `<ul class="checks">${r.results.map(x => `<li class="${x.ok ? 'ok' : 'no'}"><span class="mark">${x.ok ? '✓' : '✗'}</span><span>${esc(x.what)}${!x.ok && x.hint ? `<small>${esc(x.hint)}</small>` : ''}</span></li>`).join('')}</ul>`;
    const err = r => r.error ? `<div class="err"><b>${esc(r.error.kind)}${r.error.line ? ` on line ${r.error.line}` : ''}</b><p class="mono">${esc(r.error.message)}</p></div>` : '';
    out.innerHTML = `<h3>${solOk ? '✓ The answer passes every check' : '✗ The answer does not pass'}</h3>${err(sol)}${list(sol)}
      ${sol.figures.map(f => `<img alt="Figure drawn by the answer" src="data:image/png;base64,${f}">`).join('')}
      <h3>${stDone ? '✗ The starting code already passes every check, so the exercise is done before it starts' : '✓ The starting code does not pass yet'}</h3>${err(st)}${st.checked ? list(st) : ''}`;
    status('');
  } catch (err) {
    out.innerHTML = `<div class="err">${esc(err.message)}</div>`;
  }
}

async function testAll() {
  $('test-all').disabled = true;
  const bad = [];
  let n = 0;
  const total = draft.lessons.reduce((a, l) => a + l.exercises.length, 0);
  try {
    for (const l of draft.lessons) {
      for (const e of l.exercises) {
        status(`Testing ${++n} of ${total}: ${esc(l.title)}, ${esc(e.title)}...`);
        const { solOk, stDone } = await testExercise(e);
        if (!solOk) bad.push(`${l.title}, ${e.title}: the answer does not pass`);
        if (stDone) bad.push(`${l.title}, ${e.title}: the starting code already passes`);
      }
    }
    status(bad.length ? `<span class="check-all">${bad.length} problem${bad.length === 1 ? '' : 's'}:<ul>${bad.map(b => `<li>${esc(b)}</li>`).join('')}</ul></span>` : `All ${total} exercises pass: every answer passes its checks and no starting code does.`, bad.length ? 'err' : 'ok');
  } catch (err) {
    status('Testing stopped: ' + esc(err.message), 'err');
  }
  $('test-all').disabled = false;
}

// ------------------------------------------------------------------ save, publish, files
async function save() {
  const bad = validateSite(draft);
  if (bad.length) { status('Fix the problems listed above first.', 'err'); return; }
  $('save').disabled = true;
  status('Saving...');
  try {
    const r = await fetch('api/lessons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
    const out = await r.json();
    if (!r.ok || !out.ok) throw new Error(out.message || r.statusText);
    saved = clone(draft);
    changed();
    status(`Saved. The old file is in <span class="mono">${esc(out.backup)}</span>. Reload a lesson page to see the change.`, 'ok');
  } catch (err) {
    $('save').disabled = false;
    status('Could not save. This only works through the local server (node serve.mjs). You can Download the file instead and put it in data/lessons.json. ' + esc(err.message), 'err');
  }
}

async function publish() {
  if (J(draft) !== J(saved)) { status('Save your changes first, then press Publish.', 'err'); return; }
  $('publish').disabled = true;
  status('Publishing...');
  try {
    const out = await (await fetch('api/publish', { method: 'POST' })).json();
    status(esc(out.message || (out.ok ? 'Published.' : 'Could not publish.')), out.ok ? 'ok' : 'err');
  } catch (err) {
    status('Could not publish. ' + esc(err.message), 'err');
  }
  $('publish').disabled = false;
}

async function boot() {
  saved = await (await fetch('data/lessons.json', { cache: 'no-store' })).json();
  draft = clone(saved);
  drawTree();
  drawForm();
  changed();
  $('tree').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-add-lesson')) {
      const id = uniqueId('new-lesson', draft.lessons.map(l => l.id));
      draft.lessons.push({ id, title: 'New lesson', summary: 'What this lesson covers.', intro: '<p>The reading for this lesson.</p>', exercises: [] });
      sel = { t: 'lesson', l: draft.lessons.length - 1 };
      changed();
    } else sel = { t: b.dataset.t, l: Number(b.dataset.l), e: Number(b.dataset.e) };
    drawTree();
    drawForm();
    scrollTo(0, 0);
  });
  $('form').addEventListener('input', onInput);
  $('form').addEventListener('change', onInput);
  $('form').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act, b); });
  $('save').onclick = save;
  $('publish').onclick = publish;
  $('test-all').onclick = testAll;
  $('discard').onclick = () => { if (confirm('Undo every change since the last save?')) { draft = clone(saved); sel = { t: 'site' }; drawForm(); changed(); status(''); } };
  $('download').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 1) + '\n'], { type: 'application/json' }));
    a.download = 'lessons.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $('upload').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const up = JSON.parse(await f.text());
      const bad = validateSite(up);
      if (bad.length) throw new Error(bad.slice(0, 3).join(' '));
      draft = up; sel = { t: 'site' }; drawForm(); changed();
      status(`Loaded ${esc(f.name)}. Check it, then press Save.`, 'ok');
    } catch (err) { status(`${esc(f.name)} is not a usable lessons.json: ${esc(err.message)}`, 'err'); }
  };
  addEventListener('beforeunload', e => { if (J(draft) !== J(saved)) e.preventDefault(); });
}

boot().catch(err => status('Could not load data/lessons.json. Open this page through the local server (node serve.mjs). ' + esc(err.message), 'err'));
