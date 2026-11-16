// Tests for Plot Lab. Run with: npm test
// (On a Mac without npm: ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app/Contents/MacOS/Code" tests/run.mjs)
//
// 1. data/lessons.json has the right shape, its files exist, and its prose follows the style rules.
// 2. The local server saves good lessons (with a backup), refuses bad ones, and serves .wasm right.
// 3. The Pages build leaves out the dashboard.
// 4. Every exercise's answer passes its checks and no starting code does, in real Python
//    (tests/check_solutions.py). Skipped, and said so, when no Python with matplotlib is found.
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { validateSite } from '../js/validate.js';
import { saveLessons, handler } from '../serve.mjs';
import { highlight } from '../js/editor.js';
import { isRight } from '../js/questions.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (cond, what) => { if (cond) pass++; else { fail++; console.error('FAIL ' + what); } };

// ---------------------------------------------------------------- 1. lessons.json
const site = JSON.parse(readFileSync(join(root, 'data/lessons.json'), 'utf8'));
const problems = validateSite(site);
ok(problems.length === 0, 'lessons.json is valid: ' + problems.join(' | '));
ok(site.lessons.length >= 10, 'there are at least 10 lessons');
for (const f of site.files) ok(existsSync(join(root, 'data/files', f.name)), `data file ${f.name} exists`);
const fileNames = new Set(site.files.map(f => f.name));
for (const l of site.lessons) {
  for (const e of l.exercises) {
    for (const m of (e.starter + e.solution + e.check).matchAll(/"([\w.-]+\.(?:csv|xvg))"/g)) {
      ok(fileNames.has(m[1]), `${l.id}/${e.id} uses ${m[1]}, which is in the files list`);
    }
    ok(e.hints.length > 0, `${l.id}/${e.id} has at least one hint`);
  }
}
ok(validateSite({ ...site, lessons: [] }).length > 0, 'a site with no lessons is refused');
const dup = structuredClone(site); dup.lessons[1].id = dup.lessons[0].id;
ok(validateSite(dup).some(p => p.includes('used twice')), 'a repeated lesson id is refused');
const nocheck = structuredClone(site); nocheck.lessons[0].exercises[0].check = '# nothing';
ok(validateSite(nocheck).some(p => p.includes('never calls check')), 'check code with no check() is refused');
const badkind = structuredClone(site); badkind.lessons[0].exercises[0].kind = 'quiz';
ok(validateSite(badkind).some(p => p.includes('kind')), 'an unknown kind is refused');

// Brian's style rules for prose: no em or en dashes, no semicolons, none of the banned words.
// Code (inside <code> or <pre>) is left alone.
const BANNED = /\b(importantly|notably|interestingly|indeed|crucially|simply put|of course|moreover|furthermore|hence|consequently|nevertheless|remarkable|exciting|cutting-edge|transformative|groundbreaking|novel|unprecedented)\b/i;
const prose = html => String(html).replace(/<pre[\s\S]*?<\/pre>/gi, '').replace(/<code>[\s\S]*?<\/code>/gi, '').replace(/<[^>]+>/g, '').replace(/&\w+;/g, '');
const texts = [['site.intro', site.intro], ['site.dataIntro', site.dataIntro], ...site.files.map(f => [f.name, f.about])];
for (const l of site.lessons) {
  texts.push([`${l.id}.intro`, l.intro], [`${l.id}.summary`, l.summary], [`${l.id}.title`, l.title]);
  for (const e of l.exercises) texts.push([`${l.id}/${e.id}.prompt`, e.prompt], [`${l.id}/${e.id}.explain`, e.explain], ...e.hints.map((h, i) => [`${l.id}/${e.id}.hint${i}`, h]));
}
for (const [k, v] of texts) {
  const p = prose(v);
  ok(!/[—–]/.test(p), `${k}: no em or en dashes`);
  ok(!/;/.test(p), `${k}: no semicolons`);
  ok(!BANNED.test(p), `${k}: no banned words (${(p.match(BANNED) || [])[0]})`);
}

