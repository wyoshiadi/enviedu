import test from 'node:test';
import assert from 'node:assert/strict';
import { SubmissionSync } from '../src/submissionSync.ts';
import { removeSessionProgress } from '../src/sessionStorage.ts';

test('an expired server session stops queued uploads and allows the UI to offer a fresh start', async t => {
  let calls = 0, answer;
  t.mock.method(globalThis, 'fetch', () => { calls++; return new Promise(resolve => { answer = resolve; }); });
  const notifications = [], sync = new SubmissionSync(status => notifications.push(status));
  t.after(() => sync.dispose());
  sync.enqueue({ sessionId: 'expired', stage: 'pretest', events: [1] });
  const first = sync.flush();
  sync.enqueue({ sessionId: 'expired', stage: 'pretest', events: [1, 2] });
  answer(Response.json({ error: 'This session expired after 1 hour without saved activity.' }, { status: 410 }));
  await first;
  assert.equal(notifications.at(-1).state, 'expired');
  assert.match(notifications.at(-1).message, /1 hour/);
  const count = notifications.length;
  sync.enqueue({ sessionId: 'expired', stage: 'pretest', events: [1, 2, 3] });
  await sync.flush();
  assert.equal(calls, 1); assert.equal(notifications.length, count);
});

test('temporary upload failures preserve progress for retry rather than expiring a live session', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1 ? Response.json({ error: 'Temporary outage' }, { status: 500 }) : Response.json({ sequence: 2, submittedAt: null }));
  const notifications = [], sync = new SubmissionSync(status => notifications.push(status));
  t.after(() => sync.dispose());
  sync.enqueue({ sessionId: 'active', stage: 'pretest', events: [1, 2] });
  await sync.flush();
  assert.equal(notifications.at(-1).state, 'error');
  await sync.flush();
  assert.equal(notifications.at(-1).state, 'saved'); assert.equal(calls, 2);
});

test('restarting removes only the expired session copies, including legacy namespaces', () => {
  const original = JSON.stringify({ sessionId: 'expired' });
  const data = new Map([
    ['enviedu:stock-flow:pilot-draft-5-class-journeys-en', original],
    ['previous-project:stock-flow:pilot-draft-4-collection-en', original],
    ['other:stock-flow:pilot-draft-4-collection-en', JSON.stringify({ sessionId: 'another-session' })],
    ['unrelated-preference', original],
    ['corrupt:stock-flow:draft', '{']
  ]);
  const storage = { getItem: key => data.get(key) ?? null, removeItem: key => data.delete(key), key: index => [...data.keys()][index] ?? null, get length() { return data.size; } };
  removeSessionProgress(storage, 'expired');
  assert.deepEqual([...data.keys()], ['other:stock-flow:pilot-draft-4-collection-en', 'unrelated-preference', 'corrupt:stock-flow:draft']);
});
