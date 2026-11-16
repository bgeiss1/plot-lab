// Checks the shape of data/lessons.json. Used by the dashboard before saving, by serve.mjs
// before writing the file, and by the tests, so a broken lessons file never reaches students.
import { checkQuestion } from './questions.js';

export const KINDS = ['fix', 'complete', 'recreate', 'write', 'explore'];
const ID = /^[a-z0-9][a-z0-9-]*$/;

export function validateSite(site) {
  const out = [];
  if (!site || typeof site !== 'object' || Array.isArray(site)) return ['The file is not a JSON object.'];
  for (const k of ['title', 'subtitle', 'intro', 'dataIntro']) if (typeof site[k] !== 'string') out.push(`Site: "${k}" must be text.`);
  if (!Array.isArray(site.files)) out.push('Site: "files" must be a list.');
  else {
    site.files.forEach((f, i) => {
      if (!f || typeof f.name !== 'string' || !/^[\w.-]+$/.test(f.name)) out.push(`File ${i + 1}: the name must be a plain file name like plddt.csv.`);
      if (typeof f.about !== 'string') out.push(`File ${f?.name || i + 1}: "about" must be text.`);
      if (typeof f.real !== 'boolean') out.push(`File ${f?.name || i + 1}: "real" must be true or false.`);
    });
  }
  if (!Array.isArray(site.lessons) || !site.lessons.length) return [...out, 'Site: "lessons" must be a list with at least one lesson.'];
  const lessonIds = new Set();
  site.lessons.forEach((l, li) => {
    const where = `Lesson ${li + 1}${l && l.title ? ` (${l.title})` : ''}`;
    if (!l || typeof l !== 'object') { out.push(`${where}: not an object.`); return; }
    if (!ID.test(l.id || '')) out.push(`${where}: the id must be lower case letters, numbers and dashes.`);
    else if (lessonIds.has(l.id)) out.push(`${where}: the id "${l.id}" is used twice.`);
    lessonIds.add(l.id);
    for (const k of ['title', 'summary', 'intro']) if (typeof l[k] !== 'string') out.push(`${where}: "${k}" must be text.`);
    if (!Array.isArray(l.exercises)) { out.push(`${where}: "exercises" must be a list.`); return; }
    const exIds = new Set();
    l.exercises.forEach((e, ei) => {
      const w = `${where}, exercise ${ei + 1}${e && e.title ? ` (${e.title})` : ''}`;
      if (!e || typeof e !== 'object') { out.push(`${w}: not an object.`); return; }
      if (!ID.test(e.id || '')) out.push(`${w}: the id must be lower case letters, numbers and dashes.`);
      else if (exIds.has(e.id)) out.push(`${w}: the id "${e.id}" is used twice in this lesson.`);
      exIds.add(e.id);
      if (!KINDS.includes(e.kind)) out.push(`${w}: the kind must be one of ${KINDS.join(', ')}.`);
      for (const k of ['title', 'prompt', 'starter', 'solution', 'check', 'explain']) if (typeof e[k] !== 'string') out.push(`${w}: "${k}" must be text.`);
      if (typeof e.check === 'string' && !/\bcheck\s*\(/.test(e.check)) out.push(`${w}: the check code never calls check(...), so nothing would be checked.`);
      if (!Array.isArray(e.hints) || e.hints.some(h => typeof h !== 'string')) out.push(`${w}: "hints" must be a list of text.`);
      if (e.questions !== undefined) {
        if (!Array.isArray(e.questions)) out.push(`${w}: "questions" must be a list.`);
        else e.questions.forEach((q, qi) => out.push(...checkQuestion(q, `${w}, question ${qi + 1}`)));
      }
    });
  });
  return out;
}
