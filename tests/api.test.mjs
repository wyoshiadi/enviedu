import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { handle } from '../server/api.ts';
import { openDatabase } from '../server/sqlite-adapter.mjs';
import { protocol, scenarios, fieldsFor } from '../server/config.ts';
import { createSession, submitAnswers, advanceStage, addRun, recordEvent, stageStartedAt } from '../src/domain/study.ts';
import { legacyProtocol, reflectionMinimumSeconds } from '../src/domain/workflow.ts';
import { INCOMPLETE_SESSION_IDLE_MS, purgeIdleSessions, scheduledSessionCleanup } from '../server/session-retention.ts';
const origin = 'https://enviedu.example';
function setup(t) {
  const DB = openDatabase(':memory:', fileURLToPath(new URL('../drizzle', import.meta.url)));
  t.after(() => DB.close());
  const env = { DB, TEACHER_EMAIL: 'owner@example.edu' };
  async function request(path, { method = 'GET', teacher = false, email = env.TEACHER_EMAIL, cookie, data, requestOrigin = origin } = {}) {
    const headers = new Headers();
    if (cookie) headers.set('Cookie', cookie);
    if (method !== 'GET') headers.set('Origin', requestOrigin);
    if (data !== undefined) headers.set('Content-Type', 'application/json');
    return handle(new Request(origin + path, { method, headers, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }), env, {}, {
      ...(teacher ? { identity: { userId: 'verified-site-user', email } } : {})
    });
  }
  return { DB, env, request };
}
async function register(request, participantId = 'TEST-' + crypto.randomUUID().slice(0, 8), classId = 'A') {
  const response = await request('/api/student/sessions', { method: 'POST', data: { participantId, classId } }); assert.equal(response.status, 201);
  const metadata = await response.json(), cookie = response.headers.get('Set-Cookie').split(';')[0];
  const session = { ...createSession(metadata.participantId, metadata.condition, protocol, scenarios, metadata.createdAt), sessionId: metadata.sessionId };
  return { metadata, cookie, session, response };
}
function complete(initial) {
  let session = structuredClone(initial);
  while (session.stage !== 'complete') {
    if (session.stage.endsWith('-experiment')) {
      const scenario = scenarios.find(s => session.stage.startsWith(s.id));
      session = addRun(session, scenario, session.updatedAt);
      session.parameters[scenario.id].inflowAfter = 0;
      session = addRun(session, scenario, session.updatedAt);
    } else {
      const fields = fieldsFor(session.stage, session.condition), values = {};
      const correct = session.stage === 'pretest' ? { familiarity: '0', stock: 'stock', change: 'rise', balance: '30' } : session.stage === 'posttest' ? { stock: 'backlog', change: 'fall', balance: '45' } : session.stage === 'transfer' ? { stock: 'amount', change: 'rise', balance: '110', policy: 'less-than' } : {};
      for (const field of fields) values[field.id] = correct[field.id] || (field.type === 'choice' ? field.options[0].value : 'The difference between the flows determines the change in stock.');
      session = submitAnswers(session, values, fields, session.updatedAt);
    }
    const at = new Date(Math.max(Date.parse(session.updatedAt), stageStartedAt(session) + reflectionMinimumSeconds(session.configuration.protocol, session.stage) * 1000)).toISOString();
    session = advanceStage(session, at);
  }
  return session;
}
test('all teacher records, settings and exports require the single teacher identity', async t => {
  const { request } = setup(t);
  for (const path of ['/api/teacher/auth','/api/teacher/submissions','/api/teacher/settings','/api/teacher/export?kind=responses','/api/teacher/submissions/00000000-0000-4000-8000-000000000000']) {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, { teacher: true, email: 'another@example.edu' })).status, 403);
  }
  assert.equal((await request('/api/teacher/auth', { teacher: true })).status, 200);
  const empty = await (await request('/api/teacher/submissions', { teacher: true })).json();
  assert.deepEqual(empty.classes.map(c => [c.id, c.total, c.completed, c.mean_transfer]), [['A', 0, 0, null], ['B', 0, 0, null]]);
});
test('students start with their supplied ID without login and receive a private, scoped upload cookie', async t => {
  const { request } = setup(t), student = await register(request, '  Student_001-A  ');
  const cookie = student.response.headers.get('Set-Cookie');
  assert.ok(cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax') && cookie.includes('Secure') && cookie.includes('Path=/api/student'));
  assert.equal(student.metadata.participantId, 'Student_001-A');
  assert.equal(student.metadata.classId, 'A');
  assert.equal(student.metadata.condition, 'guided');
  assert.equal((await request('/api/student/sessions')).status, 404);
  assert.equal((await request('/api/student/sessions/' + student.metadata.sessionId, { cookie: student.cookie })).status, 404);
});
test('registration requires a valid participant ID and never generates one for missing or invalid input', async t => {
  const { request, DB } = setup(t);
  for (const participantId of [undefined, null, 12345, '', '   ', 'ab', 'a'.repeat(33), 'student id', 'student@example.edu', '<script>', '学生001']) {
    const response = await request('/api/student/sessions', { method: 'POST', data: { participantId, classId: 'A' } });
    assert.equal(response.status, 400, String(participantId));
    assert.equal(response.headers.get('Set-Cookie'), null);
  }
  assert.equal((await request('/api/student/sessions', { method: 'POST' })).status, 415);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM submissions').first()).total, 0);
  for (const code of ['A_1', 'A'.repeat(32)]) assert.equal((await register(request, code)).metadata.participantId, code);
});

test('registration requires an assigned class and rejects condition overrides', async t => {
  const { request, DB } = setup(t);
  for (const classId of [undefined, null, '', 'C', 'guided', 'a', 1, ['A'], { id: 'A' }]) {
    const response = await request('/api/student/sessions', { method: 'POST', data: { participantId: 'CLASS-001', classId } });
    assert.equal(response.status, 400, JSON.stringify(classId));
    assert.equal(response.headers.get('Set-Cookie'), null);
  }
  for (const [classId, condition] of [['A', 'separate'], ['B', 'guided']]) {
    assert.equal((await request('/api/student/sessions', { method: 'POST', data: { participantId: 'CLASS-001', classId, condition } })).status, 400);
  }
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM submissions').first()).total, 0);
});

test('reusing a participant ID in either class preserves the original submission and upload access', async t => {
  const { request, DB } = setup(t), student = await register(request, 'Assigned-001');
  const duplicate = await request('/api/student/sessions', { method: 'POST', data: { participantId: 'Assigned-001', classId: 'B' } });
  assert.equal(duplicate.status, 409);
  assert.match((await duplicate.json()).error, /already in use/);
  assert.equal(duplicate.headers.get('Set-Cookie'), null);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM submissions').first()).total, 1);
  assert.equal((await request('/api/student/sessions/' + student.metadata.sessionId, { method: 'PUT', cookie: student.cookie, data: student.session })).status, 200);
});

test('students can write only their own session and cannot change their assigned class condition', async t => {
  const { request } = setup(t), a = await register(request), b = await register(request);
  assert.equal((await request('/api/student/sessions/' + a.metadata.sessionId, { method: 'PUT', data: a.session })).status, 401);
  assert.equal((await request('/api/student/sessions/' + b.metadata.sessionId, { method: 'PUT', cookie: a.cookie, data: b.session })).status, 401);
  assert.equal((await request('/api/student/sessions/' + a.metadata.sessionId, { method: 'PUT', cookie: a.cookie, data: { ...a.session, condition: 'separate' } })).status, 403);
  assert.equal((await request('/api/student/sessions/' + a.metadata.sessionId, { method: 'PUT', cookie: a.cookie, data: a.session })).status, 200);
});
test('cross-site mutations fail even with a valid teacher or upload capability', async t => {
  const { request } = setup(t), student = await register(request);
  assert.equal((await request('/api/student/sessions', { method: 'POST', requestOrigin: 'https://attacker.example' })).status, 403);
  assert.equal((await request('/api/student/sessions/' + student.metadata.sessionId, { method: 'PUT', cookie: student.cookie, data: student.session, requestOrigin: 'https://attacker.example' })).status, 403);
  assert.equal((await request('/api/teacher/settings', { method: 'PUT', teacher: true, data: { condition: 'separate' }, requestOrigin: 'https://attacker.example' })).status, 403);
});
test('both classes have fixed conditions independent of legacy teacher settings and preserve existing sessions', async t => {
  const { request, DB } = setup(t);
  await DB.prepare("INSERT INTO study_settings (id,condition) VALUES (1,'separate')").run();
  const a = await register(request, 'CLASS-A-001', 'A'), b = await register(request, 'CLASS-B-001', 'B');
  assert.equal(a.metadata.condition, 'guided');
  assert.equal(b.metadata.condition, 'separate');
  assert.equal(b.metadata.classId, 'B');
  const settings = await (await request('/api/teacher/settings', { teacher: true })).json();
  assert.deepEqual(settings.classes.map(c => [c.id, c.condition]), [['A', 'guided'], ['B', 'separate']]);
  assert.equal((await request('/api/teacher/settings', { method: 'PUT', teacher: true, data: { condition: 'separate' } })).status, 405);
  a.session.events[0].payload = { allocation: 'manual-pilot', condition: 'guided' };
  for (const student of [a, b]) assert.equal((await request('/api/student/sessions/' + student.metadata.sessionId, { method: 'PUT', cookie: student.cookie, data: student.session })).status, 200);
});
test('completed work is stored centrally and upload acknowledgements reveal no results', async t => {
  const { request } = setup(t), student = await register(request), full = complete(student.session);
  const response = await request('/api/student/sessions/' + full.sessionId, { method: 'PUT', cookie: student.cookie, data: full });
  assert.equal(response.status, 200); const receipt = await response.json();
  assert.deepEqual(Object.keys(receipt).sort(), ['saved','sequence','submittedAt']); assert.ok(receipt.submittedAt);
  const detail = await (await request('/api/teacher/submissions/' + full.sessionId, { teacher: true })).json();
  assert.equal(detail.session.responses.length, 26); assert.equal(detail.session.runs.length, 4);
  assert.deepEqual(detail.scores.map(s => s.objectiveScore), [3,3,4]);
  assert.equal(detail.submission.transfer_score, 4); assert.ok(!('token_hash' in detail.submission));
});
test('final submissions are immutable and duplicate uploads are idempotent', async t => {
  const { request } = setup(t), student = await register(request), full = complete(student.session), path = '/api/student/sessions/' + full.sessionId;
  assert.equal((await request(path, { method: 'PUT', cookie: student.cookie, data: full })).status, 200);
  assert.equal((await request(path, { method: 'PUT', cookie: student.cookie, data: full })).status, 200);
  const changed = recordEvent(full, 'client_change', {}, full.updatedAt);
  assert.equal((await request(path, { method: 'PUT', cookie: student.cookie, data: changed })).status, 409);
});
test('invalid model data and incomplete assessments are rejected server-side', async t => {
  const { request } = setup(t), student = await register(request), full = complete(student.session), path = '/api/student/sessions/' + full.sessionId;
  const corrupt = structuredClone(full); corrupt.runs[0].series[1].stock = 999;
  assert.equal((await request(path, { method: 'PUT', cookie: student.cookie, data: corrupt })).status, 400);
  const missing = structuredClone(full); missing.responses = missing.responses.filter(r => !(r.stage === 'pretest' && r.itemId === 'stock'));
  assert.equal((await request(path, { method: 'PUT', cookie: student.cookie, data: missing })).status, 400);
});
test('server enforces class journeys, complete case reflections, and matched minimum time', async t => {
  const { request } = setup(t);
  for (const classId of ['A', 'B']) {
    const student = await register(request, 'JOURNEY-' + classId, classId), full = complete(student.session);
    const path = '/api/student/sessions/' + full.sessionId;
    const foreign = structuredClone(full); foreign.events[1].stage = classId === 'A' ? 'waste-reflection' : 'comparison';
    assert.equal((await request(path, { method: 'PUT', cookie: student.cookie, data: foreign })).status, 400);
    const missing = structuredClone(full); missing.responses = missing.responses.filter(r => r.itemId !== (classId === 'A' ? 'relationship' : 'flood-policy'));
    assert.equal((await request(path, { method: 'PUT', cookie: student.cookie, data: missing })).status, 400);
    const rushed = structuredClone(full), stage = classId === 'A' ? 'comparison' : 'waste-reflection';
    const entry = rushed.events.find(e => e.stage === stage && e.type === 'stage_entered');
    const finish = rushed.events.find(e => e.stage === stage && e.type === 'stage_completed');
    finish.at = entry.at; finish.elapsedMs = entry.elapsedMs;
    assert.equal((await request(path, { method: 'PUT', cookie: student.cookie, data: rushed })).status, 400);
    assert.equal((await request(path, { method: 'PUT', cookie: student.cookie, data: full })).status, 200);
    const detail = await (await request('/api/teacher/submissions/' + full.sessionId, { teacher: true })).json();
    assert.equal(detail.session.responses.filter(r => r.stage === 'comparison').length, classId === 'A' ? 4 : 0);
    assert.equal(detail.session.responses.filter(r => r.stage.endsWith('-reflection')).length, classId === 'B' ? 4 : 0);
  }
});

test('existing collection-v4 registrations can finish and be reviewed without relabelling', async t => {
  const { request, DB } = setup(t), student = await register(request, 'LEGACY-001', 'B');
  await DB.prepare('UPDATE submissions SET protocol_version=? WHERE id=?').bind(legacyProtocol.version, student.metadata.sessionId).run();
  const old = { ...createSession(student.metadata.participantId, 'separate', legacyProtocol, scenarios, student.metadata.createdAt), sessionId: student.metadata.sessionId };
  const full = complete(old);
  assert.equal((await request('/api/student/sessions/' + full.sessionId, { method: 'PUT', cookie: student.cookie, data: full })).status, 200);
  const detail = await (await request('/api/teacher/submissions/' + full.sessionId, { teacher: true })).json();
  assert.equal(detail.session.protocolVersion, legacyProtocol.version);
  assert.equal(detail.session.responses.filter(r => r.stage === 'reflection').length, 4);
});

test('teachers can review both class summaries, filter classes and export their answers', async t => {
  const { request } = setup(t), a = await register(request, 'CLASS-A-001', 'A'), b = await register(request, 'CLASS-B-001', 'B');
  await register(request, 'CLASS-B-002', 'B');
  for (const s of [a,b]) assert.equal((await request('/api/student/sessions/' + s.metadata.sessionId, { method: 'PUT', cookie: s.cookie, data: complete(s.session) })).status, 200);
  const list = await (await request('/api/teacher/submissions?status=complete', { teacher: true })).json();
  assert.equal(list.total, 2); assert.equal(list.summary.completed, 2); assert.equal(list.summary.mean_transfer, 4);
  assert.equal(list.summary.total, 3);
  assert.deepEqual(list.classes.map(c => [c.id, c.total, c.completed, c.mean_transfer]), [['A', 1, 1, 4], ['B', 2, 1, 4]]);
  const classA = await (await request('/api/teacher/submissions?condition=guided', { teacher: true })).json();
  assert.equal(classA.total, 1); assert.equal(classA.submissions[0].id, a.metadata.sessionId);
  const classB = await (await request('/api/teacher/submissions?condition=separate&status=in-progress', { teacher: true })).json();
  assert.equal(classB.total, 1); assert.equal(classB.submissions[0].participant_code, 'CLASS-B-002');
  const filtered = await (await request('/api/teacher/submissions?search=' + a.metadata.participantId, { teacher: true })).json(); assert.equal(filtered.total, 1);
  const sql = await (await request('/api/teacher/submissions?search=' + encodeURIComponent("' OR 1=1--"), { teacher: true })).json(); assert.equal(sql.total, 0);
  const csv = await (await request('/api/teacher/export?kind=responses', { teacher: true })).text();
  assert.ok(csv.includes(a.metadata.participantId) && csv.includes(b.metadata.participantId) && csv.includes('explanation'));
  assert.ok(csv.includes('"class_id"') && csv.includes('"A","guided"') && csv.includes('"B","separate"'));
  for (const kind of ['responses', 'scores']) {
    const filteredCSV = await (await request('/api/teacher/export?kind=' + kind + '&condition=separate', { teacher: true })).text();
    assert.ok(filteredCSV.includes(b.metadata.participantId) && !filteredCSV.includes(a.metadata.participantId));
  }
  assert.equal((await request('/api/teacher/export?kind=responses', { cookie: a.cookie })).status, 401);
});
test('per-student downloads are teacher-only and retain the research metadata', async t => {
  const { request } = setup(t), student = await register(request), full = complete(student.session);
  await request('/api/student/sessions/' + full.sessionId, { method: 'PUT', cookie: student.cookie, data: full });
  for (const kind of ['responses','scores','events','timeseries','session']) {
    const path = '/api/teacher/submissions/' + full.sessionId + '/export?kind=' + kind;
    assert.equal((await request(path, { cookie: student.cookie })).status, 401);
    const response = await request(path, { teacher: true }); assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.ok((await response.text()).includes(full.participantId));
  }
});

test('bulk deletion requires the teacher account and same-origin requests', async t => {
  const { request, DB } = setup(t), student = await register(request);
  const data = { ids: [student.metadata.sessionId] };
  assert.equal((await request('/api/teacher/submissions/selection')).status, 401);
  assert.equal((await request('/api/teacher/submissions/selection', { teacher: true, email: 'other@example.edu' })).status, 403);
  assert.equal((await request('/api/teacher/submissions', { method: 'DELETE', cookie: student.cookie, data })).status, 401);
  assert.equal((await request('/api/teacher/submissions', { method: 'DELETE', teacher: true, email: 'other@example.edu', data })).status, 403);
  assert.equal((await request('/api/teacher/submissions', { method: 'DELETE', teacher: true, data, requestOrigin: 'https://attacker.example' })).status, 403);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM submissions').first()).total, 1);
});

test('bulk deletion rejects empty, duplicate, malformed and oversized selections without deleting anything', async t => {
  const { request, DB } = setup(t), student = await register(request), id = student.metadata.sessionId;
  for (const data of [null, {}, { ids: [] }, { ids: 'all' }, { ids: [id, id] }, { ids: [null] }, { ids: [123] }, { ids: ["' OR 1=1 --"] }, { ids: ['-'.repeat(36)] }, { ids: Array.from({ length: 501 }, () => crypto.randomUUID()) }]) {
    assert.equal((await request('/api/teacher/submissions', { method: 'DELETE', teacher: true, data })).status, 400, JSON.stringify(data).slice(0, 100));
  }
  assert.equal((await request('/api/teacher/submissions', { method: 'DELETE', teacher: true })).status, 415);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM submissions').first()).total, 1);
});

test('select all snapshots only matching IDs across pages and never includes new arrivals in deletion', async t => {
  const { request, DB } = setup(t);
  const selected = [];
  for (let index = 0; index < 27; index++) selected.push(await register(request, 'BULK-A-' + index, 'A'));
  const b = await register(request, 'BULK-B-KEEP', 'B');
  const full = complete(selected[0].session);
  assert.equal((await request('/api/student/sessions/' + full.sessionId, { method: 'PUT', cookie: selected[0].cookie, data: full })).status, 200);
  const page = await (await request('/api/teacher/submissions?condition=guided', { teacher: true })).json();
  assert.equal(page.submissions.length, 25); assert.equal(page.total, 27);
  const snapshot = await (await request('/api/teacher/submissions/selection?condition=guided&search=BULK-A-&page=2', { teacher: true })).json();
  assert.equal(snapshot.submissions.length, 27);
  assert.ok(snapshot.submissions.every(row => Object.keys(row).sort().join(',') === 'id,participant_code'));
  const completed = await (await request('/api/teacher/submissions/selection?condition=guided&status=complete', { teacher: true })).json();
  assert.deepEqual(completed.submissions.map(row => row.id), [full.sessionId]);
  const newArrival = await register(request, 'BULK-A-NEW', 'A');
  const response = await request('/api/teacher/submissions', { method: 'DELETE', teacher: true, data: { ids: snapshot.submissions.map(row => row.id) } });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { deleted: 27 });
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM submissions').first()).total, 2);
  for (const kept of [b, newArrival]) assert.equal((await request('/api/teacher/submissions/' + kept.metadata.sessionId, { teacher: true })).status, 200);
  assert.equal((await request('/api/teacher/submissions/' + full.sessionId, { teacher: true })).status, 404);
  const after = await (await request('/api/teacher/submissions', { teacher: true })).json();
  assert.equal(after.summary.total, 2); assert.equal(after.summary.completed, 0); assert.equal(after.summary.mean_transfer, null);
  assert.deepEqual(after.classes.map(c => [c.id, c.total, c.completed]), [['A', 1, 0], ['B', 1, 0]]);
  assert.ok(!(await (await request('/api/teacher/export?kind=responses', { teacher: true })).text()).includes(full.participantId));
  assert.equal((await request('/api/student/sessions/' + full.sessionId, { method: 'PUT', cookie: selected[0].cookie, data: full })).status, 410);
  const reused = await register(request, full.participantId, 'B');
  assert.notEqual(reused.metadata.sessionId, full.sessionId);
  assert.equal((await request('/api/student/sessions/' + reused.metadata.sessionId, { method: 'PUT', cookie: selected[0].cookie, data: reused.session })).status, 401);
  const retry = await request('/api/teacher/submissions', { method: 'DELETE', teacher: true, data: { ids: snapshot.submissions.map(row => row.id) } });
  assert.deepEqual(await retry.json(), { deleted: 0 });
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM submissions').first()).total, 3);
});

