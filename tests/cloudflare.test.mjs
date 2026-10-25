import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { handle } from '../server/api.ts';
import { handleCloudflare } from '../server/cloudflare-handler.ts';
import { openDatabase } from '../server/sqlite-adapter.mjs';

const origin = 'https://enviedu.example';
const issuer = 'https://enviedu-test.cloudflareaccess.com';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const { privateKey: otherKey } = await generateKeyPair('RS256');
const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'test-key' }] });
async function token(claims = {}, signingKey = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: issuer, aud: 'enviedu-teacher', sub: 'teacher-id', email: 'owner@example.edu', iat: now, exp: now + 300, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(signingKey);
}
function setup(t) {
  const DB = openDatabase(':memory:', fileURLToPath(new URL('../drizzle', import.meta.url)));
  t.after(() => DB.close());
  const env = { DB, TEACHER_EMAIL: 'owner@example.edu', CF_ACCESS_TEAM_DOMAIN: issuer, CF_ACCESS_AUD: 'enviedu-teacher' };
  const request = (path, headers = {}, options = {}, configuration = env) => handleCloudflare(new Request(origin + path, { ...options, headers }), configuration, { '/index.html': { body: '<main>enviedu</main>', type: 'text/html' } }, keys);
  return { env, request };
}

test('standalone teacher endpoints reject missing tokens and forged identity headers', async t => {
  const { request, env } = setup(t);
  const forged = { 'oai-authenticated-user-id': 'spoofed', 'oai-authenticated-user-email': env.TEACHER_EMAIL, 'Cf-Access-Authenticated-User-Email': env.TEACHER_EMAIL };
  for (const path of ['/api/teacher/auth', '/api/teacher/submissions', '/api/teacher/settings', '/api/teacher/export?kind=responses', '/api/teacher/submissions/00000000-0000-4000-8000-000000000000']) {
    const response = await request(path, forged);
    assert.equal(response.status, 401, path);
    assert.equal((await response.json()).signInUrl, '/teacher');
  }
  assert.equal((await handle(new Request(origin + '/api/teacher/auth', { headers: forged }), env)).status, 401);
});

test('standalone teacher sign-in verifies signature, issuer, audience, expiration and identity claims', async t => {
  const { request } = setup(t);
  const invalid = [
    ['malformed token', 'not-a-jwt'],
    ['wrong signature', await token({}, otherKey)],
    ['wrong issuer', await token({ iss: 'https://other.cloudflareaccess.com' })],
    ['wrong audience', await token({ aud: 'different-app' })],
    ['expired token', await token({ exp: Math.floor(Date.now() / 1000) - 60 })],
    ['missing expiry', await token({ exp: undefined })],
    ['missing email', await token({ email: undefined })],
    ['missing subject', await token({ sub: undefined })],
    ['future token', await token({ nbf: Math.floor(Date.now() / 1000) + 300 })]
  ];
  for (const [name, value] of invalid) {
    assert.equal((await request('/api/teacher/auth', { 'Cf-Access-Jwt-Assertion': value })).status, 401, name);
  }
});

test('verified teacher can read both fixed classes; a different verified email is forbidden', async t => {
  const { request, env } = setup(t);
  const headers = { 'Cf-Access-Jwt-Assertion': await token() };
  const auth = await request('/api/teacher/auth', headers);
  assert.equal(auth.status, 200);
  assert.deepEqual(await auth.json(), { authenticated: true, email: env.TEACHER_EMAIL, signInUrl: '/teacher', signOutUrl: '/cdn-cgi/access/logout' });
  assert.equal((await request('/api/teacher/submissions', headers)).status, 200);
  const update = await request('/api/teacher/settings', { ...headers, Origin: origin, 'Content-Type': 'application/json' }, { method: 'PUT', body: JSON.stringify({ condition: 'separate' }) });
  assert.equal(update.status, 405);
  assert.deepEqual((await (await request('/api/teacher/settings', headers)).json()).classes.map(c => [c.id, c.condition]), [['A', 'guided'], ['B', 'separate']]);
  assert.equal((await request('/api/teacher/auth', { 'Cf-Access-Jwt-Assertion': await token({ email: 'other@example.edu' }), 'oai-authenticated-user-email': env.TEACHER_EMAIL })).status, 403);
});

test('selection and deletion require verified Cloudflare teacher tokens', async t => {
  const { request } = setup(t);
  const student = await request('/api/student/sessions', { Origin: origin, 'Content-Type': 'application/json' }, { method: 'POST', body: JSON.stringify({ participantId: 'CF-DELETE', classId: 'A' }) });
  const { sessionId } = await student.json();
  const payload = { method: 'DELETE', body: JSON.stringify({ ids: [sessionId] }) };
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  assert.equal((await request('/api/teacher/submissions', headers, payload)).status, 401);
  assert.equal((await request('/api/teacher/submissions', { ...headers, 'Cf-Access-Jwt-Assertion': await token({}, otherKey) }, payload)).status, 401);
  assert.equal((await request('/api/teacher/submissions', { ...headers, 'Cf-Access-Jwt-Assertion': await token({ email: 'other@example.edu' }) }, payload)).status, 403);
  assert.equal((await request('/api/teacher/submissions/selection')).status, 401);
  const identity = { 'Cf-Access-Jwt-Assertion': await token() };
  assert.equal((await (await request('/api/teacher/submissions/selection', identity)).json()).submissions.length, 1);
  const deleted = await request('/api/teacher/submissions', { ...headers, ...identity }, payload);
  assert.equal(deleted.status, 200); assert.deepEqual(await deleted.json(), { deleted: 1 });
  assert.equal((await (await request('/api/teacher/submissions/selection', identity)).json()).submissions.length, 0);
});

test('missing or invalid configuration fails closed for teachers while student collection stays public', async t => {
  const { request, env } = setup(t);
  for (const configuration of [
    { ...env, CF_ACCESS_AUD: undefined },
    { ...env, CF_ACCESS_TEAM_DOMAIN: undefined },
    { ...env, CF_ACCESS_TEAM_DOMAIN: 'https://attacker.example' },
    { ...env, CF_ACCESS_TEAM_DOMAIN: issuer + '/untrusted-path' }
  ]) {
    assert.equal((await request('/api/teacher/auth', {}, {}, configuration)).status, 503);
    assert.equal((await request('/', {}, {}, configuration)).status, 200);
    assert.equal((await request('/api/student/sessions', { Origin: origin, 'Content-Type': 'application/json' }, { method: 'POST', body: JSON.stringify({ participantId: 'CF-' + crypto.randomUUID().slice(0, 8), classId: 'A' }) }, configuration)).status, 201);
  }
  assert.equal((await request('/api/teacher/auth', { 'Cf-Access-Jwt-Assertion': await token() }, {}, { ...env, TEACHER_EMAIL: '' })).status, 503);
});
