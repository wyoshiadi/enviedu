import { validateSession } from '../src/domain/study.ts';
import { objectiveScores } from '../src/domain/scoring.ts';
import { researchExports, csv } from '../src/domain/export.ts';
import { classForCondition, studyClasses } from '../src/domain/classes.ts';
import { stagesFor } from '../src/domain/workflow.ts';
import { idleSessionCutoff, purgeIdleSessions } from './session-retention.ts';
import type { Session } from '../src/domain/types.ts';
import { protocol, scenarios, fieldsFor } from './config.ts';
import type { Assets, Database, Environment, Row, TeacherAccess } from './types.ts';

const COOKIE = 'enviedu_submission';
const MAX_BODY = 1024 * 1024;
const MAX_DELETE_SELECTION = 500;
const baseHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' };
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers: { ...baseHeaders, 'Content-Type': 'application/json; charset=utf-8', ...headers } });
function requireOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  if (origin !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new HttpError(403, 'Cross-site requests are not allowed.');
}
function teacher(env: Environment, access: TeacherAccess) {
  if (access.error) throw new HttpError(access.error.status, access.error.message);
  const { userId, email } = access.identity || {};
  if (!userId || !email) throw new HttpError(401, 'Sign in to the teacher account to continue.');
  if (!env.TEACHER_EMAIL) throw new HttpError(503, 'The teacher account is not configured.');
  if (email.trim().toLowerCase() !== env.TEACHER_EMAIL.trim().toLowerCase()) throw new HttpError(403, 'This account is not the configured teacher account.');
  return { email, userId };
}
export async function hash(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function cookie(request: Request): string {
  return request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
}
async function body(request: Request): Promise<unknown> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HttpError(415, 'Send a JSON request body.');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw new HttpError(413, 'This session exceeds the upload size limit.');
  const reader = request.body?.getReader(); if (!reader) throw new HttpError(400, 'A request body is required.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BODY) { await reader.cancel(); throw new HttpError(413, 'This session exceeds the upload size limit.'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, 'Invalid JSON.'); }
}
async function limit(db: Database, key: string, max: number, windowSeconds: number) {
  const now = Math.floor(Date.now() / 1000), bucket = Math.floor(now / windowSeconds);
  const row = await db.prepare('INSERT INTO request_buckets (key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(key + ':' + bucket, now + windowSeconds).first<{ hits: number }>();
  if (row && row.hits > max) throw new HttpError(429, 'Too many requests. Please wait a moment and try again.');
}
function validateSubmission(raw: unknown): Session {
  let session: Session;
  try { session = validateSession(raw, protocol, scenarios); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Invalid session.'); }
  const stages = stagesFor(session.configuration.protocol, session.condition);
  const current = stages.indexOf(session.stage);
  for (let i = 0; i <= current; i++) {
    const stage = stages[i], fields = fieldsFor(stage, session.condition), answers = session.responses.filter(r => r.stage === stage);
    if (i < current && fields.length !== answers.length) throw new HttpError(400, 'A preceding assessment is incomplete.');
    for (const answer of answers) {
      const field = fields.find(f => f.id === answer.itemId);
      if (!field || (field.type === 'choice' && !field.options?.some(o => o.value === answer.value)) || (field.type === 'number' && !Number.isFinite(Number(answer.value)))) throw new HttpError(400, 'Invalid assessment response.');
    }
  }
  if (session.responses.some(r => stages.indexOf(r.stage) > current)) throw new HttpError(400, 'The session contains answers from a later stage.');
  for (const scenario of scenarios) {
    const runs = session.runs.filter(r => r.scenario === scenario.id);
    if (runs.length && Object.keys(scenario.defaults).some(key => runs[0].parameters[key as keyof typeof scenario.defaults] !== scenario.defaults[key as keyof typeof scenario.defaults])) throw new HttpError(400, 'The first run must use the initial scenario conditions.');
  }
  return session;
}
function queryFilter(url: URL) {
  const clauses: string[] = [], values: unknown[] = [];
  const search = (url.searchParams.get('search') || '').trim().slice(0, 64), condition = url.searchParams.get('condition'), status = url.searchParams.get('status');
  if (search) { clauses.push('participant_code LIKE ?'); values.push('%' + search.replace(/[\\%_]/g, '\\$&') + '%'); clauses[clauses.length - 1] += " ESCAPE '\\'"; }
  if (condition === 'guided' || condition === 'separate') { clauses.push('condition=?'); values.push(condition); }
  if (status === 'complete') clauses.push("stage='complete'");
  if (status === 'in-progress') clauses.push("stage<>'complete'");
  return { where: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', values };
}
const listColumns = 'id,participant_code,condition,protocol_version,created_at,updated_at,submitted_at,stage,last_sequence,responses_count,runs_count,pre_score,post_score,transfer_score';
function csvResponse(content: string, filename: string) { return new Response(content, { headers: { ...baseHeaders, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` } }); }
async function api(request: Request, env: Environment, access: TeacherAccess): Promise<Response> {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (path === '/api/teacher/auth' && method === 'GET') {
    const identity = teacher(env, access); return json({ authenticated: true, email: identity.email, signInUrl: access.signInUrl, signOutUrl: access.signOutUrl });
  }
  if (path.startsWith('/api/teacher/')) {
    teacher(env, access);
    if (method === 'GET') await purgeIdleSessions(env.DB);
  }
  if (method !== 'GET' && method !== 'HEAD') requireOrigin(request);
  if (path === '/api/student/sessions' && method === 'POST') {
    await limit(env.DB, 'start:' + await hash(request.headers.get('CF-Connecting-IP') || 'unknown'), 200, 600);
    const raw = await body(request) as { participantId?: unknown; classId?: unknown; condition?: unknown } | null;
    const code = typeof raw?.participantId === 'string' ? raw.participantId.trim() : '';
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(code)) throw new HttpError(400, 'Enter your participant ID using 3–32 letters, numbers, hyphens, or underscores.');
    const selectedClass = studyClasses.find(studyClass => studyClass.id === raw?.classId);
    if (!selectedClass) throw new HttpError(400, 'Choose Class A or Class B as assigned by your teacher.');
    const condition = selectedClass.condition;
    if (raw?.condition !== undefined && raw.condition !== condition) throw new HttpError(400, 'The study condition must match your assigned class.');
    await purgeIdleSessions(env.DB);
    const id = crypto.randomUUID();
    const token = crypto.randomUUID() + crypto.randomUUID(), now = new Date().toISOString(), expires = new Date(Date.now() + 7 * 86400000).toISOString();
    const result = await env.DB.prepare('INSERT INTO submissions (id,participant_code,condition,protocol_version,token_hash,created_at,updated_at,stage,expires_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(participant_code) DO NOTHING').bind(id, code, condition, protocol.version, await hash(token), now, now, 'pretest', expires).run();
    if (!result.meta.changes) throw new HttpError(409, 'This participant ID is already in use. Continue in the browser where you started, or ask your teacher for help.');
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    return json({ sessionId: id, participantId: code, classId: selectedClass.id, condition, protocolVersion: protocol.version, createdAt: now }, 201, { 'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/api/student; Max-Age=604800${secure}` });
  }
  const upload = path.match(/^\/api\/student\/sessions\/([a-f0-9-]{36})$/);
  if (upload && method === 'PUT') {
    const token = cookie(request); if (!token) throw new HttpError(401, 'Your submission session has expired. Start a new session.');
    const tokenHash = await hash(token);
    await limit(env.DB, 'save:' + tokenHash, 200, 60);
    let row = await env.DB.prepare('SELECT * FROM submissions WHERE id=? AND token_hash=?').bind(upload[1], tokenHash).first();
    if (!row) {
      const existing = await env.DB.prepare('SELECT id FROM submissions WHERE id=?').bind(upload[1]).first();
      if (existing) throw new HttpError(401, 'Your submission session has expired.');
      throw new HttpError(410, 'This session is no longer available. Unfinished sessions expire after 1 hour without saved activity. Start a new session.');
    }
    if (row.stage !== 'complete' && row.submitted_at === null && String(row.updated_at) <= idleSessionCutoff()) {
      await purgeIdleSessions(env.DB, Date.now(), upload[1]);
      row = await env.DB.prepare('SELECT * FROM submissions WHERE id=? AND token_hash=?').bind(upload[1], tokenHash).first();
      if (!row) throw new HttpError(410, 'This session expired after 1 hour without saved activity. Start a new session.');
    }
    if (String(row.expires_at) < new Date().toISOString()) throw new HttpError(401, 'Your submission session has expired.');
    const session = validateSubmission(await body(request));
    if (session.sessionId !== row.id || session.participantId !== row.participant_code || session.condition !== row.condition || session.protocolVersion !== row.protocol_version || session.createdAt !== row.created_at) throw new HttpError(403, 'The submission does not match this student session.');
    const serialized = JSON.stringify(session), contentHash = await hash(serialized), seq = session.events.length;
    if (row.content_hash === contentHash) return json({ saved: true, sequence: row.last_sequence, submittedAt: row.submitted_at });
    if (row.stage === 'complete') throw new HttpError(409, 'This submission is final and cannot be changed.');
    if (seq <= Number(row.last_sequence)) throw new HttpError(409, 'A newer checkpoint is already saved.');
    const scores = objectiveScores(session), now = new Date().toISOString(), submittedAt = session.stage === 'complete' ? now : null;
    const result = await env.DB.prepare('UPDATE submissions SET updated_at=?,submitted_at=?,stage=?,session_json=?,content_hash=?,last_sequence=?,responses_count=?,runs_count=?,pre_score=?,post_score=?,transfer_score=? WHERE id=? AND last_sequence=? AND stage<>? AND submitted_at IS NULL AND updated_at>?').bind(now, submittedAt, session.stage, serialized, contentHash, seq, session.responses.length, session.runs.length, scores[0].objectiveScore, scores[1].objectiveScore, scores[2].objectiveScore, row.id, row.last_sequence, 'complete', idleSessionCutoff(Date.parse(now))).run();
    if (!result.meta.changes) {
      const existing = await env.DB.prepare('SELECT id FROM submissions WHERE id=?').bind(row.id).first();
      if (!existing) throw new HttpError(410, 'This session is no longer available. Start a new session.');
      throw new HttpError(409, 'A newer checkpoint is already saved.');
    }
    return json({ saved: true, sequence: seq, submittedAt });
  }
  if (path === '/api/teacher/settings' && method === 'GET') {
    return json({ classes: studyClasses });
  }
  if (path === '/api/teacher/settings' && method === 'PUT') {
    throw new HttpError(405, 'Class A always uses guided comparison; Class B always uses separate case. Ask students to select their assigned class.');
  }
  if (path === '/api/teacher/submissions/selection' && method === 'GET') {
    const filter = queryFilter(url);
    const rows = await env.DB.prepare('SELECT id,participant_code FROM submissions' + filter.where + ' ORDER BY updated_at DESC,id DESC LIMIT ?').bind(...filter.values, MAX_DELETE_SELECTION + 1).all();
    if (rows.results.length > MAX_DELETE_SELECTION) throw new HttpError(400, 'Select at most 500 sessions at a time. Narrow the filters to select fewer sessions.');
    return json({ submissions: rows.results });
  }
  if (path === '/api/teacher/submissions' && method === 'DELETE') {
    const raw = await body(request) as { ids?: unknown } | null;
    const ids = raw?.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_DELETE_SELECTION || ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) || new Set(ids).size !== ids.length) throw new HttpError(400, 'Choose between 1 and 500 distinct session IDs to delete.');
    // Only explicit IDs from the confirmed selection are removed. A batch is atomic,
    // and each statement stays below D1's limit of 100 bound parameters.
    const statements = [];
    for (let index = 0; index < ids.length; index += 80) {
      const chunk = ids.slice(index, index + 80);
      statements.push(env.DB.prepare('DELETE FROM submissions WHERE id IN (' + chunk.map(() => '?').join(',') + ')').bind(...chunk));
    }
    const results = await env.DB.batch(statements);
    return json({ deleted: results.reduce((count, result) => count + result.meta.changes, 0) });
  }
  if (path === '/api/teacher/submissions' && method === 'GET') {
    const filter = queryFilter(url), page = Math.max(1, Math.min(10000, Math.floor(Number(url.searchParams.get('page')) || 1))), pageSize = 25;
    const [rows, total, summary, classes] = await env.DB.batch([
      env.DB.prepare('SELECT ' + listColumns + ' FROM submissions' + filter.where + ' ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?').bind(...filter.values, pageSize, (page - 1) * pageSize),
      env.DB.prepare('SELECT COUNT(*) AS total FROM submissions' + filter.where).bind(...filter.values),
      env.DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN stage='complete' THEN 1 ELSE 0 END) AS completed,AVG(CASE WHEN stage='complete' THEN transfer_score ELSE NULL END) AS mean_transfer FROM submissions"),
      env.DB.prepare("SELECT condition,COUNT(*) AS total,SUM(CASE WHEN stage='complete' THEN 1 ELSE 0 END) AS completed,AVG(CASE WHEN stage='complete' THEN transfer_score ELSE NULL END) AS mean_transfer FROM submissions GROUP BY condition")
    ]);
    const classSummaries = studyClasses.map(studyClass => {
      const stats = classes.results.find(row => row.condition === studyClass.condition);
      return { ...studyClass, total: stats?.total || 0, completed: stats?.completed || 0, mean_transfer: stats?.mean_transfer ?? null };
    });
    return json({ submissions: rows.results, total: total.results[0]?.total || 0, page, pageSize, summary: summary.results[0], classes: classSummaries });
  }
  if (path === '/api/teacher/export' && method === 'GET') {
    const kind = url.searchParams.get('kind'); if (kind !== 'responses' && kind !== 'scores') throw new HttpError(400, 'Choose responses or scores for a combined export.');
    const filter = queryFilter(url);
    const count = await env.DB.prepare('SELECT COUNT(*) AS total,COALESCE(SUM(length(CAST(session_json AS BLOB))),0) AS bytes FROM submissions' + filter.where).bind(...filter.values).first<{ total: number; bytes: number }>();
    if (count && count.total > 500) throw new HttpError(400, 'Narrow the filters to at most 500 sessions per combined export.');
    if (count && count.bytes > 8 * 1024 * 1024) throw new HttpError(400, 'This export is too large. Narrow the filters or download individual submissions.');
    const rows = await env.DB.prepare('SELECT session_json FROM submissions' + filter.where + ' ORDER BY created_at,id').bind(...filter.values).all();
    const sessions = rows.results.filter(row => row.session_json).map(row => JSON.parse(String(row.session_json)) as Session);
    const base = (s: Session) => ({ participant_id: s.participantId, session_id: s.sessionId, class_id: classForCondition(s.condition).id, condition: s.condition, protocol_version: s.protocolVersion, instrument_language: protocol.language, app_version: s.appVersion, engine_version: s.engineVersion });
    const records = kind === 'responses' ? sessions.flatMap(s => s.responses.map(r => ({ ...base(s), stage: r.stage, item_id: r.itemId, value: r.value, submitted_at_utc: r.at }))) : sessions.flatMap(s => objectiveScores(s).map(r => ({ ...base(s), stage: r.stage, objective_score: r.objectiveScore, objective_max: r.maximum, items_answered: r.answered, manual_explanation_score: null, session_complete: s.stage === 'complete', instrument_status: 'draft-not-validated' })));
    const columns = records.length ? Object.keys(records[0]) : ['participant_id','session_id','class_id','condition','stage'];
    return csvResponse(csv(records, columns), 'enviedu-' + kind + '.csv');
  }
  const detail = path.match(/^\/api\/teacher\/submissions\/([a-f0-9-]{36})(?:\/(export))?$/);
  if (detail && method === 'GET') {
    const row = await env.DB.prepare('SELECT ' + listColumns + ',session_json FROM submissions WHERE id=?').bind(detail[1]).first();
    if (!row) throw new HttpError(404, 'Submission not found.');
    const session = row.session_json ? JSON.parse(String(row.session_json)) as Session : null;
    if (detail[2]) {
      if (!session) throw new HttpError(404, 'No answers have been saved yet.');
      const kind = url.searchParams.get('kind') || 'responses', exports = researchExports(session);
      if (!Object.hasOwn(exports, kind)) throw new HttpError(400, 'Invalid export type.');
      const value = exports[kind as keyof typeof exports], filename = `enviedu-${session.participantId}-${kind}.${kind === 'session' ? 'json' : 'csv'}`;
      if (kind === 'session') return new Response(value, { headers: { ...baseHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` } });
      return csvResponse(value, filename);
    }
    const { session_json: _raw, ...metadata } = row;
    return json({ submission: metadata, session, scores: session ? objectiveScores(session) : [] });
  }
  throw new HttpError(404, 'Not found.');
}
export async function handle(request: Request, env: Environment, assets: Assets = {}, access: TeacherAccess = {}): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return await api(request, env, access);
    if (request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
    if (url.pathname.startsWith('/teacher/') || url.pathname === '/teacher') {
      // The teacher shell contains no records or scoring keys. Every data endpoint authorizes separately.
      const entry = assets['/index.html']; if (entry) return new Response(request.method === 'HEAD' ? null : entry.body, { headers: { ...baseHeaders, 'Content-Type': entry.type } });
    }
    const asset = assets[url.pathname === '/' ? '/index.html' : url.pathname];
    if (!asset) throw new HttpError(404, 'Not found.');
    return new Response(request.method === 'HEAD' ? null : asset.body, { headers: { ...baseHeaders, 'Content-Type': asset.type, 'Cache-Control': url.pathname.startsWith('/assets/') ? 'public,max-age=31536000,immutable' : 'no-store' } });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, ...([401, 403].includes(error.status) ? { signInUrl: access.signInUrl || '/teacher', signOutUrl: access.signOutUrl || '/cdn-cgi/access/logout' } : {}) }, error.status);
    console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
    return json({ error: 'The service could not process this request. Please try again.' }, 500);
  }
}
