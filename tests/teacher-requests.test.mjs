import test from 'node:test';
import assert from 'node:assert/strict';
import { teacherFetch, teacherJSON, teacherSignInRequired } from '../src/teacherRequests.ts';

test('teacher requests retain JSON headers and ask Access for AJAX authentication errors', async t => {
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    assert.equal(path, '/api/teacher/settings');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.get('Content-Type'), 'application/json');
    assert.equal(options.headers.get('X-Requested-With'), 'XMLHttpRequest');
    return Response.json({ saved: true });
  });
  assert.equal((await teacherFetch('/api/teacher/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
});

test('expired sessions with HTML, malformed JSON or a redirect show sign-in recovery', async () => {
  for (const response of [
    new Response('<html>Sign in</html>', { status: 401, headers: { 'Content-Type': 'text/html' } }),
    new Response('invalid json', { status: 401, headers: { 'Content-Type': 'application/json' } }),
    Response.redirect('https://team.cloudflareaccess.com/login')
  ]) {
    assert.equal(teacherSignInRequired(response), true);
    const body = await teacherJSON(response);
    assert.equal(body.signInUrl, '/teacher');
    assert.match(body.error, /sign-in has expired/i);
  }
});
