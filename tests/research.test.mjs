import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate, distinctRuns, ENGINE_VERSION } from '../src/domain/engine.ts';
import { createSession, recordEvent, submitAnswers, advanceStage, addRun, stageStartedAt, validateSession } from '../src/domain/study.ts';
import { csv, researchExports } from '../src/domain/export.ts';
import { objectiveScores } from '../src/domain/scoring.ts';
import { sceneScale } from '../src/components/sceneScale.ts';
import { readSessionProgress, sessionStorageKey } from '../src/sessionStorage.ts';
import { reflectionFields } from '../src/domain/prompts.ts';
import { legacyProtocol, reflectionMinimumSeconds, stagesFor } from '../src/domain/workflow.ts';
const read = file => JSON.parse(readFileSync(new URL('../src/config/' + file, import.meta.url), 'utf8'));
const scenarios = read('scenarios.json'), protocol = read('study.json'), assessments = read('assessments.json');
const [waste, flood] = scenarios;
const at = '2026-10-24T06:00:00.000Z';
function session(condition = 'guided', studyProtocol = protocol) { return createSession('P001', condition, studyProtocol, scenarios, at); }
function progressStorage(data) {
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), key: index => [...data.keys()][index] ?? null, get length() { return data.size; } };
}
test('previous project progress migrates to enviedu without changing or removing the saved session', () => {
  const legacyKey = 'previous-project:stock-flow:' + protocol.version, raw = JSON.stringify(session());
  const data = new Map([[legacyKey, raw]]);
  const storage = progressStorage(data);
  assert.deepEqual(readSessionProgress(storage, protocol, scenarios), JSON.parse(raw));
  assert.equal(data.get(sessionStorageKey(protocol.version)), raw);
  assert.equal(data.get(legacyKey), raw);
});
test('enviedu progress takes precedence and historical protocols remain separate', () => {
  const current = JSON.stringify(session('separate')), legacy = JSON.stringify(session('guided'));
  const data = new Map([[sessionStorageKey(protocol.version), current], ['previous-project:stock-flow:' + protocol.version, legacy]]);
  const storage = progressStorage(data);
  assert.equal(readSessionProgress(storage, protocol, scenarios).condition, 'separate');
  data.clear(); data.set('previous-project:stock-flow:older-protocol', legacy);
  assert.equal(readSessionProgress(storage, protocol, scenarios), null);
  assert.equal(data.size, 1);
});
test('progress recovery skips invalid snapshots and picks the newest matching session', () => {
  const original = session(), newer = recordEvent(original, 'session_resumed', {}, '2026-10-24T06:01:00.000Z');
  const data = new Map([
    ['invalid:stock-flow:' + protocol.version, '{'],
    ['first:stock-flow:' + protocol.version, JSON.stringify(original)],
    ['second:stock-flow:' + protocol.version, JSON.stringify(newer)]
  ]);
  assert.deepEqual(readSessionProgress(progressStorage(data), protocol, scenarios), newer);
  assert.equal(data.size, 4);
});
function answerStage(s) {
  const values = s.stage === 'pretest' ? { familiarity: '0', stock: 'stock', change: 'rise', balance: '30', explanation: 'Inflow is still greater than outflow.' } : s.stage === 'posttest' ? { stock: 'backlog', change: 'fall', balance: '45', explanation: 'The flow difference determines the change in stock.' } : s.stage === 'transfer' ? { stock: 'amount', change: 'rise', balance: '110', policy: 'less-than', explanation: 'The stock falls when emissions are lower than uptake.' } : ['reflection', 'comparison', 'waste-reflection', 'flood-reflection'].includes(s.stage) ? Object.fromEntries(reflectionFields(s.condition, s.stage).map(field => [field.id, 'Participant explanation in an automated test.'])) : { direction: 'rise', reason: 'Initial or revised explanation.' };
  const fields = assessments[s.stage]?.fields || Object.keys(values).map(id => ({ id, type: 'text', prompt: id }));
  return submitAnswers(s, values, fields, s.updatedAt);
}
function completed(condition, studyProtocol = protocol) {
  let s = session(condition, studyProtocol);
  while (s.stage !== 'complete') {
    if (s.stage.endsWith('-experiment')) {
      const scenario = scenarios.find(c => s.stage.startsWith(c.id));
      s = addRun(s, scenario, s.updatedAt);
      s.parameters[scenario.id].inflowAfter = scenario.bounds.inflowAfter.min;
      s = addRun(s, scenario, s.updatedAt);
    } else s = answerStage(s);
    const nextAt = new Date(Math.max(Date.parse(s.updatedAt), stageStartedAt(s) + reflectionMinimumSeconds(s.configuration.protocol, s.stage) * 1000)).toISOString();
    s = advanceStage(s, nextAt);
  }
  return s;
}
test('deterministic accumulation preserves exact stock balance and policy timing', () => {
  const a = simulate(waste, waste.defaults), b = simulate(waste, waste.defaults);
  assert.deepEqual(a, b); assert.equal(a.length, 13); assert.equal(a[6].stock, 44); assert.equal(a[6].inflow, 12); assert.equal(a[7].inflow, 9); assert.equal(a.at(-1).stock, 50);
  for (let i = 1; i < a.length; i++) assert.equal(a[i].stock, a[i - 1].stock + (a[i].inflow - a[i].actualOutflow) * waste.dt);
});
test('waste and flood use the same engine with comparable normalized behavior', () => {
  const a = simulate(waste, waste.defaults), b = simulate(flood, flood.defaults);
  assert.equal(b.at(-1).stock, 500);
  a.forEach((p, i) => assert.equal(b[i].stock / 10, p.stock));
});
test('lowering inflow can slow growth, balance flows, or decrease stock', () => {
  const grow = simulate(waste, waste.defaults);
  assert.ok(grow[7].stock > grow[6].stock); assert.ok(grow[7].stock - grow[6].stock < grow[6].stock - grow[5].stock);
  const steady = simulate(waste, { ...waste.defaults, inflowAfter: 8 }); assert.equal(steady[7].stock, steady[6].stock);
  const fall = simulate(waste, { ...waste.defaults, inflowAfter: 0 }); assert.ok(fall[7].stock < fall[6].stock);
});
test('nonnegative boundary limits actual outflow and conserves mass', () => {
  const rows = simulate(waste, { ...waste.defaults, initialStock: 0, inflow: 1, inflowAfter: 0, outflow: 20 });
  assert.equal(rows[1].actualOutflow, 1); assert.equal(rows.at(-1).stock, 0); assert.ok(rows.every(r => r.stock >= 0));
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].stock, rows[i - 1].stock + rows[i].inflow - rows[i].actualOutflow);
});
test('units, invalid values, timestep alignment, and configuration bounds are checked', () => {
  for (const value of [-1, NaN, Infinity, 21]) assert.throws(() => simulate(waste, { ...waste.defaults, inflow: value }));
  assert.throws(() => simulate({ ...waste, flowUnit: 'kg/day' }, waste.defaults));
  assert.throws(() => simulate({ ...waste, dt: 0 }, waste.defaults));
  assert.throws(() => simulate({ ...waste, dt: .7 }, waste.defaults));
  assert.throws(() => simulate({ ...waste, bounds: { ...waste.bounds, inflow: { min: 0, max: 20, step: 0 } } }, waste.defaults));
});
test('compatible carbon reservoir can reuse the engine without becoming a training scenario', () => {
  const carbon = { ...waste, id: 'carbon', stockUnit: 't CO₂', timeUnit: 'year', flowUnit: 't CO₂/year', duration: 5, bounds: { ...waste.bounds, initialStock: { min: 0, max: 1000, step: 1 } } };
  const points = simulate(carbon, { initialStock: 100, inflow: 8, outflow: 6, inflowAfter: 8, policyAt: 2 });
  assert.equal(points.at(-1).stock, 110); assert.deepEqual(scenarios.map(s => s.id), ['waste', 'flood']);
});
test('a pretest cannot be skipped and the carbon assessment is last', () => {
  assert.throws(() => advanceStage(session(), at));
  assert.equal(protocol.stages.at(-2), 'transfer');
  const s = advanceStage(answerStage(session()), at); assert.equal(s.stage, 'waste-predict');
});
test('two unique configurations are required; repeating a run is insufficient', () => {
  let s = advanceStage(answerStage(session()), at); s = advanceStage(answerStage(s), at);
  s = addRun(s, waste, at); s = addRun(s, waste, at); assert.equal(distinctRuns(s.runs), 1); assert.throws(() => advanceStage(s, at));
  s.parameters.waste.inflowAfter = 0; s = addRun(s, waste, at); assert.equal(distinctRuns(s.runs), 2); assert.equal(advanceStage(s, at).stage, 'waste-revise');
  assert.throws(() => addRun(s, flood, at));
});
test('classes share simulations and assessments but follow distinct comparison and reflection journeys', () => {
  const a = completed('guided'), b = completed('separate');
  assert.equal(a.stage, 'complete'); assert.equal(b.stage, 'complete');
  const history = s => s.events.filter(e => e.type === 'session_started' || e.type === 'stage_entered').map(e => e.stage);
  const shared = ['pretest', 'waste-predict', 'waste-experiment', 'waste-revise', 'flood-predict', 'flood-experiment', 'flood-revise'];
  assert.deepEqual(history(a), [...shared, 'comparison', 'posttest', 'transfer', 'complete']);
  assert.deepEqual(history(b), [...shared, 'waste-reflection', 'flood-reflection', 'posttest', 'transfer', 'complete']);
  assert.deepEqual(a.responses.filter(r => r.stage === 'comparison').map(r => r.itemId), ['stocks', 'flows', 'relationship', 'policy']);
  assert.deepEqual(b.responses.filter(r => r.stage === 'waste-reflection').map(r => r.itemId), ['waste-observation', 'waste-policy']);
  assert.deepEqual(b.responses.filter(r => r.stage === 'flood-reflection').map(r => r.itemId), ['flood-observation', 'flood-policy']);
  assert.equal(Date.parse(a.completedAt) - Date.parse(a.createdAt), 60000);
  assert.equal(Date.parse(b.completedAt) - Date.parse(b.createdAt), 60000);
  assert.deepEqual(a.runs.map(r => r.parameters), b.runs.map(r => r.parameters));
  assert.equal(a.responses.length, b.responses.length);
  for (const full of [a, b]) assert.deepEqual(validateSession(full, protocol, scenarios), full);
  assert.throws(() => validateSession({ ...a, condition: 'separate' }, protocol, scenarios));
  assert.throws(() => validateSession({ ...b, condition: 'guided' }, protocol, scenarios));
});

