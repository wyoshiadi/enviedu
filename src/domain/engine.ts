import type { Parameters, Point, Scenario } from './types.ts';
export const ENGINE_VERSION = 'single-stock-1.0.0';
export function validateParameters(scenario: Scenario, parameters: Parameters): void {
  if (scenario.engine !== 'single-stock' || scenario.flowUnit !== `${scenario.stockUnit}/${scenario.timeUnit}`) throw new Error('Inconsistent units or engine type in scenario configuration.');
  if (!Number.isFinite(scenario.dt) || !Number.isFinite(scenario.duration) || scenario.dt <= 0 || scenario.duration <= 0 || scenario.duration / scenario.dt > 1000 || Math.abs(scenario.duration / scenario.dt - Math.round(scenario.duration / scenario.dt)) > 1e-8) throw new Error('Invalid simulation interval.');
  for (const key of ['initialStock', 'inflow', 'outflow', 'inflowAfter', 'policyAt'] as const) {
    const value = parameters[key], bound = scenario.bounds[key];
    if (!bound || !Number.isFinite(bound.min) || !Number.isFinite(bound.max) || !Number.isFinite(bound.step) || bound.min < 0 || bound.max < bound.min || bound.step <= 0) throw new Error('Invalid configuration bounds: ' + key);
    if (!Number.isFinite(value) || value < bound.min || value > bound.max || value < 0) throw new Error('Parameter is outside its bounds: ' + key);
    if (Math.abs((value - bound.min) / bound.step - Math.round((value - bound.min) / bound.step)) > 1e-7) throw new Error('Parameter does not match the allowed step: ' + key);
  }
  if (parameters.policyAt >= scenario.duration || Math.abs(parameters.policyAt / scenario.dt - Math.round(parameters.policyAt / scenario.dt)) > 1e-7) throw new Error('The intervention time must align with the time step and fall within the simulation duration.');
}
export function simulate(scenario: Scenario, parameters: Parameters): Point[] {
  validateParameters(scenario, parameters);
  let stock = parameters.initialStock;
  const series: Point[] = [{ time: 0, stock, inflow: parameters.inflow, capacity: parameters.outflow, actualOutflow: 0 }];
  const steps = Math.round(scenario.duration / scenario.dt);
  for (let i = 0; i < steps; i++) {
    const start = i * scenario.dt;
    const inflow = start >= parameters.policyAt ? parameters.inflowAfter : parameters.inflow;
    const available = stock + inflow * scenario.dt;
    const actualOutflow = Math.min(parameters.outflow, available / scenario.dt);
    stock = Math.max(0, available - actualOutflow * scenario.dt);
    series.push({ time: (i + 1) * scenario.dt, stock, inflow, capacity: parameters.outflow, actualOutflow });
  }
  return series;
}
export function distinctRuns(runs: { parameters: Parameters }[]): number {
  return new Set(runs.map(r => JSON.stringify(r.parameters, ['initialStock', 'inflow', 'outflow', 'inflowAfter', 'policyAt']))).size;
}