test('bulk deletion chunks parameter lists and rolls back the whole batch when a later delete fails', async t => {
  const { request, DB } = setup(t), ids = [];
  for (let index = 0; index < 81; index++) ids.push((await register(request, 'CHUNK-' + index)).metadata.sessionId);
  await DB.prepare("CREATE TRIGGER reject_last_delete BEFORE DELETE ON submissions WHEN OLD.participant_code='CHUNK-80' BEGIN SELECT RAISE(ABORT, 'test rollback'); END").run();
  assert.equal((await request('/api/teacher/submissions', { method: 'DELETE', teacher: true, data: { ids } })).status, 500);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM submissions').first()).total, 81);
  await DB.prepare('DROP TRIGGER reject_last_delete').run();
  const original = DB.prepare.bind(DB);
  DB.prepare = sql => {
    if (sql.startsWith('DELETE FROM submissions')) assert.ok((sql.match(/\?/g) || []).length <= 100);
    return original(sql);
  };
  const response = await request('/api/teacher/submissions', { method: 'DELETE', teacher: true, data: { ids } });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { deleted: 81 });
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM submissions').first()).total, 0);
});

test('all-matching selection is bounded before returning a large selection', async t => {
  const { request, DB } = setup(t), student = await register(request);
  for (let index = 0; index < 500; index++) await DB.prepare('INSERT INTO submissions (id,participant_code,condition,protocol_version,token_hash,created_at,updated_at,stage,expires_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), 'LIMIT-' + index, 'separate', protocol.version, 'unused', student.session.createdAt, student.session.createdAt, 'pretest', '2099-01-01T00:00:00Z').run();
  assert.equal((await request('/api/teacher/submissions/selection', { teacher: true })).status, 400);
  const filtered = await (await request('/api/teacher/submissions/selection?condition=guided', { teacher: true })).json();
  assert.deepEqual(filtered.submissions.map(row => row.id), [student.metadata.sessionId]);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM submissions').first()).total, 501);
});

test('scheduled cleanup removes unfinished sessions at one hour and always keeps completed submissions', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-25T00:00:00.000Z') });
  const { request, DB, env } = setup(t), a = await register(request, 'IDLE-A', 'A'), b = await register(request, 'IDLE-B', 'B');
  const finished = await register(request, 'KEEP-COMPLETE', 'B'), full = complete(finished.session);
  assert.equal((await request('/api/student/sessions/' + full.sessionId, { method: 'PUT', cookie: finished.cookie, data: full })).status, 200);
  await DB.prepare('UPDATE submissions SET updated_at=? WHERE id=?').bind('2026-01-01T00:00:00.000Z', full.sessionId).run();
  // A recorded submission timestamp is also protected if metadata is inconsistent.
  const protectedRow = await register(request, 'KEEP-SUBMITTED');
  await DB.prepare('UPDATE submissions SET submitted_at=?,updated_at=? WHERE id=?').bind('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', protectedRow.metadata.sessionId).run();
  t.mock.timers.tick(INCOMPLETE_SESSION_IDLE_MS - 1);
  assert.equal(await purgeIdleSessions(DB), 0);
  t.mock.timers.tick(1);
  await scheduledSessionCleanup({ scheduledTime: Date.now() }, env);
  const rows = (await DB.prepare('SELECT id FROM submissions ORDER BY participant_code').all()).results.map(row => row.id);
  assert.deepEqual(rows, [full.sessionId, protectedRow.metadata.sessionId]);
  for (const stale of [a, b]) assert.equal((await DB.prepare('SELECT id FROM submissions WHERE id=?').bind(stale.metadata.sessionId).first()), null);
  assert.equal(await purgeIdleSessions(DB), 0, 'Repeated cleanup is idempotent');
});

