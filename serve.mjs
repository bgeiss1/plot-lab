// Serves this folder at http://localhost:8005/ . Run: node serve.mjs (or npm run serve)
// Shell Lab uses 8000/8001, the GROMACS visualizer 8002, BindCraft2 8003 and RFD4 8004,
// so all five can run at once.
//
// POST /api/lessons  saves the lessons from the dashboard (admin.html) to data/lessons.json,
//                    after checking them and copying the old file to data/backups/.
// POST /api/publish  commits data/lessons.json and pushes (only once this folder is a git repo
//                    with a remote; until then it says so).
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { validateSite } from './js/validate.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT) || 8005;
export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.csv': 'text/plain; charset=utf-8',
  '.xvg': 'text/plain; charset=utf-8', '.py': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.zip': 'application/zip', '.whl': 'application/octet-stream'
};

const run = (cmd, args) => new Promise((res, rej) =>
  execFile(cmd, args, { cwd: root, timeout: 120000 }, (e, out, err) => (e ? rej(new Error(err || out || String(e))) : res(String(out)))));

const json = (res, status, obj) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(obj));

async function body(req, limit = 4e6) {
  let s = '';
  for await (const chunk of req) { s += chunk; if (s.length > limit) throw new Error('too large'); }
  return s;
}

export async function saveLessons(dir, raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return { status: 400, out: { ok: false, message: 'Not JSON.' } }; }
  const bad = validateSite(data);
  if (bad.length) return { status: 400, out: { ok: false, message: bad.join(' ') } };
  const target = join(dir, 'data/lessons.json');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  await mkdir(join(dir, 'data/backups'), { recursive: true });
  const backup = `data/backups/lessons-${stamp}.json`;
  await copyFile(target, join(dir, backup)).catch(() => {});
  await writeFile(target, JSON.stringify(data, null, 1) + '\n');
  return { status: 200, out: { ok: true, backup } };
}

async function publish(res) {
  const files = ['data/lessons.json'];
  try {
    await run('git', ['rev-parse', '--is-inside-work-tree']);
  } catch {
    return json(res, 200, { ok: false, message: 'This folder is not a git repo yet, so there is nothing to push. Your lessons are saved locally.' });
  }
  try {
    await run('git', ['add', ...files]);
    if (!(await run('git', ['status', '--porcelain', ...files])).trim()) return json(res, 200, { ok: true, message: 'Nothing to publish: the saved lessons are already pushed.' });
    await run('git', ['commit', '-m', 'Update lessons from the dashboard']);
    const branch = (await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    await run('git', ['push', '-u', 'origin', branch]);
    json(res, 200, { ok: true, message: `Pushed to ${branch}. The live site updates in about two minutes.` });
  } catch (e) {
    json(res, 500, { ok: false, message: String(e.message || e) });
  }
}

export function handler(dir) {
  return async (req, res) => {
    try {
      if (req.method === 'POST' && req.url === '/api/lessons') {
        const { status, out } = await saveLessons(dir, await body(req));
        return json(res, status, out);
      }
      if (req.method === 'POST' && req.url === '/api/publish') return void await publish(res);
    } catch (e) {
      return json(res, 500, { ok: false, message: String(e.message || e) });
    }
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(dir, path));
    if (!file.startsWith(normalize(dir + sep)) && file !== normalize(dir)) return void res.writeHead(403).end();
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  createServer(handler(root)).listen(port, '127.0.0.1', () => console.log(`Plot Lab: http://localhost:${port}/  (dashboard: http://localhost:${port}/admin.html)`));
}
