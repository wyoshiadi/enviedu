import { useEffect, useRef, useState } from 'react';
import type { Run, Scenario } from '../domain/types.ts';
import { Chart } from './Chart.tsx';
import { ScenarioScene } from './ScenarioScene.tsx';
import { sceneScale } from './sceneScale.ts';
const number = (value: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(value);
type Interaction = (type: string, payload: Record<string, unknown>) => void;
export function SimulationViewer({ scenario, run, onInteraction }: { scenario: Scenario; run: Run; onInteraction: Interaction }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const callback = useRef(onInteraction); callback.current = onInteraction;
  const last = run.series.length - 1, point = run.series[index];
  const { aboveReference } = sceneScale(point.stock, scenario.visualization.referenceStock);
  function emit(type: string, position: number, source: string) {
    const p = run.series[position];
    callback.current(type, { scenarioId: scenario.id, runId: run.id, index: position, time: p.time, stock: p.stock, source, visualizationVersion: scenario.visualization.version });
  }
  useEffect(() => {
    if (!reducedMotion) { setPlaying(true); emit('scene_playback_started', 0, 'automatic'); }
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setIndex(current => Math.min(current + 1, last)), 550);
    return () => window.clearInterval(timer);
  }, [playing, last]);
  useEffect(() => {
    if (playing && index === last) { setPlaying(false); emit('scene_playback_completed', index, 'automatic'); }
  }, [index, playing, last]);
  function toggle() {
    if (playing) { setPlaying(false); emit('scene_playback_paused', index, 'button'); }
    else { const start = index === last ? 0 : index; setIndex(start); setPlaying(true); emit('scene_playback_started', start, 'button'); }
  }
  function replay() { setIndex(0); setPlaying(true); emit('scene_playback_started', 0, 'replay'); }
  function select(position: number) { setPlaying(false); setIndex(position); emit('scene_time_selected', position, 'slider'); }
  return <div className="simulation-viewer" data-playing={playing} data-frame={index} data-run-id={run.id}>
    <section className={`scene-viewer ${scenario.id}`} aria-label={`${scenario.shortTitle} visual playback`}>
      <div className="scene-heading"><div><span className="eyebrow">WATCH THE SYSTEM</span><h3>{scenario.id === 'waste' ? 'Watch the pile change.' : 'Watch the water accumulate.'}</h3></div><span className="scene-kind">Illustrated model</span></div>
      <div className="scene-canvas"><ScenarioScene scenario={scenario} stock={point.stock} playing={playing && !reducedMotion}/><div className="scene-timestamp"><span className={playing ? 'pulse-dot' : 'still-dot'}/><output data-testid="scene-time">{number(point.time)} <span>/ {scenario.duration} {scenario.timeUnit}</span></output></div><div className="scene-stock-label"><span>{scenario.stockLabel}</span><output data-testid="scene-stock">{number(point.stock)} <small>{scenario.stockUnit}</small></output></div></div>
      <div className="scene-controls"><button className="scene-play" type="button" onClick={toggle} aria-label={playing ? 'Pause scene playback' : 'Play scene playback'} aria-pressed={playing}><svg viewBox="0 0 20 20" aria-hidden="true">{playing ? <path d="M6 4v12M14 4v12"/> : <path d="m6 3 10 7-10 7Z"/>}</svg><span>{playing ? 'Pause' : 'Play'}</span></button><button type="button" className="scene-replay" onClick={replay} aria-label="Replay scene from the beginning"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8a7 7 0 1 1 1 8M3 3v5h5"/></svg></button><div className="scene-timeline"><label htmlFor={`scene-timeline-${run.id}`} className="sr-only">Simulation time</label><input id={`scene-timeline-${run.id}`} data-testid="scene-timeline" type="range" min={0} max={last} step={1} value={index} aria-valuetext={`${point.time} ${scenario.timeUnit}; ${scenario.stockLabel}: ${point.stock} ${scenario.stockUnit}`} onChange={event => select(Number(event.target.value))}/><div className="scene-timeline-labels"><span>0</span><span className="scene-policy-label" style={{ left: `${run.parameters.policyAt / scenario.duration * 100}%` }}>Inflow changes</span><span>{scenario.duration} {scenario.timeUnit}</span></div></div></div>
      <div className="scene-flow-readouts"><div><span>Stock at this time</span><strong>{number(point.stock)} <small>{scenario.stockUnit}</small></strong></div><div><span>Inflow this interval</span><strong>{index ? number(point.inflow) : '—'} <small>{scenario.flowUnit}</small></strong></div><div><span>Actual outflow</span><strong>{index ? number(point.actualOutflow) : '—'} <small>{scenario.flowUnit}</small></strong></div></div>
      <p className="scene-disclaimer">Symbolic illustration · fixed visual reference: {number(scenario.visualization.referenceStock)} {scenario.stockUnit}.{scenario.id === 'flood' ? ' Water height is illustrative, not a flood-depth prediction.' : ' Individual items do not represent a fixed mass.'}{aboveReference && ' The scene is at full scale; the exact stock remains shown above.'}</p>
    </section>
    <Chart scenario={scenario} run={run} cursorIndex={index}/>
  </div>;
}
