import http from 'node:http';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { handle } from '../server/api.ts';
import { openDatabase } from '../server/sqlite-adapter.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(path.join(root, '.local'), { recursive: true });
const dbFile = process.env.ENVIEDU_LOCAL_DB || path.join(root, '.local/enviedu.sqlite');
const DB = openDatabase(dbFile, path.join(root, 'drizzle'));
const production = process.argv.includes('--production');
const vite = production ? null : await createViteServer({ configFile: path.join(root, 'vite.config.ts'), server: { middlewareMode: true }, appType: 'spa' });
const worker = production ? (await import(new URL('../dist/server/index.js', import.meta.url))).default : null;
const devToken = crypto.randomUUID() + crypto.randomUUID();
const env = { DB, TEACHER_EMAIL: 'teacher@enviedu.local' };
const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || '', origin = 'http://' + host, url = new URL(req.url, origin);
    if (!['localhost','127.0.0.1'].includes(url.hostname)) { res.writeHead(421).end('Loopback access only'); return; }
    if (url.pathname === '/dev/teacher-signin' || url.pathname === '/dev/teacher-signout') {
      const signedIn = url.pathname.endsWith('signin');
      res.writeHead(303, { 'Set-Cookie': `enviedu_local_teacher=${signedIn ? devToken : ''}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${signedIn ? 28800 : 0}`, Location: '/teacher', 'Cache-Control': 'no-store' }).end(); return;
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (value && !name.startsWith('oai-') && name !== 'cf-connecting-ip') headers.set(name, Array.isArray(value) ? value.join(',') : value);
    headers.set('CF-Connecting-IP', req.socket.remoteAddress || 'local');
    const authorized = (req.headers.cookie || '').split(';').some(c => c.trim() === 'enviedu_local_teacher=' + devToken);
    if (authorized) { headers.set('oai-authenticated-user-id', 'local-enviedu-teacher'); headers.set('oai-authenticated-user-email', env.TEACHER_EMAIL); }
    if (url.pathname.startsWith('/api/') || production) {
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 1024 * 1024 + 1) { res.writeHead(413).end('Request too large'); return; } chunks.push(chunk); }
      const request = new Request(url, { method: req.method, headers, ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: Buffer.concat(chunks) } : {}) });
      let result = await (worker ? worker.fetch(request, env) : handle(request, env, {}, {
        ...(authorized ? { identity: { userId: 'local-enviedu-teacher', email: env.TEACHER_EMAIL } } : {}),
        signInUrl: '/dev/teacher-signin', signOutUrl: '/dev/teacher-signout'
      }));
      if (url.pathname === '/api/teacher/auth') {
        const value = await result.json();
        result = new Response(JSON.stringify({ ...value, localDevelopment: true, signInUrl: '/dev/teacher-signin', signOutUrl: '/dev/teacher-signout' }), { status: result.status, headers: result.headers });
      }
      res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(Buffer.from(await result.arrayBuffer())); return;
    }
    vite.middlewares(req, res, () => { res.writeHead(404).end('Not found'); });
  } catch (error) { console.error(error instanceof Error ? error.message : 'Request failed'); res.writeHead(500).end('Request failed'); }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => {
  console.log(`enviedu: http://127.0.0.1:${server.address().port}`);
  console.log(`Teacher dashboard: http://127.0.0.1:${server.address().port}/teacher (local development sign-in)`);
});
async function stop() { server.close(); await vite?.close(); DB.close(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
