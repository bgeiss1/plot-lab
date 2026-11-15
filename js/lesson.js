// lesson.html?l=<lesson id>&e=<exercise id>: the reading, the exercises, the editor, the figure
// and the checks.
import { $, esc, loadLessons, header, progress, exId, Python, doneCount } from './site.js';
import { Editor } from './editor.js';

const params = new URLSearchParams(location.search);
let site, lesson, ex, editor, python, hintsShown = 0;

const KINDS = {
  fix: 'Fix the bug',
  complete: 'Finish the code',
  recreate: 'Recreate the figure',
  write: 'Write it yourself',
  explore: 'Try it'
};

function setStatus(text) {
  $('py-status').textContent = text;
  $('py-status').hidden = !text;
}

function drawTabs() {
  $('ex-tabs').innerHTML = lesson.exercises.map((e, i) => {
    const d = progress.get(exId(lesson, e)).done;
    return `<a role="tab" href="?l=${esc(lesson.id)}&e=${esc(e.id)}" data-e="${esc(e.id)}" aria-selected="${e === ex}" class="${d ? 'done' : ''}">
      <span class="n">${d ? '✓' : i + 1}</span><span>${esc(e.title)}</span></a>`;
  }).join('');
  $('lesson-count').textContent = `${doneCount(lesson)} of ${lesson.exercises.length} done`;
}

function showExercise(e, push = true) {
  ex = e;
  hintsShown = 0;
  const saved = progress.get(exId(lesson, ex));
  if (push) history.replaceState(null, '', `?l=${lesson.id}&e=${ex.id}`);
  $('ex-kind').textContent = KINDS[ex.kind] || '';
  $('ex-title').textContent = ex.title;
  $('ex-prompt').innerHTML = ex.prompt;
  $('hints').innerHTML = '';
  $('hint-btn').disabled = !(ex.hints || []).length;
  $('hint-btn').textContent = 'Hint';
  $('solution').hidden = true;
  $('solution').innerHTML = '';
  $('results').innerHTML = '';
  $('output').innerHTML = '<p class="placeholder">Press Run to see your figure here.</p>';
  editor.value = saved.code ?? ex.starter ?? '';
  $('target').hidden = ex.kind !== 'recreate';
  if (ex.kind === 'recreate') drawTarget();
  drawTabs();
  const i = lesson.exercises.indexOf(ex);
  $('next-ex').hidden = true;
  $('next-ex').dataset.i = i;
}

async function drawTarget() {
  const box = $('target-img');
  const me = ex;
  box.innerHTML = '<p class="placeholder">Drawing the target figure...</p>';
  try {
    const r = await python.run(ex.solution, null, 80);
    if (me !== ex) return;
    box.innerHTML = r.figures.length ? r.figures.map(f => `<img alt="The figure to recreate" src="data:image/png;base64,${f}">`).join('')
      : '<p class="placeholder">The solution did not draw a figure. Tell your instructor.</p>';
  } catch (err) {
    if (me === ex) box.innerHTML = `<p class="placeholder">${esc(err.message)}</p>`;
  }
}

async function run() {
  const me = ex;
  const code = editor.value;
  progress.set(exId(lesson, ex), { code });
  $('run').disabled = true;
  $('run').textContent = 'Running...';
  $('results').innerHTML = '';
  try {
    const r = await python.run(code, ex.check || null);
    if (me !== ex) return;
    drawOutput(r);
    drawResults(r);
  } catch (err) {
    $('output').innerHTML = `<div class="err"><b>Stopped</b><p>${esc(err.message)}</p></div>`;
  } finally {
    $('run').disabled = false;
    $('run').textContent = 'Run ▸';
  }
}

function drawOutput(r) {
  let html = '';
  if (r.error) {
    editor.markLine(r.error.line);
    html += `<div class="err" role="alert"><b>${esc(r.error.kind)}${r.error.line ? ` on line ${r.error.line}` : ''}</b>
      <p class="mono">${esc(r.error.message)}</p>${r.error.help ? `<p>${esc(r.error.help)}</p>` : ''}</div>`;
  }
  if (r.figures.length) html += r.figures.map((f, i) => `<img class="fig" alt="Figure ${i + 1} from your code" src="data:image/png;base64,${f}">`).join('');
  else if (!r.error && !r.stdout.trim()) html += '<p class="placeholder">Your code ran, but it did not draw a figure.</p>';
  if (r.stdout.trim()) html += `<div class="stdout"><span class="label">Printed</span><pre>${esc(r.stdout)}</pre></div>`;
  $('output').innerHTML = html;
}