test('each condition activity enforces its own timer across reloads and in submitted history', () => {
  for (const [condition, stage, seconds, next] of [['guided', 'comparison', 60, 'posttest'], ['separate', 'waste-reflection', 30, 'flood-reflection'], ['separate', 'flood-reflection', 30, 'posttest']]) {
    const full = completed(condition);
    const entry = full.events.find(e => e.stage === stage && e.type === 'stage_entered');
    const stageIndex = stagesFor(protocol, condition).indexOf(stage);
    const partial = structuredClone(full); partial.stage = stage; partial.completedAt = null; partial.events = partial.events.filter(e => e.seq <= entry.seq); partial.updatedAt = entry.at;
    partial.responses = partial.responses.filter(r => stagesFor(protocol, condition).indexOf(r.stage) <= stageIndex);
    const restored = validateSession(partial, protocol, scenarios);
    assert.throws(() => advanceStage(restored, new Date(Date.parse(entry.at) + seconds * 1000 - 1).toISOString()));
    assert.equal(advanceStage(restored, new Date(Date.parse(entry.at) + seconds * 1000).toISOString()).stage, next);
    const tampered = structuredClone(full);
    const finish = tampered.events.find(e => e.stage === stage && e.type === 'stage_completed');
    finish.at = entry.at; finish.elapsedMs = entry.elapsedMs;
    assert.throws(() => validateSession(tampered, protocol, scenarios), /minimum time/);
  }
});

