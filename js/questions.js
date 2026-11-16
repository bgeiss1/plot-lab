// Questions that sit beside an exercise, answered in boxes on the page rather than in code
// (the same idea as Shell Lab's answer box). Each question in data/lessons.json looks like:
//   { "ask": "<p>html</p>", "type": "choice", "options": ["Yes", "No"], "answer": "Yes", "hint": "..." }
//   { "ask": "...", "type": "number", "answer": 3, "tol": 0, "hint": "..." }
//   { "ask": "...", "type": "text", "answer": ["Time (ps)"], "hint": "..." }
// Text answers ignore case, spaces and quotes, and any entry in the list counts as right.
export const QTYPES = ['choice', 'number', 'text'];

export const norm = s => String(s ?? '').toLowerCase().replace(/["'`\s]/g, '');

export function isRight(q, value) {
  if (value === undefined || value === null || String(value).trim() === '') return false;
  if (q.type === 'choice') return value === q.answer;
  if (q.type === 'number') {
    const v = Number(String(value).trim().replace(/,/g, ''));
    return Number.isFinite(v) && Math.abs(v - Number(q.answer)) <= (Number(q.tol) || 0) + 1e-9;
  }
  const accept = Array.isArray(q.answer) ? q.answer : [q.answer];
  return accept.some(a => norm(a) === norm(value));
}

export const answerText = q => (q.type === 'text' && Array.isArray(q.answer) ? q.answer[0] : String(q.answer));

export function checkQuestion(q, where) {
  const out = [];
  if (typeof q?.ask !== 'string' || !q.ask.trim()) out.push(`${where}: the question needs text.`);
  if (!QTYPES.includes(q?.type)) out.push(`${where}: the type must be one of ${QTYPES.join(', ')}.`);
  if (q?.type === 'choice' && (!Array.isArray(q.options) || q.options.length < 2 || !q.options.includes(q.answer))) out.push(`${where}: a choice question needs at least two options, and the answer must be one of them.`);
  if (q?.type === 'number' && !Number.isFinite(Number(q.answer))) out.push(`${where}: the answer must be a number.`);
  if (q?.type === 'text' && !(Array.isArray(q.answer) ? q.answer.length && q.answer.every(a => typeof a === 'string' && a.trim()) : typeof q.answer === 'string' && q.answer.trim())) out.push(`${where}: give at least one accepted answer.`);
  return out;
}
