// Shared by every page: loading the lessons, the header, saved progress, and the Python runner.
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const $ = id => document.getElementById(id);

export async function loadLessons() {
  const r = await fetch('data/lessons.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('data/lessons.json did not load');
  return r.json();
}

export function header(site, current = '') {
  const el = document.querySelector('header.top');
  if (!el) return;
  el.innerHTML = `<a class="brand" href="index.html"><span class="brand-name">${esc(site.title)}</span><span class="brand-sub">${esc(site.subtitle)}</span></a>
    <nav class="tools" aria-label="Lessons">${site.lessons.map((l, i) =>
    `<a class="tool${l.id === current ? ' on' : ''}${done(l) ? ' done' : ''}" href="lesson.html?l=${esc(l.id)}" title="${esc(l.title)}">${i + 1}</a>`).join('')}</nav>`;
}

// ------------------------------------------------------------ progress (this browser only)
const KEY = 'plotlab.progress.v1';
function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function writeAll(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private window: progress is not kept */ }
}
export const progress = {
  get: id => readAll()[id] || {},
  set(id, patch) { const p = readAll(); p[id] = { ...(p[id] || {}), ...patch }; writeAll(p); },
  clear() { writeAll({}); }
};
export const exId = (lesson, ex) => `${lesson.id}/${ex.id}`;
export const done = lesson => lesson.exercises.length > 0 && lesson.exercises.every(e => progress.get(exId(lesson, e)).done);
export const doneCount = lesson => lesson.exercises.filter(e => progress.get(exId(lesson, e)).done).length;

// ------------------------------------------------------------ running Python
// One worker per page. A run that takes too long (an endless loop) stops the worker, and the
// next run starts a fresh one.
export class Python {
  constructor(files, onStatus = () => {}) {
    this.files = files;
    this.onStatus = onStatus;
    this.limit = 30000;
    this.n = 0;
    this.start();
  }

  start() {
    this.worker = new Worker('js/worker.js', { type: 'module' });
    this.waiting = new Map();
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'status') return this.onStatus(data.text);
      const w = this.waiting.get(data.id);
      if (!w) return;
      this.waiting.delete(data.id);
      clearTimeout(w.timer);
      if (data.type === 'failed') w.reject(new Error(data.message)); else w.resolve(data.result ?? true);
    };
    this.worker.onerror = e => {
      for (const w of this.waiting.values()) w.reject(new Error(e.message || 'Python could not start.'));
      this.waiting.clear();
    };
    this.ready = this.send({ type: 'init', files: this.files }, 0).then(() => this.onStatus(''));
  }

  send(msg, limit = this.limit) {
    const id = ++this.n;
    return new Promise((resolve, reject) => {
      const w = { resolve, reject, timer: null };
      if (limit) {
        w.timer = setTimeout(() => {
          this.waiting.delete(id);
          this.worker.terminate();
          reject(new Error(`Your code ran for more than ${limit / 1000} seconds, so it was stopped. Look for a loop that never ends. Python restarts on the next run.`));
          this.start();
        }, limit);
      }
      this.waiting.set(id, w);
      this.worker.postMessage({ ...msg, id });
    });
  }

  async run(code, check = null, dpi = 90) {
    await this.ready;
    return this.send({ type: 'run', code, check, dpi });
  }
}

// Fills every element with data-t="key" from site text, for the few fixed labels on pages.
export function fillText(text) {
  for (const el of document.querySelectorAll('[data-t]')) {
    const v = text[el.dataset.t];
    if (v !== undefined) el.innerHTML = v;
  }
}
