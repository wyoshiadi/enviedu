import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { assessments, predictionFields, protocol, reflectionFields, revisionFields, scenarios, stageLabels } from './data.ts';
import { distinctRuns } from './domain/engine.ts';
import { addRun, advanceStage, createSession, recordEvent, stageStartedAt, submitAnswers } from './domain/study.ts';
import { classForCondition, studyClasses } from './domain/classes.ts';
import { reflectionMinimumSeconds, stagesFor } from './domain/workflow.ts';
import type { Field, ParameterKey, Parameters, Run, Scenario, Session, StudyClass } from './domain/types.ts';
import { Chart } from './components/Chart.tsx';
import { ScenarioScene } from './components/ScenarioScene.tsx';
import { registerStudent, SubmissionSync } from './submissionSync.ts';
import { readSessionProgress, removeSessionProgress, sessionStorageKey } from './sessionStorage.ts';
import type { SyncStatus } from './submissionSync.ts';
import { SimulationViewer } from './components/SimulationViewer.tsx';
import { BrandMark } from './components/BrandMark.tsx';

const number = (v: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(v);
const symbols: Record<string, ReactNode> = {
  leaf: <><path d="M5 19C0 7 10 2 21 3c1 11-4 21-16 16Zm0 0L16 8M9 15v-5m0 5h6"/></>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6"/>,
  play: <path d="m9 5 11 7-11 7V5Z"/>,
  reset: <><path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></>,
  chart: <path d="M4 3v17h17M8 15v-4m5 4V6m5 9V9"/>,
  water: <path d="M12 2C9 7 4 11 4 15a8 8 0 1 0 16 0c0-4-5-8-8-13Zm-4 13a4 4 0 0 0 4 4"/>,
  waste: <><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></>,
  file: <><path d="M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h8"/></>,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  layers: <path d="m12 3 10 6-10 6L2 9l10-6Zm-10 11 10 6 10-6M2 18l10 6 10-6"/>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/></>,
};
function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{symbols[name] || symbols.leaf}</svg>;
}
function load() {
  try { return { session: readSessionProgress(localStorage, protocol, scenarios), issue: '' }; }
  catch { return { session: null, issue: 'The saved session could not be read. Please contact your teacher before starting a new session.' }; }
}
function FlowDiagram({ scenario, parameters, illustration = false }: { scenario: Scenario; parameters: Parameters; illustration?: boolean }) {
  return <div className={`flow-diagram ${scenario.theme} ${illustration ? 'illustrated' : ''}`} aria-label={`${scenario.inflowLabel} feeds ${scenario.stockLabel}; ${scenario.outflowLabel} removes material from it.`}>
    <div className="flow-node"><span>{scenario.inflowLabel}</span><strong>{number(parameters.inflow)} <small>{scenario.flowUnit}</small></strong><span className="flow-change">after the change: {number(parameters.inflowAfter)}</span></div>
    <div className="flow-connector"><span/><Icon name="arrow"/></div>
    <div className="stock-tank"><div className="tank-fill"/><Icon name={scenario.id === 'waste' ? 'waste' : 'water'}/><strong>{number(parameters.initialStock)} <small>{scenario.stockUnit}</small></strong><span>{scenario.stockLabel}</span></div>
    <div className="flow-connector"><span/><Icon name="arrow"/></div>
    <div className="flow-node"><span>{scenario.outflowLabel}</span><strong>{number(parameters.outflow)} <small>{scenario.flowUnit}</small></strong><span className="flow-change">constant capacity</span></div>
  </div>;
}
function FieldsForm({ fields, onSubmit, children, label = 'Save & continue', disabled = false, initial = {} }: { fields: Field[]; onSubmit: (values: Record<string, string>) => void; children?: ReactNode; label?: string; disabled?: boolean; initial?: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const update = (id: string, value: string) => setValues(prev => ({ ...prev, [id]: value }));
  function submit(event: FormEvent) { event.preventDefault(); onSubmit(values); }
  return <form className="answer-form" onSubmit={submit}>
    {children}
    {fields.map((field, index) => <fieldset className="answer-field" key={field.id}>
      <legend><span className="question-number">{String(index + 1).padStart(2, '0')}</span>{field.prompt}</legend>
      {field.type === 'choice' ? <div className="choice-list">{field.options!.map(option => <label className={`choice ${values[field.id] === option.value ? 'chosen' : ''}`} key={option.value}><input type="radio" name={field.id} value={option.value} checked={values[field.id] === option.value} onChange={() => update(field.id, option.value)} required/><span>{option.label}</span></label>)}</div> : field.type === 'number' ? <input className="numeric-answer" type="number" step="any" name={field.id} aria-label={field.prompt} value={values[field.id] || ''} onChange={event => update(field.id, event.target.value)} required/> : <textarea name={field.id} rows={4} maxLength={6000} aria-label={field.prompt} placeholder="Write your explanation here…" value={values[field.id] || ''} onChange={event => update(field.id, event.target.value)} required/>}
      {field.hint && <p className="field-hint">{field.hint}</p>}
    </fieldset>)}
    <div className="form-actions"><p><Icon name="lock"/>Your answers are saved when you continue.</p><button className="btn primary" type="submit" disabled={disabled}>{label}<Icon name="arrow"/></button></div>
  </form>;
}
function Reflection({ session, submit }: { session: Session; submit: (values: Record<string, string>, fields: Field[]) => void }) {
  const fields = reflectionFields(session.condition, session.stage);
  const guided = session.condition === 'guided';
  const recalled = session.stage === 'waste-reflection' ? scenarios.filter(s => s.id === 'waste') : session.stage === 'flood-reflection' ? scenarios.filter(s => s.id === 'flood') : scenarios;
  const minimum = reflectionMinimumSeconds(session.configuration.protocol, session.stage);
  const title = guided ? 'Two cases. What structure do they share?' : session.stage === 'waste-reflection' ? 'Reflect on the waste case.' : session.stage === 'flood-reflection' ? 'Reflect on the flooding case.' : 'Reflect on each case carefully.';
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, []);
  const remaining = Math.max(0, Math.ceil((stageStartedAt(session) + minimum * 1000 - now) / 1000));
  return <>
    <div className="stage-heading"><div className="eyebrow">{session.stage === 'reflection' ? 'DEVELOP YOUR EXPLANATION' : guided ? 'COMPARE & GENERALIZE' : 'CASE REFLECTION'}</div><h1 id="page-title" tabIndex={-1}>{title}</h1><p>{session.stage === 'reflection' ? guided ? 'Use your experience with both simulations to explain the underlying relationship.' : 'Explain what you observed and learned in each simulation.' : guided ? 'Match the roles of stock, inflow, and outflow across waste and flooding. Use evidence from your runs to explain a general relationship.' : `Review only the ${recalled[0].shortTitle.toLowerCase()} case on this page. Describe its results and explain a useful policy for this case.`}</p></div>
    <div className="reflection-timer"><Icon name="clock"/><span>Minimum {session.stage === 'comparison' ? 'comparison' : 'reflection'} time: {minimum} seconds.</span><output data-testid="reflection-timer">{remaining > 0 ? `${remaining} seconds remaining` : 'Minimum reflection time reached'}</output></div>
    <div className={`recall-grid ${session.condition} ${recalled.length === 1 ? 'single-case' : ''}`}>
      {recalled.map(s => {
        const run = session.runs.find(r => r.scenario === s.id);
        const revision = session.responses.find(r => r.stage === `${s.id}-revise` && r.itemId === 'reason');
        return <section className={`recall-card ${s.theme}`} data-scenario={s.id} key={s.id}><div className="eyebrow">{s.shortTitle}</div><h2>{s.title}</h2><p>{s.context}</p>{guided && <FlowDiagram scenario={s} parameters={s.defaults}/>} {session.stage !== 'reflection' && <div className="recall-evidence">{run && <><h3>Your initial run</h3><Chart scenario={s} run={run} compact/></>}{revision && <><h3>Your revised explanation</h3><p className="quoted-response">{revision.value}</p></>}</div>}</section>;
      })}
    </div>
    {session.stage === 'comparison' && <section className="panel comparison-map"><div className="eyebrow">MAP THE SYSTEM ROLES</div><h2>Different quantities, corresponding roles.</h2><div className="table-scroll"><table><caption className="sr-only">Stock and flow roles in the two learning cases</caption><thead><tr><th>System role</th>{scenarios.map(s => <th key={s.id}>{s.shortTitle}</th>)}</tr></thead><tbody>{(['stockLabel', 'inflowLabel', 'outflowLabel'] as const).map((role, index) => <tr key={role}><th scope="row">{['Stock', 'Inflow', 'Outflow'][index]}</th>{scenarios.map(s => <td key={s.id}>{s[role]}</td>)}</tr>)}</tbody></table></div><p>Use the matching roles and your results to explain what holds across both systems in your answers below.</p></section>}
    <section className="panel"><FieldsForm fields={fields} onSubmit={values => submit(values, fields)} disabled={remaining > 0} label={session.stage === 'comparison' ? 'Save comparison & continue' : session.stage === 'waste-reflection' ? 'Save & reflect on flooding' : 'Save reflection & continue'}/></section>
  </>;
}
function Experiment({ scenario, session, commit, next }: { scenario: Scenario; session: Session; commit: (change: (s: Session) => Session) => void; next: () => void }) {
  const runs = session.runs.filter(r => r.scenario === scenario.id), parameters = session.parameters[scenario.id];
  const [selected, setSelected] = useState<string | null>(null);
  const run = runs.find(r => r.id === selected) || runs.at(-1);
  const locked = !runs.length;
  const distinct = distinctRuns(runs);
  function changeParameter(key: ParameterKey, value: number) {
    commit(s => recordEvent({ ...s, parameters: { ...s.parameters, [scenario.id]: { ...s.parameters[scenario.id], [key]: value } } }, 'parameter_changed', { scenarioId: scenario.id, parameter: key, value }));
  }
  const labels: Record<ParameterKey, string> = { initialStock: 'Initial stock', inflow: `${scenario.inflowLabel} · initial`, outflow: scenario.outflowLabel, inflowAfter: `${scenario.inflowLabel} · after change`, policyAt: 'Time of inflow change' };
  const unit = (key: ParameterKey) => key === 'initialStock' ? scenario.stockUnit : key === 'policyAt' ? scenario.timeUnit : scenario.flowUnit;
  const dirty = run && JSON.stringify(run.parameters) !== JSON.stringify(parameters);
  return <>
    <div className="stage-heading"><div className="eyebrow">EXPERIMENT {scenario.id === 'waste' ? '01' : '02'} / {scenario.shortTitle.toUpperCase()}</div><h1>{scenario.title}</h1><p>{scenario.context}</p></div>
    <div className="experiment-instructions"><span className="number-bubble">{locked ? '1' : '2'}</span><div><strong>{locked ? 'Start by testing your initial prediction.' : 'Change one parameter. Observe what changes.'}</strong><p>{locked ? 'Run the initial conditions first. You can then adjust the parameters.' : 'Try at least two different configurations before revising your explanation.'}</p></div><span className="pill">{distinct} / {protocol.minimumDistinctRuns} configurations</span></div>
    <FlowDiagram scenario={scenario} parameters={parameters}/>
    <div className="simulation-layout">
      <aside className="panel parameter-panel"><div className="panel-heading"><h2>Set up your experiment</h2><Icon name="layers"/></div>
        {(Object.keys(labels) as ParameterKey[]).map(key => <label className="slider-field" key={key}><span>{labels[key]}</span><output htmlFor={`param-${key}`}>{number(parameters[key])} <small>{unit(key)}</small></output><input id={`param-${key}`} data-parameter={key} type="range" min={scenario.bounds[key].min} max={scenario.bounds[key].max} step={scenario.bounds[key].step} value={parameters[key]} disabled={locked} onChange={event => changeParameter(key, Number(event.target.value))}/><span className="range-limits"><span>{scenario.bounds[key].min}</span><span>{scenario.bounds[key].max}</span></span></label>)}
        <button className="btn primary" data-action="run" onClick={() => { setSelected(null); commit(s => addRun(s, scenario)); }}><Icon name="play"/>{locked ? 'Run initial conditions' : 'Run simulation'}</button>
        <button className="btn ghost" disabled={locked} onClick={() => commit(s => recordEvent({ ...s, parameters: { ...s.parameters, [scenario.id]: { ...scenario.defaults } } }, 'parameters_reset', { scenarioId: scenario.id }))}><Icon name="reset"/>Reset parameters</button>
        <p className="small muted">Duration: {scenario.duration} {scenario.timeUnit} · time step: {scenario.dt} {scenario.timeUnit}</p>
      </aside>
      <section className="panel result-panel"><div className="panel-heading"><div><span className="eyebrow">OBSERVE THE CHANGES</span><h2>How does the stock change?</h2></div>{runs.length > 0 && <label className="sr-only" htmlFor="run-selection">Select a run</label>}{runs.length > 0 && <select id="run-selection" value={run?.id} onChange={event => setSelected(event.target.value)}>{runs.map((r, i) => <option key={r.id} value={r.id}>Run {i + 1}</option>)}</select>}</div>
        {run ? <><div className="result-metrics"><div><span>Initial stock</span><strong>{number(run.parameters.initialStock)} <small>{scenario.stockUnit}</small></strong></div><div><span>Final stock</span><strong>{number(run.series.at(-1)!.stock)} <small>{scenario.stockUnit}</small></strong></div><div><span>Total change</span><strong>{run.series.at(-1)!.stock - run.parameters.initialStock > 0 ? '+' : ''}{number(run.series.at(-1)!.stock - run.parameters.initialStock)} <small>{scenario.stockUnit}</small></strong></div></div>{dirty && <p className="inline-notice">The controls differ from the displayed run. Run the simulation to see the new results.</p>}<SimulationViewer key={run.id} scenario={scenario} run={run} onInteraction={(type, payload) => commit(s => recordEvent(s, type, payload))}/><details className="data-details"><summary>View results table ({run.series.length} time points)</summary><div className="table-scroll"><table><caption className="sr-only">{scenario.shortTitle} simulation results</caption><thead><tr><th>Time ({scenario.timeUnit})</th><th>Stock ({scenario.stockUnit})</th><th>Inflow ({scenario.flowUnit})</th><th>Actual outflow ({scenario.flowUnit})</th></tr></thead><tbody>{run.series.map((p, i) => <tr key={p.time}><td>{p.time}</td><td>{number(p.stock)}</td><td>{i ? number(p.inflow) : '—'}</td><td>{i ? number(p.actualOutflow) : '—'}</td></tr>)}</tbody></table></div><p className="small muted">Rows after t = 0 report flows during the preceding interval. The t = 0 row shows the initial conditions.</p></details></> : <div className="empty-chart"><svg viewBox="0 0 400 200" aria-hidden="true"><path d="M40 30v140h330M40 65h330M40 100h330M40 135h330"/><path className="preview-path" d="M40 150c80-5 115-25 160-60s80-25 160-30"/></svg><h3>Every experiment reveals a pattern.</h3><p>Run the simulation to observe stocks and flows over time.</p></div>}
      </section>
    </div>
    <details className="model-details"><summary><Icon name="info"/>Educational model boundaries and assumptions</summary><p>S(t + Δt) = S(t) + [I(t) − O actual(t)] × Δt. Actual outflow is limited by the stock and incoming material available during that interval. The inflow change applies to intervals starting at the intervention time.</p><ul>{scenario.assumptions.map(a => <li key={a}>{a}</li>)}</ul></details>
    <div className="stage-actions"><span>{distinct < protocol.minimumDistinctRuns ? 'Run two different configurations to continue.' : 'You are ready to revisit your prediction and explanation.'}</span><button className="btn primary" data-action="next-experiment" disabled={distinct < protocol.minimumDistinctRuns} onClick={next}>Revise your explanation<Icon name="arrow"/></button></div>
  </>;
}

