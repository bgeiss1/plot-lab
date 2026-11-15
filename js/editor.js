// A small Python editor: a textarea laid over a coloured copy of the same text, with line
// numbers, Tab to indent, Enter that keeps the indent, and Ctrl/Cmd+Enter to run.
// No library, so it works offline and on GitHub Pages without anything else to load.
import { esc } from './site.js';

const KW = new Set('False None True and as assert break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
const BUILTIN = new Set('print len range list dict tuple set str int float abs min max sum zip enumerate open sorted round'.split(' '));
const TOKEN = /(#[^\n]*)|("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|[rbfRBF]{0,2}"(?:\\.|[^"\\\n])*"?|[rbfRBF]{0,2}'(?:\\.|[^'\\\n])*'?)|(\b\d+\.?\d*(?:[eE][-+]?\d+)?\b)|([A-Za-z_]\w*)|([\s\S])/g;

export function highlight(src) {
  let out = '';
  for (const m of src.matchAll(TOKEN)) {
    const [t, com, str, num, word] = m;
    if (com) out += `<span class="t-com">${esc(com)}</span>`;
    else if (str) out += `<span class="t-str">${esc(str)}</span>`;
    else if (num) out += `<span class="t-num">${esc(num)}</span>`;
    else if (word) {
      const cls = KW.has(word) ? 't-kw' : BUILTIN.has(word) ? 't-fn' : (word === 'plt' || word === 'np' || word === 'ax' || word === 'fig') ? 't-mod' : '';
      out += cls ? `<span class="${cls}">${word}</span>` : word;
    } else out += esc(t);
  }
  return out + '\n';
}

export class Editor {
  constructor(host, { onRun = () => {}, onChange = () => {}, label = 'Python code' } = {}) {
    host.classList.add('editor');
    host.innerHTML = `<div class="ed-gutter" aria-hidden="true"></div>
      <div class="ed-body"><pre class="ed-hl" aria-hidden="true"></pre>
      <textarea class="ed-text" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="${esc(label)}"></textarea></div>`;
    this.gutter = host.querySelector('.ed-gutter');
    this.hl = host.querySelector('.ed-hl');
    this.ta = host.querySelector('.ed-text');
    this.onRun = onRun;
    this.onChange = onChange;
    this.bad = null;
    this.ta.addEventListener('input', () => { this.bad = null; this.draw(); this.onChange(this.value); });
    this.ta.addEventListener('scroll', () => { this.hl.scrollTop = this.ta.scrollTop; this.hl.scrollLeft = this.ta.scrollLeft; this.gutter.scrollTop = this.ta.scrollTop; });
    this.ta.addEventListener('keydown', e => this.key(e));
  }

  get value() { return this.ta.value; }
  set value(v) { this.ta.value = v; this.bad = null; this.draw(); }

  markLine(n) { this.bad = n || null; this.draw(); }

  draw() {
    const n = this.ta.value.split('\n').length;
    this.gutter.innerHTML = Array.from({ length: n }, (_, i) => `<span${i + 1 === this.bad ? ' class="bad"' : ''}>${i + 1}</span>`).join('');
    this.hl.innerHTML = highlight(this.ta.value);
  }

  replace(start, end, text, caret = start + text.length) {
    this.ta.setRangeText(text, start, end, 'end');
    this.ta.selectionStart = this.ta.selectionEnd = caret;
    this.ta.dispatchEvent(new Event('input'));
  }

  key(e) {
    const ta = this.ta, v = ta.value, s = ta.selectionStart, end = ta.selectionEnd;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.shiftKey)) { e.preventDefault(); this.onRun(); return; }
    if (e.key === 'Escape') { ta.blur(); return; } // so keyboard users can Tab out of the editor
    if (e.key === 'Tab') {
      e.preventDefault();
      const lineStart = v.lastIndexOf('\n', s - 1) + 1;
      if (s === end && !e.shiftKey) { this.replace(s, end, '    '); return; }
      const lineEnd = end > s && v[end - 1] === '\n' ? end - 1 : end;
      const block = v.slice(lineStart, lineEnd);
      const next = e.shiftKey ? block.replace(/^ {1,4}/gm, '') : block.replace(/^/gm, '    ');
      ta.setRangeText(next, lineStart, lineEnd, 'select');
      ta.dispatchEvent(new Event('input'));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const lineStart = v.lastIndexOf('\n', s - 1) + 1;
      const line = v.slice(lineStart, s);
      let indent = line.match(/^ */)[0];
      if (/:\s*(#.*)?$/.test(line)) indent += '    ';
      this.replace(s, end, '\n' + indent);
    }
  }
}
