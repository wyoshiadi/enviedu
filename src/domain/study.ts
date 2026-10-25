import { ENGINE_VERSION, distinctRuns, simulate, validateParameters } from './engine.ts';
import { classForCondition } from './classes.ts';
import { protocolForVersion, reflectionMinimumSeconds, stagesFor } from './workflow.ts';
import type { Condition, Field, Parameters, Protocol, Response, Run, Scenario, ScenarioId, Session, Stage } from './types.ts';
export function createSession(participantId: string, condition: Condition, protocol: Protocol, scenarios: Scenario[], at = new Date().toISOString()): Session {
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(participantId)) throw new Error('Use an anonymous code of 3–32 characters: letters, numbers, hyphens, or underscores.');
  if (!['guided', 'separate'].includes(condition)) throw new Error('Unrecognized study condition.');
  const data: Session = { schemaVersion: 1, sessionId: crypto.randomUUID(), participantId, condition, protocolVersion: protocol.version, appVersion: protocol.appVersion, engineVersion: ENGINE_VERSION, createdAt: at, updatedAt: at, completedAt: null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, stage: protocol.stages[0], parameters: Object.fromEntries(scenarios.map(s => [s.id, { ...s.defaults }])) as Record<ScenarioId, Parameters>, responses: [], runs: [], events: [], configuration: structuredClone({ protocol, scenarios }) };
  return recordEvent(data, 'session_started', { allocation: 'teacher-assigned-class', classId: classForCondition(condition).id, condition }, at);
}
export function recordEvent(session: Session, type: string, payload: Record<string, unknown>, at = new Date().toISOString()): Session {
  if (session.events.length >= 20000) throw new Error('The pilot session log limit has been reached. Export the data before starting a new session.');
  const timestamp = Math.max(Date.parse(at), Date.parse(session.updatedAt));
  const stamp = new Date(timestamp).toISOString();
  return { ...session, updatedAt: stamp, events: [...session.events, { seq: session.events.length + 1, at: stamp, elapsedMs: Math.max(0, timestamp - Date.parse(session.createdAt)), stage: session.stage, type, payload }] };
}
export function stageStartedAt(session: Session): number {
  const event = [...session.events].reverse().find(e => e.stage === session.stage && (e.type === 'stage_entered' || e.type === 'session_started'));
  return Date.parse(event?.at || session.updatedAt);
}
export function submitAnswers(session: Session, values: Record<string, string>, fields: Field[], at = new Date().toISOString()): Session {
  const next: Response[] = [];
  for (const field of fields) {
    const value = values[field.id]?.trim();
    if (!value || value.length > 6000) throw new Error('Complete every answer (maximum 6,000 characters per answer).');
    if (field.type === 'choice' && !field.options?.some(o => o.value === value)) throw new Error('Invalid response option.');
    if (field.type === 'number' && !Number.isFinite(Number(value))) throw new Error('Invalid numeric response.');
    next.push({ stage: session.stage, itemId: field.id, value, at });
  }
  return recordEvent({ ...session, responses: [...session.responses.filter(r => r.stage !== session.stage), ...next] }, 'responses_submitted', { itemIds: next.map(r => r.itemId) }, at);
}
export function advanceStage(session: Session, at = new Date().toISOString()): Session {
  if (session.stage === 'complete') throw new Error('The session is already complete.');
  const stages = stagesFor(session.configuration.protocol, session.condition);
  if (!stages.includes(session.stage)) throw new Error('This stage is not part of your class journey.');
  if (session.stage.endsWith('-experiment')) {
    const id = session.stage.split('-')[0];
    if (distinctRuns(session.runs.filter(r => r.scenario === id)) < session.configuration.protocol.minimumDistinctRuns) throw new Error('Run at least two different parameter configurations.');
  } else if (!session.responses.some(r => r.stage === session.stage)) throw new Error('Save your answers before continuing.');
  if (Date.parse(at) - stageStartedAt(session) < reflectionMinimumSeconds(session.configuration.protocol, session.stage) * 1000) throw new Error('Use the allocated reflection time before continuing.');
  const stage = stages[stages.indexOf(session.stage) + 1];
  if (!stage) throw new Error('Invalid stage sequence.');
  let next = recordEvent(session, 'stage_completed', {}, at);
  next = { ...next, stage, completedAt: stage === 'complete' ? at : null };
  return recordEvent(next, 'stage_entered', {}, at);
}
export function addRun(session: Session, scenario: Scenario, at = new Date().toISOString()): Session {
  if (session.stage !== `${scenario.id}-experiment`) throw new Error('This simulation is not available at the current stage.');
  if (session.runs.length >= 200) throw new Error('A pilot session can contain at most 200 runs.');
  const parameters = { ...session.parameters[scenario.id] };
  const run: Run = { id: crypto.randomUUID(), scenario: scenario.id, scenarioVersion: scenario.version, engineVersion: ENGINE_VERSION, at, parameters, series: simulate(scenario, parameters) };
  return recordEvent({ ...session, runs: [...session.runs, run] }, 'simulation_run', { runId: run.id, scenarioId: scenario.id, scenarioVersion: scenario.version, parameters }, at);
}
export function validateSession(raw: unknown, protocol: Protocol, scenarios: Scenario[]): Session {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid session format.');
  const s = raw as Session;
  protocol = protocolForVersion(s.protocolVersion, protocol);
  const stages = stagesFor(protocol, s.condition);
  if (s.schemaVersion !== 1 || s.protocolVersion !== protocol.version || s.appVersion !== protocol.appVersion || s.engineVersion !== ENGINE_VERSION) throw new Error('The session version does not match this prototype.');
  if (!['guided', 'separate'].includes(s.condition) || !stages.includes(s.stage) || !/^[A-Za-z0-9_-]{3,32}$/.test(s.participantId) || typeof s.sessionId !== 'string' || !s.sessionId || !Number.isFinite(Date.parse(s.createdAt)) || !Number.isFinite(Date.parse(s.updatedAt))) throw new Error('Invalid session metadata.');
  if (!Array.isArray(s.events) || !Array.isArray(s.runs) || !Array.isArray(s.responses) || s.events.length > 20000 || s.runs.length > 200 || s.responses.length > 100) throw new Error('The session content is invalid or exceeds the allowed limits.');
  if (JSON.stringify(s.configuration) !== JSON.stringify({ protocol, scenarios })) throw new Error('The session configuration differs. Use the same study build.');
  for (const scenario of scenarios) validateParameters(scenario, s.parameters[scenario.id]);
  for (let i = 0; i < s.events.length; i++) {
    const e = s.events[i];
    if (e.seq !== i + 1 || !stages.includes(e.stage) || !Number.isFinite(Date.parse(e.at)) || !Number.isFinite(e.elapsedMs) || e.elapsedMs < 0 || typeof e.type !== 'string' || !e.payload || typeof e.payload !== 'object') throw new Error('Invalid log format or sequence.');
    if (i && (Date.parse(e.at) < Date.parse(s.events[i - 1].at) || e.elapsedMs < s.events[i - 1].elapsedMs)) throw new Error('Log timestamps are not in order.');
  }
  const entered = s.events.filter(e => e.type === 'session_started' || e.type === 'stage_entered');
  const expectedStages = stages.slice(0, stages.indexOf(s.stage) + 1);
  if (JSON.stringify(entered.map(e => e.stage)) !== JSON.stringify(expectedStages)) throw new Error('The stage history does not match the study sequence.');
  for (const stage of expectedStages.slice(0, -1)) {
    if (!s.events.some(e => e.stage === stage && e.type === 'stage_completed')) throw new Error('A preceding stage has not been completed.');
    const minimum = reflectionMinimumSeconds(protocol, stage);
    if (minimum > 0) {
      const start = entered.find(e => e.stage === stage)!;
      const end = s.events.find(e => e.stage === stage && e.type === 'stage_completed')!;
      if (Date.parse(end.at) - Date.parse(start.at) < minimum * 1000) throw new Error('A reflection stage did not meet its minimum time.');
    }
    if (stage.endsWith('-experiment')) {
      if (distinctRuns(s.runs.filter(r => stage.startsWith(r.scenario))) < protocol.minimumDistinctRuns) throw new Error('The experiment history is incomplete.');
    } else if (!s.responses.some(r => r.stage === stage)) throw new Error('Responses from a preceding stage are missing.');
  }
  for (const r of s.responses) if (!stages.includes(r.stage) || typeof r.itemId !== 'string' || typeof r.value !== 'string' || !r.value.trim() || r.value.length > 6000 || !Number.isFinite(Date.parse(r.at))) throw new Error('Invalid response format.');
  if (new Set(s.responses.map(r => `${r.stage}:${r.itemId}`)).size !== s.responses.length) throw new Error('Duplicate responses were found.');
  if (new Set(s.runs.map(r => r.id)).size !== s.runs.length) throw new Error('Duplicate run IDs.');
  for (const run of s.runs) {
    const scenario = scenarios.find(c => c.id === run.scenario);
    if (!scenario || run.scenarioVersion !== scenario.version || run.engineVersion !== ENGINE_VERSION || typeof run.id !== 'string' || !Number.isFinite(Date.parse(run.at))) throw new Error('Invalid run metadata.');
    if (JSON.stringify(run.series) !== JSON.stringify(simulate(scenario, run.parameters))) throw new Error('The run results do not match the deterministic engine.');
  }
  return structuredClone(s);
}