test('accepted progress renews the idle window, while duplicate uploads and device timestamps cannot renew it', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-25T00:00:00.000Z') });
  const { request, DB } = setup(t), student = await register(request, 'ACTIVE-STUDENT');
  t.mock.timers.tick(30 * 60000);
  // A future device event timestamp must not become the server retention clock.
  const progress = recordEvent(student.session, 'session_resumed', {}, '2099-01-01T00:00:00.000Z');
  const path = '/api/student/sessions/' + student.metadata.sessionId;
  assert.equal((await request(path, { method: 'PUT', cookie: student.cookie, data: progress })).status, 200);
  const receiptTime = (await DB.prepare('SELECT updated_at FROM submissions WHERE id=?').bind(student.metadata.sessionId).first()).updated_at;
  t.mock.timers.tick(30 * 60000);
  assert.equal(await purgeIdleSessions(DB), 0, 'An hour since starting does not expire an active session');
  t.mock.timers.tick(30 * 60000 - 1);
  assert.equal((await request(path, { method: 'PUT', cookie: student.cookie, data: progress })).status, 200);
  assert.equal((await DB.prepare('SELECT updated_at FROM submissions WHERE id=?').bind(student.metadata.sessionId).first()).updated_at, receiptTime);
  t.mock.timers.tick(1);
  assert.equal((await request(path, { method: 'PUT', cookie: student.cookie, data: progress })).status, 410);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM submissions').first()).total, 0);
});