test('collection-v4 sessions resume and export with their original sequence and version', () => {
  for (const condition of ['guided', 'separate']) {
    const full = completed(condition, legacyProtocol);
    assert.deepEqual(validateSession(full, protocol, scenarios), full);
    assert.equal(full.responses.filter(r => r.stage === 'reflection').length, 4);
    assert.equal(full.protocolVersion, 'pilot-draft-4-collection-en');
    const original = session(condition, legacyProtocol), raw = JSON.stringify(original);
    const data = new Map([[sessionStorageKey(legacyProtocol.version), raw]]);
    assert.deepEqual(readSessionProgress(progressStorage(data), protocol, scenarios), original);
    assert.equal(data.get(sessionStorageKey(protocol.version)), undefined);
    assert.equal(data.get(sessionStorageKey(legacyProtocol.version)), raw);
  }
});

test('event sequence and time are monotonic even if a device clock moves backward', () => {
  const s = recordEvent(session(), 'test_event', { zero: 0 }, '2020-01-01T00:00:00Z');
  assert.equal(s.events.at(-1).at, at); assert.equal(s.events.at(-1).seq, 2); assert.equal(s.events.at(-1).elapsedMs, 0);
});
test('full session round-trip and deterministic replay validation', () => {
  const s = completed('guided');
  assert.deepEqual(validateSession(JSON.parse(JSON.stringify(s)), protocol, scenarios), s);
  const corrupt = structuredClone(s); corrupt.runs[0].series[1].stock = 999; assert.throws(() => validateSession(corrupt, protocol, scenarios));
  const skip = session(); skip.stage = 'transfer'; assert.throws(() => validateSession(skip, protocol, scenarios));
  assert.throws(() => validateSession({ ...s, protocolVersion: 'different' }, protocol, scenarios));
});
test('objective scoring keeps manually judged explanations unscored', () => {
  const scores = objectiveScores(completed('separate'));
  assert.deepEqual(scores.map(s => s.objectiveScore), [3, 3, 4]); assert.ok(scores.every(s => s.manualExplanationScore === null));
});
test('research exports include condition, versions, raw responses and time-series', () => {
  const s = completed('guided'), data = researchExports(s);
  assert.ok(data.responses.includes('protocol_version')); assert.ok(data.responses.includes('guided')); assert.ok(data.responses.includes('familiarity'));
  assert.ok(data.timeseries.includes('actual_outflow')); assert.ok(data.timeseries.includes(ENGINE_VERSION)); assert.ok(data.events.includes('simulation_run'));
  assert.ok(data.scores.includes('draft-not-validated')); assert.equal(JSON.parse(data.session).configuration.scenarios.length, 2);
  for (const [condition, classId] of [['guided', 'A'], ['separate', 'B']]) {
    const exports = researchExports(completed(condition));
    for (const kind of ['responses', 'scores', 'events', 'timeseries']) {
      assert.ok(exports[kind].includes('"class_id"') && exports[kind].includes('"' + classId + '","' + condition + '"'), kind);
    }
  }
});
test('CSV protects formulas without converting negative numeric data to text', () => {
  const text = csv([{ text: '=HYPERLINK("x")', quoted: 'a,"b"\nc', number: -2.5 }], ['text', 'quoted', 'number']);
  assert.ok(text.startsWith('\uFEFF')); assert.ok(text.includes('"\'=HYPERLINK(""x"")"')); assert.ok(text.includes('"a,""b""\nc"')); assert.ok(text.endsWith('"-2.5"'));
});
test('invalid and missing form responses are rejected before recording', () => {
  assert.throws(() => submitAnswers(session(), {}, assessments.pretest.fields, at));
  const values = { familiarity: 'nope', stock: 'stock', change: 'rise', balance: '30', explanation: 'reason' };
  assert.throws(() => submitAnswers(session(), values, assessments.pretest.fields, at));
});
test('illustrations use a fixed scale with correct empty and above-reference states', () => {
  assert.deepEqual(sceneScale(0, 100), { level: 0, aboveReference: false });
  assert.deepEqual(sceneScale(50, 100), { level: .5, aboveReference: false });
  assert.deepEqual(sceneScale(150, 100), { level: 1, aboveReference: true });
  for (const pair of [[-1, 100], [NaN, 100], [5, 0], [Infinity, 100]]) assert.throws(() => sceneScale(...pair));
});
test('equivalent stock values have equivalent visual levels across contexts', () => {
  const a = simulate(waste, waste.defaults), b = simulate(flood, flood.defaults);
  a.forEach((point, i) => assert.equal(sceneScale(point.stock, waste.visualization.referenceStock).level, sceneScale(b[i].stock, flood.visualization.referenceStock).level));
  assert.equal(sceneScale(20, waste.visualization.referenceStock).level, .2);
  assert.equal(sceneScale(50, waste.visualization.referenceStock).level, .5);
});