// ---------------------------------------------------------------- questions beside the task
ok(isRight({ type: 'choice', options: ['Yes', 'No'], answer: 'Yes' }, 'Yes'), 'a right choice is right');
ok(!isRight({ type: 'choice', options: ['Yes', 'No'], answer: 'Yes' }, 'No'), 'a wrong choice is wrong');
ok(isRight({ type: 'number', answer: 3 }, ' 3 '), 'a number answer ignores spaces');
ok(!isRight({ type: 'number', answer: 3 }, '2'), 'a wrong number is wrong');
ok(isRight({ type: 'number', answer: 0.5, tol: 0.01 }, '0.505'), 'a number within the allowed difference is right');
ok(isRight({ type: 'text', answer: ['Time (ps)'] }, '"time(ps)"'), 'text answers ignore case, spaces and quotes');
ok(!isRight({ type: 'text', answer: ['Time (ps)'] }, ''), 'an empty answer is never right');
const withQ = site.lessons.flatMap(l => l.exercises).filter(e => e.questions);
ok(withQ.length >= 3, 'the look-first exercises ask their questions in boxes');
for (const e of withQ) for (const q of e.questions) ok(isRight(q, q.type === 'text' ? q.answer[0] : String(q.answer)), `${e.id}: the stored answer counts as right`);
for (const l of site.lessons) for (const e of l.exercises) ok(!/^\s*(has_header|separator|pressure_column|x_label|n_residues|n_designs)\s*=/m.test(e.solution), `${e.id}: no question is answered by setting a variable in code`);
const badq = structuredClone(site); badq.lessons[1].exercises[0].questions[0].answer = 'Maybe';
ok(validateSite(badq).some(p => p.includes('must be one of them')), 'a choice answer that is not an option is refused');

// ---------------------------------------------------------------- the editor's colouring
ok(highlight('import numpy as np').includes('<span class="t-kw">import</span>'), 'keywords are coloured');
ok(highlight('x = "a<b"').includes('&lt;'), 'code is escaped before it is coloured');
ok(highlight('# hi\nplt.plot(1)').includes('<span class="t-com"># hi</span>'), 'comments are coloured');

// ---------------------------------------------------------------- 2. the server
const tmp = mkdtempSync(join(tmpdir(), 'plotlab-'));
mkdirSync(join(tmp, 'data'), { recursive: true });
writeFileSync(join(tmp, 'data/lessons.json'), JSON.stringify(site));
let r = await saveLessons(tmp, JSON.stringify(site));
ok(r.status === 200 && r.out.ok, 'the server saves valid lessons');
ok(readdirSync(join(tmp, 'data/backups')).length === 1, 'and keeps a backup of the old file');
r = await saveLessons(tmp, '{"title": 1}');
ok(r.status === 400, 'the server refuses lessons that fail validation');
r = await saveLessons(tmp, 'not json');
ok(r.status === 400, 'the server refuses text that is not JSON');

const srv = createServer(handler(root)).listen(0, '127.0.0.1');
await new Promise(res => srv.once('listening', res));
const base = `http://127.0.0.1:${srv.address().port}`;
let res = await fetch(base + '/vendor/pyodide/pyodide.asm.wasm');
ok(res.headers.get('content-type') === 'application/wasm', '.wasm is served as application/wasm (Pyodide needs this)');
res = await fetch(base + '/');
ok(res.ok && (await res.text()).includes('Plot Lab'), 'the home page is served');
res = await fetch(base + '/data/files/md_energy.xvg');
ok(res.ok, 'the data files are served');
res = await fetch(base + '/..%2fpackage.json');
ok(res.status === 403 || res.status === 404, 'paths outside the folder are refused');
srv.close();
rmSync(tmp, { recursive: true, force: true });

// ---------------------------------------------------------------- 3. the Pages build
const hasBash = spawnSync('bash', ['--version']).status === 0;
if (hasBash) {
  const out = mkdtempSync(join(tmpdir(), 'plotlab-site-'));
  execFileSync('bash', [join(root, 'tools/build_pages.sh'), out], { env: { ...process.env, NOINDEX: '1' } });
  ok(!existsSync(join(out, 'admin.html')), 'the Pages build leaves out admin.html');
  ok(!existsSync(join(out, 'js/admin.js')), 'and js/admin.js');
  ok(!existsSync(join(out, 'serve.mjs')), 'and serve.mjs');
  ok(existsSync(join(out, 'vendor/pyodide/pyodide.asm.wasm')), 'it includes Pyodide');
  ok(existsSync(join(out, 'py/plotlab.py')) && existsSync(join(out, 'data/files/pae.csv')), 'it includes the checker and the data files');
  ok(readFileSync(join(out, 'lesson.html'), 'utf8').includes('noindex'), 'NOINDEX=1 adds the noindex tag');
  rmSync(out, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 4. every exercise in real Python
const py = ['python3', 'python'].find(p => spawnSync(p, ['-c', 'import matplotlib, numpy'], { stdio: 'ignore' }).status === 0);
if (py) {
  const run = spawnSync(py, [join(root, 'tests/check_solutions.py')], { encoding: 'utf8' });
  const last = run.stdout.trim().split('\n').pop();
  ok(run.status === 0, 'every exercise passes in real Python:\n' + run.stdout.split('\n').filter(l => !l.startsWith('ok')).join('\n') + run.stderr);
  console.log(last);
} else {
  console.log('Skipped the exercise check: no Python with numpy and matplotlib here (pip install numpy matplotlib to run it).');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