export function App() {
  const [initial] = useState(load);
  const [session, setSession] = useState<Session | null>(initial.session);
  const current = useRef<Session | null>(initial.session);
  const [view, setView] = useState<'home' | 'study'>(initial.session ? 'study' : 'home');
  const previousPage = useRef(`${view}:${session?.stage || ''}`);
  const [error, setError] = useState(initial.issue);
  const [starting, setStarting] = useState(false);
  const [participantId, setParticipantId] = useState('');
  const [classId, setClassId] = useState<StudyClass | ''>('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'idle', message: '', sequence: 0, submittedAt: null });
  const sync = useRef<SubmissionSync | null>(null);
  if (!sync.current) sync.current = new SubmissionSync(setSyncStatus);
  const expired = syncStatus.state === 'expired';
  const active = session !== null && session.stage !== 'complete' && !expired;
  const stages = session ? stagesFor(session.configuration.protocol, session.condition) : protocol.stages;
  const stageIndex = session ? stages.indexOf(session.stage) : 0;
  const totalSteps = stages.length - 1;
  function replace(next: Session) {
    localStorage.setItem(sessionStorageKey(next.protocolVersion), JSON.stringify(next));
    current.current = next; setSession(next); setError(''); sync.current?.enqueue(next);
  }
  function commit(change: (s: Session) => Session) {
    try {
      if (!current.current) throw new Error('There is no active session.');
      const disk = localStorage.getItem(sessionStorageKey(current.current.protocolVersion));
      if (!disk) throw new Error('The saved session has been deleted. Reload before starting a new session.');
      if (disk) { const parsed = JSON.parse(disk) as Session; if (parsed.sessionId !== current.current.sessionId || parsed.events.length !== current.current.events.length || parsed.updatedAt !== current.current.updatedAt) throw new Error('The session changed in another tab. Reload to use the latest version.'); }
      replace(change(current.current));
    } catch (e) { setError(e instanceof Error ? e.message : 'Your data has not been saved. Check whether browser storage is available.'); }
  }
  useEffect(() => {
    function visibility() { if (current.current && current.current.stage !== 'complete') commit(s => recordEvent(s, 'visibility_changed', { state: document.visibilityState })); }
    document.addEventListener('visibilitychange', visibility);
    if (current.current && current.current.stage !== 'complete') commit(s => recordEvent(s, 'session_resumed', {}));
    if (current.current?.stage === 'complete') sync.current?.enqueue(current.current);
    const online = () => void sync.current?.flush(); window.addEventListener('online', online);
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', online); sync.current?.dispose(); };
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const page = `${view}:${session?.stage || ''}`;
    if (previousPage.current !== page) document.getElementById('page-title')?.focus({ preventScroll: true });
    previousPage.current = page;
  }, [session?.stage, view]);
  useEffect(() => { if (session && session.stage !== 'complete') setView('study'); }, [session?.sessionId]);
  async function start(event: FormEvent) {
    event.preventDefault(); setStarting(true); setError('');
    try {
      if (!classId) throw new Error('Choose the class assigned by your teacher.');
      const registration = await registerStudent(participantId.trim(), classId);
      if (registration.protocolVersion !== protocol.version) throw new Error('The platform has been updated. Refresh this page before starting.');
      const created = createSession(registration.participantId, registration.condition, protocol, scenarios, registration.createdAt);
      replace({ ...created, sessionId: registration.sessionId }); setView('study');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to start your session.'); }
    finally { setStarting(false); }
  }
  function submit(values: Record<string, string>, fields: Field[]) { commit(s => advanceStage(submitAnswers(s, values, fields))); }
  function restartExpiredSession() {
    if (!session || !expired) return;
    try {
      removeSessionProgress(localStorage, session.sessionId);
      sync.current?.dispose(); sync.current = new SubmissionSync(setSyncStatus);
      setParticipantId(session.participantId); setClassId(classForCondition(session.condition).id);
      current.current = null; setSession(null); setView('home'); setError('');
      setSyncStatus({ state: 'idle', message: '', sequence: 0, submittedAt: null });
    } catch { setError('Unable to clear the expired progress. Check whether browser storage is available.'); }
  }
  function setPage(next: typeof view) { if (expired && next === 'home') { restartExpiredSession(); return; } if (!active || next === 'study') setView(next); }
  function pageHeading(eyebrow: string, title: string, description: string) { return <div className="stage-heading"><div className="eyebrow">{eyebrow}</div><h1 id="page-title" tabIndex={-1}>{title}</h1><p>{description}</p></div>; }
  function learning() {
    if (!session) return home();
    if (expired) return <section className="student-complete student-expired"><div className="panel"><span className="eyebrow">SESSION EXPIRED</span><h1 id="page-title" tabIndex={-1}>Start a fresh learning session.</h1><p>{syncStatus.message}</p><p>Completed submissions are kept. Unfinished sessions are removed after 1 hour without saved activity.</p><button className="btn primary" onClick={restartExpiredSession}>Start a new session<Icon name="arrow"/></button></div></section>;
    const stage = session.stage;
    if (stage === 'complete') return <section className="student-complete"><div className="panel"><span className="eyebrow">{syncStatus.submittedAt ? 'SUBMISSION COMPLETE' : 'SAVING YOUR SUBMISSION'}</span><h1 id="page-title" tabIndex={-1}>{syncStatus.submittedAt ? 'Thank you for completing the session.' : 'Your answers are ready to submit.'}</h1><p>{syncStatus.submittedAt ? 'Your teacher has received your answers. You can now close this page.' : 'Please keep this page open until your answers have been received. Your progress is saved on this device.'}</p><div className="student-receipt"><span>Your participant code</span><strong>{session.participantId}</strong></div>{syncStatus.state === 'error' && <p role="alert" className="teacher-error">{syncStatus.message}</p>}{!syncStatus.submittedAt && <button className="btn primary" onClick={() => void sync.current?.flush()} disabled={syncStatus.state === 'saving'}>{syncStatus.state === 'saving' ? 'Sending answers…' : 'Retry submission'}</button>}<p className="small muted">Results and answer downloads are available only to your teacher.</p>{syncStatus.submittedAt && <button className="btn outline" onClick={() => setView('home')}>Return to home</button>}</div></section>;
    if (stage === 'reflection' || stage === 'comparison' || stage.endsWith('-reflection')) return <Reflection key={`${session.sessionId}:${stage}`} session={session} submit={submit}/>;
    if (stage === 'pretest' || stage === 'posttest' || stage === 'transfer') {
      const assessment = assessments[stage];
      return <>{pageHeading(stage === 'pretest' ? 'BEFORE EXPLORING' : stage === 'posttest' ? session.condition === 'guided' ? 'AFTER COMPARISON' : 'AFTER CASE REFLECTION' : 'TRANSFER CHALLENGE', assessment.title, assessment.introduction)}<section className="panel assessment-panel"><FieldsForm key={`${session.sessionId}:${stage}`} fields={assessment.fields} onSubmit={values => submit(values, assessment.fields)} label={stage === 'transfer' ? 'Submit answers & complete session' : 'Save & continue'}/></section></>;
    }
    const scenario = scenarios.find(s => stage.startsWith(s.id))!;
    if (stage.endsWith('experiment')) return <Experiment key={`${session.sessionId}:${stage}`} scenario={scenario} session={session} commit={commit} next={() => commit(s => advanceStage(s))}/>;
    if (stage.endsWith('predict')) {
      const fields = predictionFields(scenario);
      return <>{pageHeading('PREDICT BEFORE YOU EXPERIMENT', `What do you think will happen?`, scenario.context)}<FlowDiagram scenario={scenario} parameters={scenario.defaults}/><div className="prediction-context"><Icon name="clock"/><span>Observe the system over {scenario.duration} {scenario.timeUnit}. Inflow changes at t = {scenario.defaults.policyAt} {scenario.timeUnit}.</span></div><section className="panel"><FieldsForm key={`${session.sessionId}:${stage}`} fields={fields} onSubmit={values => submit(values, fields)}/></section></>;
    }
    const initialPrediction = session.responses.filter(r => r.stage === `${scenario.id}-predict`);
    const firstRun = session.runs.find(r => r.scenario === scenario.id);
    return <>{pageHeading('REVISE YOUR EXPLANATION', 'What did you learn from the results?', `Review the initial run of the ${scenario.shortTitle.toLowerCase()} case and compare it with your prediction.`)}<div className="revision-grid"><section className="panel"><div className="eyebrow">YOUR PREDICTION BEFORE THE SIMULATION</div><h2>{({ rise: 'The stock keeps increasing', steady: 'The stock stays constant', fall: 'The stock decreases' } as Record<string, string>)[initialPrediction.find(r => r.itemId === 'direction')?.value || '']}</h2><p className="quoted-response">{initialPrediction.find(r => r.itemId === 'reason')?.value}</p></section><section className="panel">{firstRun && <Chart scenario={scenario} run={firstRun} compact/>}</section></div><section className="panel"><FieldsForm key={`${session.sessionId}:${stage}`} fields={revisionFields} onSubmit={values => submit(values, revisionFields)}/></section></>;
  }
  function home() {
    return <>
      <section className="landing-hero"><div className="hero-copy"><div className="eyebrow">ENVIRONMENTAL EDUCATION PLATFORM</div><h1 id="page-title" tabIndex={-1}>Explore changes.<br/>Build your <em>understanding.</em></h1><p>Explore waste and flooding through simulation.<br/>Observe changes. Test predictions. Explain your results.</p>
        <form className="setup-form hero-start-form" id="setup" onSubmit={event => void start(event)}>
          <label htmlFor="participant-id">Participant ID</label><input id="participant-id" name="participantId" type="text" value={participantId} onChange={event => setParticipantId(event.target.value)} onBlur={() => setParticipantId(value => value.trim())} placeholder="Enter your participant ID" autoComplete="off" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={32} pattern="[A-Za-z0-9_\-]{3,32}" title="Use 3–32 letters, numbers, hyphens, or underscores." aria-describedby="participant-id-hint" required disabled={starting}/><p id="participant-id-hint">Use the ID provided by your teacher: 3–32 letters, numbers, hyphens, or underscores.</p>
          <label htmlFor="class-id">Your class</label><select id="class-id" name="classId" value={classId} onChange={event => setClassId(event.target.value as StudyClass | '')} aria-describedby="class-id-hint" required disabled={starting}><option value="" disabled>Select your class</option>{studyClasses.map(studyClass => <option key={studyClass.id} value={studyClass.id}>{studyClass.label}</option>)}</select><p id="class-id-hint">Choose the class assigned by your teacher.</p>
          <button className="btn primary start-learning" type="submit" disabled={starting || (session?.stage === 'complete' && !syncStatus.submittedAt)}>{starting ? 'Starting your session…' : 'Start learning'}<Icon name="arrow"/></button><p>No account or password needed. Please use one browser while working. Unfinished sessions expire after 1 hour without saved activity.</p>
        </form><span className="hero-note">For university students · Education research prototype</span></div></section>
      <div className="learning-strip"><div><span>01</span><strong>Predict</strong><small>Record your initial understanding</small></div><Icon name="arrow"/><div><span>02</span><strong>Experiment</strong><small>Change parameters, observe the graphs</small></div><Icon name="arrow"/><div><span>03</span><strong>Reflect</strong><small>Revise your explanation</small></div><Icon name="arrow"/><div><span>04</span><strong>Apply</strong><small>Apply it in a new context</small></div></div>
      <div className="section-heading"><div><span className="eyebrow">TWO CONTEXTS TO EXPLORE</span><h2>Explore two environmental cases.</h2></div><span className="pill">Interactive simulations</span></div>
      <div className="scenario-grid">{scenarios.map((scenario, i) => <article className={`scenario-card ${scenario.theme}`} key={scenario.id}><div className="scenario-art scene-preview"><ScenarioScene scenario={scenario} stock={scenario.defaults.initialStock}/><span>SIMULATION 0{i + 1}</span></div><div className="scenario-content"><span className="eyebrow">{scenario.id === 'waste' ? 'WASTE MANAGEMENT' : 'URBAN WATER'}</span><h3>{scenario.title}</h3><p>{scenario.id === 'waste' ? 'What happens when incoming waste decreases but processing capacity stays the same?' : 'What happens when runoff decreases but drainage capacity stays the same?'}</p><span className="scenario-footer"><Icon name="chart"/>Predict · Simulate · Revise</span></div></article>)}</div>
      <section className="question-banner"><span className="quote-symbol">“</span><div><span className="eyebrow">EXPLORE · EXPERIMENT · EXPLAIN</span><h2>Observe what changes. Build your explanation from the evidence.</h2></div></section>
    </>;
  }
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><a className="brand" href="#" onClick={event => { event.preventDefault(); setPage(active ? 'study' : 'home'); }}><span className="brand-mark"><BrandMark/></span><span><strong>enviedu</strong><small>ENVIRONMENTAL EDUCATION PLATFORM</small></span></a><nav aria-label="Main navigation">{active ? <span className="active-session"><span className="live-dot"/>Learning session in progress</span> : <><button className={view === 'home' ? 'active' : ''} onClick={() => setPage('home')}>Overview</button>{session && <button className={view === 'study' ? 'active' : ''} onClick={() => setPage('study')}>Learning session</button>}<a href="/teacher">Teacher sign-in</a></>}</nav><span className="version-badge">Learning platform</span></header>
    <div className={`app-layout ${view === 'study' && session && !expired ? 'with-sidebar' : ''}`}>
      {view === 'study' && session && !expired && <aside className="study-sidebar"><div className="sidebar-title"><span className="eyebrow">YOUR LEARNING JOURNEY</span><h2>One step,<br/>a new understanding.</h2></div><div className="session-code"><span>Participant code · {classForCondition(session.condition).label}</span><strong>{session.participantId}</strong></div><nav aria-label="Learning stages">{stages.map((stage, i) => <div className={`stage-step ${i === stageIndex ? 'current' : ''} ${i < stageIndex ? 'done' : ''}`} key={stage} aria-current={i === stageIndex ? 'step' : undefined}><span>{i < stageIndex ? <Icon name="check"/> : i > stageIndex ? <Icon name="lock"/> : String(i + 1).padStart(2, '0')}</span><strong>{stageLabels[stage]}</strong></div>)}</nav><div className="sidebar-bottom"><Icon name="leaf"/><p>Predictions can change.<br/>Build explanations from evidence.</p></div></aside>}
      <main id="main"><div className="content-wrap">{error && <div role="alert" className="alert error"><Icon name="info"/><span>{error}</span><button className="dismiss" onClick={() => setError('')} aria-label="Dismiss message">×</button></div>}{session && <div className={`submission-sync ${syncStatus.state === 'error' ? 'error' : ''}`} role="status"><span className="status-indicator"/><span>{syncStatus.message || 'Your progress is saved on this device.'}</span>{syncStatus.state === 'error' && <button className="text-btn" onClick={() => void sync.current?.flush()}>Retry saving</button>}</div>}{view === 'study' && session && !expired && <div className="study-topline"><span>{stageLabels[session.stage]}</span><div className="study-progress" role="progressbar" aria-label="Session progress" aria-valuenow={stageIndex} aria-valuemin={0} aria-valuemax={totalSteps}><span style={{ '--progress': `${stageIndex / totalSteps * 100}%` } as CSSProperties}/></div><strong>{Math.min(stageIndex + 1, totalSteps)} / {totalSteps}</strong></div>}{view === 'home' ? home() : learning()}<footer className="site-footer"><span>enviedu - environmental education platform</span></footer></div></main>
    </div>

  </>;
}
