import { objectiveScores } from './scoring.ts';
import { classForCondition } from './classes.ts';
import type { Session } from './types.ts';
type Cell = string | number | boolean | null | undefined;
export function csv(rows: Record<string, Cell>[], columns: string[]): string {
  const cell = (value: Cell) => { let text = String(value ?? ''); if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
  return '\uFEFF' + [columns.map(cell).join(','), ...rows.map(r => columns.map(c => cell(r[c])).join(','))].join('\r\n');
}
export function researchExports(s: Session) {
  const metadata = { participant_id: s.participantId, session_id: s.sessionId, class_id: classForCondition(s.condition).id, condition: s.condition, protocol_version: s.protocolVersion, instrument_language: s.configuration.protocol.language, app_version: s.appVersion, engine_version: s.engineVersion };
  const responses = s.responses.map(r => ({ ...metadata, stage: r.stage, item_id: r.itemId, value: r.value, submitted_at_utc: r.at }));
  const events = s.events.map(e => ({ ...metadata, seq: e.seq, at_utc: e.at, elapsed_ms: e.elapsedMs, stage: e.stage, event_type: e.type, payload_json: JSON.stringify(e.payload) }));
  const timeseries = s.runs.flatMap(run => run.series.map(point => ({ ...metadata, scenario: run.scenario, scenario_version: run.scenarioVersion, run_id: run.id, run_at_utc: run.at, initial_stock: run.parameters.initialStock, inflow_before: run.parameters.inflow, inflow_after: run.parameters.inflowAfter, outflow_capacity: run.parameters.outflow, policy_at: run.parameters.policyAt, time: point.time, stock: point.stock, inflow: point.inflow, capacity: point.capacity, actual_outflow: point.actualOutflow, stock_unit: s.configuration.scenarios.find(c => c.id === run.scenario)!.stockUnit, time_unit: s.configuration.scenarios.find(c => c.id === run.scenario)!.timeUnit })));
  const scores = objectiveScores(s).map(row => ({ ...metadata, stage: row.stage, objective_score: row.objectiveScore, objective_max: row.maximum, items_answered: row.answered, manual_explanation_score: null, instrument_status: 'draft-not-validated', session_complete: s.stage === 'complete' }));
  const asCSV = (rows: Record<string, Cell>[], fallback: string[]) => csv(rows, rows.length ? Object.keys(rows[0]) : [...Object.keys(metadata), ...fallback]);
  return {
    responses: asCSV(responses, ['stage', 'item_id', 'value', 'submitted_at_utc']),
    events: asCSV(events, ['seq', 'at_utc', 'elapsed_ms', 'stage', 'event_type', 'payload_json']),
    timeseries: asCSV(timeseries, ['scenario', 'scenario_version', 'run_id', 'time', 'stock', 'inflow', 'capacity', 'actual_outflow']),
    scores: asCSV(scores, []),
    session: JSON.stringify(s, null, 2)
  };
}
