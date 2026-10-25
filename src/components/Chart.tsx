import type { Point, Run, Scenario } from '../domain/types.ts';
const number = (n: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(n);
export function Chart({ scenario, run, compact = false, cursorIndex }: { scenario: Scenario; run: Run; compact?: boolean; cursorIndex?: number }) {
  const points = run.series;
  const W = 640, H = compact ? 160 : 220, left = 54, right = 20, top = 22, bottom = 35;
  const x = (t: number) => left + t / scenario.duration * (W - left - right);
  const ticks = [0, .25, .5, .75, 1].map(v => v * scenario.duration);
  const cursor = cursorIndex === undefined ? undefined : points[cursorIndex];
  const ymax = Math.max(1, ...points.map(p => p.stock)) * 1.12;
  const y = (v: number) => H - bottom - v / ymax * (H - top - bottom);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time)},${y(p.stock)}`).join(' ');
  const area = line + ` L${x(scenario.duration)},${H - bottom} L${left},${H - bottom} Z`;
  const flowmax = Math.max(1, run.parameters.inflow, run.parameters.inflowAfter, run.parameters.outflow) * 1.2;
  const fy = (v: number) => 145 - v / flowmax * 115;
  const stepPath = (getValue: (p: Point) => number) => points.slice(1).map((p, i) => `${i ? 'L' : 'M'}${x(points[i].time)},${fy(getValue(p))} L${x(p.time)},${fy(getValue(p))}`).join(' ');
  return <div className="chart-block">
    <div className="chart-caption"><strong>{scenario.stockLabel}</strong><span>{scenario.stockUnit}</span></div>
    <svg viewBox={`0 0 ${W} ${H}`} className="time-chart" role="img" aria-label={`Changes in ${scenario.stockLabel.toLowerCase()}; detailed values are available in the results table.`}>
      {[0, .25, .5, .75, 1].map(v => <g key={v}><line x1={left} y1={y(v * ymax)} x2={W - right} y2={y(v * ymax)} className="grid-line"/><text x={left - 10} y={y(v * ymax) + 4} textAnchor="end">{number(v * ymax)}</text></g>)}
      <path d={area} className="stock-area"/><path d={line} className="stock-line"/>
      <line x1={x(run.parameters.policyAt)} y1={top} x2={x(run.parameters.policyAt)} y2={H - bottom} className="policy-line"/>
      {cursor && <g><line x1={x(cursor.time)} y1={top} x2={x(cursor.time)} y2={H - bottom} className="scene-cursor"/><circle cx={x(cursor.time)} cy={y(cursor.stock)} r="4.5" className="scene-cursor-dot" data-testid="chart-scene-cursor"/></g>}
      {ticks.map(t => <text key={t} x={x(t)} y={H - 15} textAnchor="middle">{number(t)}</text>)}
      <text x={W - right} y={12} textAnchor="end">Inflow changes at: {run.parameters.policyAt} {scenario.timeUnit}</text>
    </svg>
    <div className="axis-label">Time ({scenario.timeUnit})</div>
    {!compact && <>
      <div className="chart-caption flow-caption"><strong>Inflow and outflow rates</strong><span>{scenario.flowUnit}</span></div>
      <svg viewBox={`0 0 ${W} 180`} className="time-chart flow-chart" role="img" aria-label="Inflow, outflow capacity, and actual outflow per interval; values are available in the results table.">
        {[0, .5, 1].map(v => <g key={v}><line x1={left} y1={fy(v * flowmax)} x2={W - right} y2={fy(v * flowmax)} className="grid-line"/><text x={left - 10} y={fy(v * flowmax) + 4} textAnchor="end">{number(v * flowmax)}</text></g>)}
        <path d={`M${x(0)},${fy(run.parameters.inflow)} H${x(run.parameters.policyAt)} V${fy(run.parameters.inflowAfter)} H${x(scenario.duration)}`} className="inflow-line"/>
        <path d={`M${x(0)},${fy(run.parameters.outflow)} H${x(scenario.duration)}`} className="capacity-line"/>
        <path d={stepPath(p => p.actualOutflow)} className="outflow-line"/>
        {cursor && <line x1={x(cursor.time)} y1="22" x2={x(cursor.time)} y2="145" className="scene-cursor"/>}
        {ticks.map(t => <text key={t} x={x(t)} y={166} textAnchor="middle">{number(t)}</text>)}
      </svg><div className="legend"><span className="inflow">Inflow</span><span className="capacity">Outflow capacity</span><span className="outflow">Actual outflow</span></div>
    </>}
  </div>;
}
