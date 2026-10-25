import { useEffect, useRef, useState } from 'react';
import { assessments, predictionFields, protocol, reflectionFields, revisionFields, scenarios, stageLabels } from './data.ts';
import type { Condition, Field, Session, Stage } from './domain/types.ts';
import { teacherFetch, teacherJSON, teacherSignInRequired } from './teacherRequests.ts';
import { BrandMark } from './components/BrandMark.tsx';
import { classForCondition, studyClasses } from './domain/classes.ts';
import { stagesFor } from './domain/workflow.ts';
type Submission = { id: string; participant_code: string; condition: Condition; protocol_version: string; stage: string; updated_at: string; submitted_at: string | null; responses_count: number; runs_count: number; pre_score: number | null; post_score: number | null; transfer_score: number | null };
type ClassSummary = { condition: Condition; total: number; completed: number; mean_transfer: number | null };
type List = { submissions: Submission[]; total: number; page: number; pageSize: number; summary: { total: number; completed: number | null; mean_transfer: number | null }; classes: ClassSummary[] };
type Detail = { submission: Submission; session: Session | null; scores: { stage: string; objectiveScore: number; maximum: number; answered: number }[] };
type Auth = { authenticated?: boolean; email?: string; signInUrl?: string; signOutUrl?: string; localDevelopment?: boolean; error?: string; forbidden?: boolean };
type SelectedSubmission = Pick<Submission, 'id' | 'participant_code'>;
const fmtTime = (value: string | null) => value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not submitted';
function fields(stage: string, condition: Condition): Field[] {
  if (stage === 'pretest' || stage === 'posttest' || stage === 'transfer') return assessments[stage].fields;
  if (stage === 'reflection' || stage === 'comparison' || stage.endsWith('-reflection')) return reflectionFields(condition, stage as Stage);
  if (stage.endsWith('-predict')) return predictionFields(scenarios.find(s => stage.startsWith(s.id))!);
  return stage.endsWith('-revise') ? revisionFields : [];
}
export function TeacherApp() {
  const [auth, setAuth] = useState<Auth | null>(null), [result, setData] = useState<List | null>(null), [detail, setDetail] = useState<Detail | null>(null);
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all'), [condition, setCondition] = useState('all'), [page, setPage] = useState(1);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [lastRefresh, setLastRefresh] = useState('');
  const [selected, setSelected] = useState<Map<string, SelectedSubmission>>(new Map());
  const [deleteTargets, setDeleteTargets] = useState<SelectedSubmission[] | null>(null), [deleting, setDeleting] = useState(false), [selecting, setSelecting] = useState(false);
  const [deleteError, setDeleteError] = useState(''), [notice, setNotice] = useState(''), [loadedQuery, setLoadedQuery] = useState('');
  const selectPage = useRef<HTMLInputElement>(null), deleteDialog = useRef<HTMLDialogElement>(null);
  const filters = new URLSearchParams({ search, status, condition }).toString();
  const query = new URLSearchParams({ search, status, condition, page: String(page) }).toString();
  const latestQuery = useRef(query), latestFilters = useRef(filters), loadSequence = useRef(0);
  latestQuery.current = query; latestFilters.current = filters;
  const data = loadedQuery === query ? result : null;
  const pageRows = data?.submissions ?? [];
  const selectedOnPage = pageRows.filter(row => selected.has(row.id)).length;
  const pageSelected = pageRows.length > 0 && selectedOnPage === pageRows.length;
  const selectionBusy = selecting || deleting || deleteTargets !== null;
  function requireSignIn(body: Auth) {
    setAuth(previous => ({ ...previous, ...body, authenticated: false }));
    setData(null); setDetail(null); setSelected(new Map()); setDeleteTargets(null);
  }
  async function request<T extends object = Record<string, unknown>>(path: string, options?: RequestInit) {
    const response = await teacherFetch(path, options);
    const body = await teacherJSON<T>(response);
    if (!response.ok || body.error) { if (teacherSignInRequired(response)) requireSignIn(body); throw new Error(body.error || 'The request failed.'); }
    return body;
  }
  async function load() {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const body = await request<List>('/api/teacher/submissions?' + query);
      if (sequence !== loadSequence.current || latestQuery.current !== query) return;
      setData(body); setLoadedQuery(query); setLastRefresh(new Date().toLocaleTimeString('en-GB')); setError('');
    }
    catch (e) { if (sequence === loadSequence.current && latestQuery.current === query) setError(e instanceof Error ? e.message : 'Unable to load submissions.'); }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  }
  useEffect(() => { void teacherFetch('/api/teacher/auth').then(async response => { const body = await teacherJSON<Auth>(response); setAuth({ ...body, authenticated: response.ok && body.authenticated === true, forbidden: response.status === 403 }); }).catch(() => setAuth({ error: 'Unable to connect to the teacher service.' })); }, []);
  useEffect(() => {
    if (!auth?.authenticated) return;
    const timer = setTimeout(() => void load(), 250);
    const poll = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15000);
    return () => { clearTimeout(timer); clearInterval(poll); };
  }, [auth?.authenticated, query]);
  useEffect(() => { setSelected(new Map()); setNotice(''); }, [filters]);
  useEffect(() => { if (selectPage.current) selectPage.current.indeterminate = selectedOnPage > 0 && !pageSelected; }, [selectedOnPage, pageSelected]);
  useEffect(() => {
    if (deleteTargets && auth?.authenticated) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleteTargets, auth?.authenticated]);
  function toggleSubmission(row: SelectedSubmission, checked: boolean) {
    if (checked && !selected.has(row.id) && selected.size >= 500) { setError('Select at most 500 sessions at a time.'); return; }
    setSelected(previous => { const next = new Map(previous); if (checked) next.set(row.id, { id: row.id, participant_code: row.participant_code }); else next.delete(row.id); return next; });
  }
  function togglePage(checked: boolean) {
    const next = new Map(selected);
    for (const row of pageRows) { if (checked) next.set(row.id, { id: row.id, participant_code: row.participant_code }); else next.delete(row.id); }
    if (next.size > 500) { setError('Select at most 500 sessions at a time.'); return; }
    setSelected(next);
  }
  async function selectAllMatching() {
    setSelecting(true); setError('');
    try {
      const body = await request<{ submissions: SelectedSubmission[] }>('/api/teacher/submissions/selection?' + filters);
      if (latestFilters.current === filters) setSelected(new Map(body.submissions.map(row => [row.id, row])));
    } catch (e) { if (latestFilters.current === filters) setError(e instanceof Error ? e.message : 'Unable to select sessions.'); }
    finally { setSelecting(false); }
  }
  async function deleteSelected() {
    if (!deleteTargets?.length || deleting) return;
    setDeleting(true); setDeleteError('');
    try {
      const { deleted } = await request<{ deleted: number }>('/api/teacher/submissions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: deleteTargets.map(row => row.id) }) });
      ++loadSequence.current;
      const removed = new Set(deleteTargets.map(row => row.id));
      setDetail(previous => previous && removed.has(previous.submission.id) ? null : previous);
      setSelected(new Map()); setDeleteTargets(null); setData(null);
      setNotice(`${deleted} ${deleted === 1 ? 'session' : 'sessions'} deleted.`);
      if (page === 1) await load(); else setPage(1);
    } catch (e) { setDeleteError(e instanceof Error ? e.message : 'Unable to delete the selected sessions.'); }
    finally { setDeleting(false); }
  }
  async function open(id: string) { try { setDetail(await request<Detail>('/api/teacher/submissions/' + id)); document.getElementById('submission-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to open this submission.'); } }
  async function download(path: string) {
    try {
      const response = await teacherFetch(path);
      if (!response.ok) { const body = await teacherJSON(response); if (teacherSignInRequired(response)) requireSignIn(body); throw new Error(body.error || 'Download failed.'); }
      const blob = await response.blob(), url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'enviedu-export.csv'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Download failed.'); }
  }
  const brand = <a className="brand" href="/"><span className="brand-mark"><BrandMark/></span><span><strong>enviedu</strong><small>TEACHER DASHBOARD</small></span></a>;
  if (!auth) return <main className="teacher-login"><div className="panel"><p>Loading teacher sign-in…</p></div></main>;
  if (!auth.authenticated) return <><header className="site-header">{brand}<a href="/" className="btn outline">Student platform</a></header><main className="teacher-login"><section className="panel"><span className="eyebrow">ONE TEACHER ACCOUNT</span><h1>Teacher sign-in</h1><p>Sign in with the configured teacher account to view student submissions and download research data.</p>{auth.error && <p className="teacher-error" role="alert">{auth.error}</p>}{auth.forbidden ? <><p>This account cannot access the teacher dashboard.</p><a className="btn primary" target="_top" href={auth.signOutUrl || '/cdn-cgi/access/logout'}>Use a different account</a></> : <a className="btn primary" href={auth.signInUrl || '/teacher'} target="_top">{auth.localDevelopment ? 'Continue as local teacher' : 'Sign in as teacher'}</a>}{auth.localDevelopment && <p className="small muted">Local development sign-in. Hosted access uses the configured teacher account.</p>}<p className="small muted">Students use the learning platform without signing in.</p></section></main></>;
  return <><header className="site-header teacher-header">{brand}<span className="teacher-account">{auth.email}</span><a className="btn outline" href={auth.signOutUrl || '/cdn-cgi/access/logout'} target="_top">Sign out</a></header><main className="teacher-dashboard">
    <div className="teacher-title"><div><span className="eyebrow">STUDENT SUBMISSIONS</span><h1>Your classes, in one place.</h1><p>Review progress, read answers, and export results for Class A and Class B.</p></div><button className="btn outline" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh results'}</button></div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {notice && <div className="alert success" role="status">{notice}</div>}
    <div className="teacher-stats"><div className="panel"><span>Sessions started</span><strong>{data?.summary.total || 0}</strong></div><div className="panel"><span>Completed</span><strong>{data?.summary.completed || 0}</strong></div><div className="panel"><span>In progress</span><strong>{(data?.summary.total || 0) - (data?.summary.completed || 0)}</strong></div><div className="panel"><span>Mean transfer score</span><strong>{data?.summary.mean_transfer == null ? '—' : Number(data.summary.mean_transfer).toFixed(1)} <small>/ 4</small></strong><small>Completed sessions · draft objective items</small></div></div>
    <section className="panel teacher-classes" aria-labelledby="teacher-classes-title">
      <div className="panel-heading"><div><h2 id="teacher-classes-title">Two classes, two learning journeys.</h2><p>Both classes complete the same simulations and assessments. Class A compares the cases; Class B reflects on each case on a separate page.</p></div></div>
      <div className="teacher-class-grid">{studyClasses.map(studyClass => {
        const stats = data?.classes.find(item => item.condition === studyClass.condition);
        return <article className={`teacher-class-card ${condition === studyClass.condition ? 'selected' : ''}`} key={studyClass.id}>
          <span className="eyebrow">{studyClass.label}</span><h3>{studyClass.activity}</h3>
          <p>{studyClass.condition === 'guided' ? 'Students compare the shared stock–flow structure across waste and flooding.' : 'Students reflect on waste and flooding as separate cases.'}</p>
          <p className="small muted">{studyClass.condition === 'guided' ? 'After both simulations: Compare & generalize · 4 prompts · 60 seconds minimum.' : 'After both simulations: Waste reflection → Flooding reflection · 2 prompts and 30 seconds minimum per case.'}</p>
          <dl><div><dt>Started</dt><dd>{stats?.total || 0}</dd></div><div><dt>Completed</dt><dd>{stats?.completed || 0}</dd></div><div><dt>In progress</dt><dd>{(stats?.total || 0) - (stats?.completed || 0)}</dd></div></dl>
          <button className="btn outline" disabled={selectionBusy} aria-pressed={condition === studyClass.condition} onClick={() => { setCondition(condition === studyClass.condition ? 'all' : studyClass.condition); setPage(1); }}>View {studyClass.label} results</button>
        </article>;
      })}</div>
    </section>
    <section className="panel teacher-results"><div className="panel-heading"><h2>Student results</h2><span className="pill">{data?.total || 0} matching sessions</span></div><div className="teacher-filters"><label>Participant code<input type="search" disabled={selectionBusy} placeholder="Search participant code…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }}/></label><label>Status<select disabled={selectionBusy} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">All statuses</option><option value="complete">Completed</option><option value="in-progress">In progress</option></select></label><label>Class<select disabled={selectionBusy} value={condition} onChange={event => { setCondition(event.target.value); setPage(1); }}><option value="all">Both classes</option>{studyClasses.map(studyClass => <option key={studyClass.id} value={studyClass.condition}>{studyClass.label} · {studyClass.activity}</option>)}</select></label></div>
    <div className="teacher-downloads"><button className="btn outline" onClick={() => void download('/api/teacher/export?kind=responses&' + query)}>Download all answers · CSV</button><button className="btn outline" onClick={() => void download('/api/teacher/export?kind=scores&' + query)}>Download all scores · CSV</button><span className="small muted">Uses the current filters</span></div>
    <div className="teacher-selection" aria-label="Select and delete submissions"><label><input ref={selectPage} type="checkbox" checked={pageSelected} disabled={!pageRows.length || selectionBusy} onChange={event => togglePage(event.target.checked)}/>Select all on this page</label><span role="status">{selected.size} selected</span>{data && data.total > pageRows.length && <button className="text-btn" disabled={selectionBusy} onClick={() => void selectAllMatching()}>{selecting ? 'Selecting…' : `Select all ${data.total} matching sessions`}</button>}{selected.size > 0 && <button className="text-btn" disabled={selectionBusy} onClick={() => setSelected(new Map())}>Clear selection</button>}<button className="btn teacher-danger" disabled={selected.size === 0 || selected.size > 500 || selectionBusy} onClick={() => { setDeleteError(''); setDeleteTargets([...selected.values()]); }}>Delete selected data</button></div>
    {!data?.submissions.length ? <div className="teacher-empty"><h3>No matching submissions yet.</h3><p>Students can open the platform, select their class, and start learning. Their saved progress will appear here.</p><a className="btn outline" href="/" target="_blank" rel="noreferrer">Open student platform</a></div> : <div className="table-scroll"><table className="teacher-table"><caption className="sr-only">Student submissions</caption><thead><tr><th className="teacher-select-column"><span className="sr-only">Select participants</span></th><th>Student code</th><th>Class / activity</th><th>Status</th><th>Answers</th><th>Transfer</th><th>Last saved</th><th>Details</th></tr></thead><tbody>{data.submissions.map(s => <tr key={s.id} className={selected.has(s.id) ? 'teacher-row-selected' : ''}><td className="teacher-select-column"><input type="checkbox" aria-label={`Select ${s.participant_code}`} checked={selected.has(s.id)} disabled={selectionBusy} onChange={event => toggleSubmission(s, event.target.checked)}/></td><td><button className="text-btn" onClick={() => void open(s.id)}>{s.participant_code}</button></td><td className="teacher-class-cell">{classForCondition(s.condition).label}<small>{classForCondition(s.condition).activity}</small></td><td><span className={`teacher-status ${s.stage === 'complete' ? 'complete' : ''}`}>{s.stage === 'complete' ? 'Completed' : stageLabels[s.stage] || 'In progress'}</span></td><td>{s.responses_count}</td><td>{s.stage === 'complete' ? `${s.transfer_score ?? 0} / 4` : '—'}</td><td>{fmtTime(s.updated_at)}</td><td><button className="btn outline" onClick={() => void open(s.id)}>View answers</button></td></tr>)}</tbody></table></div>}
    <div className="teacher-pagination"><span>{lastRefresh ? `Last refreshed ${lastRefresh}` : ''}</span><div><button className="btn outline" disabled={selectionBusy || page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="btn outline" disabled={selectionBusy || !data || page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</button></div></div></section>
    {detail && <section className="panel teacher-detail" id="submission-detail"><div className="panel-heading"><div><span className="eyebrow">SUBMISSION DETAIL</span><h2>{detail.submission.participant_code}</h2><p>{classForCondition(detail.submission.condition).label} · {classForCondition(detail.submission.condition).activity} · {detail.submission.stage === 'complete' ? 'Completed' : 'In progress'} · Last saved {fmtTime(detail.submission.updated_at)}</p></div><button className="btn outline" onClick={() => setDetail(null)}>Close details</button></div><div className="teacher-score-cards">{detail.scores.map(score => <div key={score.stage}><span>{stageLabels[score.stage]}</span><strong>{score.objectiveScore} / {score.maximum}</strong><small>{score.answered} closed-response items answered</small></div>)}</div><p className="small muted">Objective scores use draft items. Written explanations require teacher assessment.</p><div className="teacher-downloads">{[['responses','Answers CSV'],['scores','Scores CSV'],['events','Activity CSV'],['timeseries','Simulation CSV'],['session','Session JSON']].map(([kind,label]) => <button key={kind} className="btn outline" disabled={!detail.session} onClick={() => void download(`/api/teacher/submissions/${detail.submission.id}/export?kind=${kind}`)}>{label}</button>)}</div>
      {!detail.session?.responses.length && <p>No answers have been saved for this session yet.</p>}
      {stagesFor(detail.session?.configuration.protocol ?? protocol, detail.submission.condition).map(stage => { const answers = detail.session?.responses.filter(r => r.stage === stage) || []; if (!answers.length) return null; const questions = fields(stage, detail.submission.condition); return <section className="teacher-answer-stage" key={stage}><h3>{stageLabels[stage]}</h3>{answers.map(answer => { const field = questions.find(f => f.id === answer.itemId); const label = field?.options?.find(o => o.value === answer.value)?.label || answer.value; return <article className="teacher-answer" key={answer.itemId}><div className="teacher-question"><span>{answer.itemId}</span><h4>{field?.prompt || answer.itemId}</h4></div><p>{label}</p><small>Saved {fmtTime(answer.at)}</small></article>; })}</section>; })}
    </section>}
    <dialog ref={deleteDialog} className="teacher-delete-dialog" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description" onCancel={event => { event.preventDefault(); if (!deleting) setDeleteTargets(null); }}>
      <h2 id="delete-dialog-title">Delete {deleteTargets?.length ?? 0} {deleteTargets?.length === 1 ? 'session' : 'sessions'}?</h2>
      <p id="delete-dialog-description">This permanently removes all answers, scores, and simulation history for the selected participants. This cannot be undone.</p>
      <ul className="teacher-delete-codes" aria-label="Participants to delete">{deleteTargets?.map(row => <li key={row.id}>{row.participant_code}</li>)}</ul>
      <p className="small muted">Saved progress on student devices is kept. To start again after deletion, students must clear their saved site data.</p>
      {deleteError && <p role="alert" className="teacher-error">{deleteError}</p>}
      <div className="teacher-delete-actions"><button className="btn outline" autoFocus disabled={deleting} onClick={() => setDeleteTargets(null)}>Cancel</button><button className="btn teacher-danger" disabled={deleting} onClick={() => void deleteSelected()}>{deleting ? 'Deleting…' : `Delete ${deleteTargets?.length ?? 0} ${deleteTargets?.length === 1 ? 'session' : 'sessions'}`}</button></div>
    </dialog>
  </main></>;
}