test('late final submissions cannot revive expired data and the same participant can start a new session', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-25T00:00:00.000Z') });
  const { request, DB } = setup(t), student = await register(request, 'RESTART-IDLE');
  const full = complete(student.session);
  t.mock.timers.tick(INCOMPLETE_SESSION_IDLE_MS);
  assert.equal((await request('/api/student/sessions/' + full.sessionId, { method: 'PUT', cookie: student.cookie, data: full })).status, 410);
  const next = await register(request, student.metadata.participantId, 'B');
  assert.notEqual(next.metadata.sessionId, student.metadata.sessionId);
  assert.equal((await request('/api/student/sessions/' + student.metadata.sessionId, { method: 'PUT', cookie: student.cookie, data: full })).status, 410);
  assert.equal((await request('/api/student/sessions/' + next.metadata.sessionId, { method: 'PUT', cookie: student.cookie, data: next.session })).status, 401);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM submissions').first()).total, 1);
});

test('dashboard reads purge stale sessions before counting, selecting, and exporting', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-25T00:00:00.000Z') });
  const { request, DB } = setup(t), stale = await register(request, 'PURGE-OLD', 'A'), saved = await register(request, 'PURGE-KEEP', 'B');
  const full = complete(saved.session);
  await request('/api/student/sessions/' + full.sessionId, { method: 'PUT', cookie: saved.cookie, data: full });
  t.mock.timers.tick(INCOMPLETE_SESSION_IDLE_MS);
  assert.equal((await request('/api/teacher/submissions')).status, 401);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM submissions').first()).total, 2, 'Unauthorized reads do not run cleanup');
  const list = await (await request('/api/teacher/submissions', { teacher: true })).json();
  assert.equal(list.total, 1); assert.equal(list.summary.completed, 1); assert.equal(list.summary.mean_transfer, 4);
  assert.deepEqual(list.classes.map(c => [c.id, c.total, c.completed]), [['A', 0, 0], ['B', 1, 1]]);
  const selected = await (await request('/api/teacher/submissions/selection', { teacher: true })).json();
  assert.deepEqual(selected.submissions.map(row => row.id), [full.sessionId]);
  const csv = await (await request('/api/teacher/export?kind=responses', { teacher: true })).text();
  assert.ok(csv.includes(full.participantId)); assert.ok(!csv.includes(stale.metadata.participantId));
});

test('registration reclaims expired participant IDs before the next scheduled cleanup', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-25T00:00:00.000Z') });
  const { request, DB } = setup(t), old = await register(request, 'RECLAIM-IDLE');
  t.mock.timers.tick(INCOMPLETE_SESSION_IDLE_MS);
  const fresh = await register(request, old.metadata.participantId);
  assert.notEqual(fresh.metadata.sessionId, old.metadata.sessionId);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM submissions').first()).total, 1);
});

test('cleanup failures are surfaced so scheduled executions can be monitored', async () => {
  await assert.rejects(scheduledSessionCleanup({ scheduledTime: Date.now() }, { DB: { prepare() { throw new Error('Database unavailable'); } } }), /Database unavailable/);
});

test('combined exports reject oversized data before loading session records', async t => {
  const { DB, request } = setup(t), student = await register(request);
  await DB.prepare('UPDATE submissions SET session_json=? WHERE id=?').bind(' '.repeat(8 * 1024 * 1024 + 1), student.metadata.sessionId).run();
  const response = await request('/api/teacher/export?kind=responses', { teacher: true });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Narrow the filters/);
});