function drawResults(r) {
  if (!r.checked) {
    $('results').innerHTML = r.error ? '<p class="res-note">Fix the error first, then the checks run.</p>' : '';
    return;
  }
  const all = r.results.length && r.results.every(x => x.ok);
  $('results').innerHTML = `<ul class="checks">${r.results.map(x =>
    `<li class="${x.ok ? 'ok' : 'no'}"><span class="mark" aria-label="${x.ok ? 'passed' : 'not yet'}">${x.ok ? '✓' : '✗'}</span>
      <span>${esc(x.what)}${!x.ok && x.hint ? `<small>${esc(x.hint)}</small>` : ''}</span></li>`).join('')}</ul>
    ${all ? `<p class="res-done">All ${r.results.length} checks pass. Nice work.</p>` : ''}`;
  if (all) {
    progress.set(exId(lesson, ex), { done: true, code: editor.value });
    drawTabs();
    header(site, lesson.id);
    const i = lesson.exercises.indexOf(ex);
    const nextEx = lesson.exercises[i + 1];
    const li = site.lessons.indexOf(lesson);
    const nextLesson = site.lessons[li + 1];
    $('next-ex').hidden = false;
    $('next-ex').innerHTML = nextEx ? `Next: ${esc(nextEx.title)} →` : nextLesson ? `Next lesson: ${esc(nextLesson.title)} →` : 'Back to all lessons';
    $('next-ex').href = nextEx ? `?l=${lesson.id}&e=${nextEx.id}` : nextLesson ? `lesson.html?l=${nextLesson.id}` : 'index.html';
  }
}

function hint() {
  const hs = ex.hints || [];
  if (hintsShown >= hs.length) return;
  $('hints').insertAdjacentHTML('beforeend', `<li>${hs[hintsShown]}</li>`);
  hintsShown++;
  $('hint-btn').textContent = hintsShown < hs.length ? `Another hint (${hs.length - hintsShown} left)` : 'No more hints';
  $('hint-btn').disabled = hintsShown >= hs.length;
}

function solution() {
  const box = $('solution');
  if (!box.hidden) { box.hidden = true; return; }
  if (!hintsShown && !confirm('Try a hint first? Press OK to see the full answer anyway.')) return;
  box.hidden = false;
  box.innerHTML = `<div class="sol-head"><b>One answer</b><button type="button" class="btn small" id="use-sol">Put it in the editor</button></div>
    <pre class="code">${esc(ex.solution)}</pre>${ex.explain ? `<p>${ex.explain}</p>` : ''}`;
  $('use-sol').onclick = () => { editor.value = ex.solution; progress.set(exId(lesson, ex), { code: ex.solution }); };
}

async function boot() {
  site = await loadLessons();
  lesson = site.lessons.find(l => l.id === params.get('l')) || site.lessons[0];
  document.title = `${lesson.title} · ${site.title}`;
  header(site, lesson.id);
  $('lesson-title').textContent = lesson.title;
  $('lesson-intro').innerHTML = lesson.intro;
  $('lesson-num').textContent = `Lesson ${site.lessons.indexOf(lesson) + 1} of ${site.lessons.length}`;
  const seen = progress.get(lesson.id).read;
  $('reading').open = !seen;
  $('reading').addEventListener('toggle', () => progress.set(lesson.id, { read: true }));
  editor = new Editor($('editor'), {
    onRun: run,
    onChange: v => progress.set(exId(lesson, ex), { code: v })
  });
  python = new Python(site.files.map(f => f.name), setStatus);
  python.ready.catch(err => setStatus('Python could not start: ' + err.message + ' Try reloading the page.'));
  $('run').onclick = run;
  $('hint-btn').onclick = hint;
  $('sol-btn').onclick = solution;
  $('reset').onclick = () => {
    if (editor.value !== ex.starter && !confirm('Put the starting code back? Your changes to this exercise are lost.')) return;
    editor.value = ex.starter;
    progress.set(exId(lesson, ex), { code: ex.starter });
  };
  $('ex-tabs').addEventListener('click', e => {
    const a = e.target.closest('[data-e]');
    if (!a) return;
    e.preventDefault();
    showExercise(lesson.exercises.find(x => x.id === a.dataset.e));
  });
  $('next-ex').addEventListener('click', e => {
    const next = lesson.exercises[Number($('next-ex').dataset.i) + 1];
    if (next) { e.preventDefault(); showExercise(next); scrollTo({ top: $('ex-tabs').offsetTop - 12, behavior: 'smooth' }); }
  });
  const want = lesson.exercises.find(x => x.id === params.get('e'))
    || lesson.exercises.find(x => !progress.get(exId(lesson, x)).done) || lesson.exercises[0];
  showExercise(want, false);
}

boot().catch(err => { document.querySelector('main').innerHTML = `<p class="err">Could not load the lesson. ${esc(err.message)}</p>`; });
