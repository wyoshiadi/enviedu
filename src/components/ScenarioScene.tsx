import { useId } from 'react';
import type { Scenario } from '../domain/types.ts';
import { sceneScale } from './sceneScale.ts';

function Tree({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${size})`}><ellipse cy="9" rx="20" ry="8" fill="#627b5020"/><path d="M0 7v-44" stroke="#897e5f" strokeWidth="5" strokeLinecap="round"/><path d="M-5-17-13-26m15 1 10-12" stroke="#897e5f" strokeWidth="2"/><ellipse cy="-38" rx="23" ry="29" fill="#8fa77a"/><ellipse cx="-9" cy="-40" rx="15" ry="21" fill="#a8be8e"/><path d="M0-17v-23" stroke="#6d8b5d" strokeWidth="1.5" opacity=".6"/></g>;
}
function WasteItem({ index, x, y }: { index: number; x: number; y: number }) {
  const colors = ['#7e8fac', '#c4aa7b', '#95a5c7', '#a4aec6', '#d2ba8d', '#7396c0'];
  const color = colors[index % colors.length];
  return <g transform={`translate(${x} ${y}) rotate(${index % 3 === 0 ? -9 : 6})`} className="waste-item" data-waste-item="true">
    <ellipse cy="11" rx="23" ry="6" fill="#3b493c1a"/>
    {index % 4 === 1 ? <><path d="m-22-7 24-11 23 12-25 12Z" fill="#dfc59b"/><path d="M-22-7v24L0 28V6Z" fill={color}/><path d="M0 6v22l25-12V-6Z" fill="#b6986c"/><path d="m-10-12 23 12M2-18 0 6" stroke="#f2ddba" strokeWidth="3"/></> : index % 4 === 2 ? <g transform="rotate(24)"><path d="M-7-18v-11H7v11l7 8v33c0 8-28 8-28 0v-33Z" fill={color}/><path d="M-6-31H6" stroke="#3f51b5" strokeWidth="5" strokeLinecap="round"/><path d="M-13 1h26v13h-26" fill="#e3e9fc" opacity=".8"/><path d="M-7-10v29" stroke="#fff" strokeWidth="2" opacity=".3"/></g> : <><path d="M-8-17-14-27l13 3 10-4-4 12c21 7 26 31 16 37-11 7-37 7-44 0-8-9-1-30 15-38Z" fill={color}/><path d="M-6-16H7" stroke="#536494" strokeWidth="3" strokeLinecap="round"/><path d="M-8-8c-7 6-11 12-10 20M8-7c4 6 7 13 7 20" fill="none" stroke="#fff" strokeWidth="2" opacity=".22"/></>}
  </g>;
}
function WasteSite({ level }: { level: number }) {
  const items = Array.from({ length: 7 }, (_, row) => Array.from({ length: 7 - row }, (_, col) => ({ x: 265 + row * 21 + col * 39, y: 256 - row * 22 + (col % 2) * 3 }))).flat();
  const amount = level * items.length;
  return <>
    <path d="m89 233 333-116 273 119-330 119Z" fill="#e1e6f7"/>
    <path d="m89 233 276 122v12L89 245Z" fill="#aab5da"/><path d="m365 355 330-119v12L365 367Z" fill="#c4cdeb"/>
    <path d="m126 222 281-94 232 104-283 100Z" fill="#f6f7ff"/><path d="m128 224 277-92 231 102" fill="none" stroke="#c6ceeb" strokeWidth="2"/>
    <path d="m216 210 170-61 162 72-172 61Z" fill="#d9dff2"/>
    <path d="m216 210 170-61v-27l-170 61Z" fill="#aab5d8"/><path d="m386 149 162 72v-27l-162-72Z" fill="#cbd2eb"/>
    <path d="m225 184 161-55 152 68" fill="none" stroke="#eef1ff" strokeWidth="3"/>
    <path d="m181 266 68 30m244-13 52-19" stroke="#bcc8e9" strokeWidth="2" strokeDasharray="8 8"/>
    <Tree x={116} y={218} size={.72}/><Tree x={660} y={230} size={.85}/><Tree x={612} y={134} size={.55}/>
    <g transform="translate(135 242)"><ellipse cx="20" cy="22" rx="58" ry="16" fill="#6d7e5020"/><path d="m-39-16 49-17 38 16-51 18Z" fill="#f0d5a2"/><path d="M-39-16v35L-3 35V1Z" fill="#ceaa70"/><path d="m-3 1 51-18v35L-3 35Z" fill="#bd985e"/><path d="m13-25 22-8 24 12v38l-25 9-21-10Z" fill="#5c6bc0"/><path d="m38-24 14 7v13l-14-5Z" fill="#e3f2fd"/><ellipse cx="-22" cy="22" rx="8" ry="11" fill="#5f6c5e"/><ellipse cx="31" cy="23" rx="8" ry="11" fill="#5f6c5e"/><ellipse cx="-22" cy="22" rx="3" ry="5" fill="#bdc8b0"/><ellipse cx="31" cy="23" rx="3" ry="5" fill="#bdc8b0"/></g>
    <g transform="translate(586 219)"><path d="m-40-34 34-12 36 17-36 13Z" fill="#5c6bc0"/><path d="M-40-34v53L-6 35V-16Z" fill="#dce1f3"/><path d="m-6-16 36-13v51L-6 35Z" fill="#bac5e5"/><path d="m-30-20 14 6V1l-14-6Zm0 25 14 6v18l-14-6Z" fill="#a9b9df"/><path d="m2-10 20-7V1L2 8Z" fill="#6e7eae"/><path d="m-40-34 34-12 36 17" fill="none" stroke="#3f51b5" strokeWidth="3"/><path d="M10-41v-21l12-4v25" fill="#a8b5d9"/></g>
    {level > 0 && <ellipse cx="382" cy="276" rx={70 + level * 63} ry="24" fill="#3f51b51f"/>}
    {items.map((position, i) => amount > i && <g key={i} opacity={Math.min(1, amount - i)}><WasteItem index={i} {...position}/></g>)}
    <path d="m227 293 25 10m255-25 25-9" stroke="#9fa8da" strokeWidth="3" strokeLinecap="round"/>
  </>;
}
function House({ x, y, color, scale = 1 }: { x: number; y: number; color: string; scale?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <ellipse cy="8" rx="58" ry="17" fill="#3f51b51a"/>
    <path d="M-43-52v56L0 24v-58Z" fill="#f4f6ff"/><path d="m0-34 47-17V7L0 24Z" fill="#d1d9ef"/>
    <path d="m-53-54 39-43 24 13-3 52Z" fill={color}/><path d="m10-84 44 19 3 15-50 18Z" fill={color}/><path d="m-53-54 60 22 50-18" fill="none" stroke="#fff" strokeWidth="2" opacity=".3"/>
    <path d="m-34-39 17 7v17l-17-7Zm46 12 17-6v17l-17 6Z" fill="#90caf9"/><path d="m-25-35 0 17m-9-12 17 7m37-17v17m-8-7 17-6" stroke="#e3f2fd" strokeWidth="1.5"/>
    <path d="m-10-8 13 5V22l-13-6Z" fill="#7986b5"/><path d="m25-82 0-20 10 4v21Z" fill="#9d9584"/>
  </g>;
}
function UrbanBlock({ level, id }: { level: number; id: string }) {
  const waterY = 329 - level * 175;
  return <>
    <defs><clipPath id={`${id}-water-clip`}><path d="m78 225 326-111 304 116-333 125Z"/></clipPath><linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#64b5f6" stopOpacity=".65"/><stop offset="1" stopColor="#1976d2" stopOpacity=".82"/></linearGradient></defs>
    <path d="m78 225 326-111 304 116-333 125Z" fill="#e3e9f7"/>
    <path d="m78 225 297 130v12L78 237Z" fill="#adc0e0"/><path d="m375 355 333-125v12L375 367Z" fill="#c9d8ee"/>
    <path d="m173 257 323-112 46 18-325 114Zm97-98 316 122-45 18-316-124Z" fill="#c7d0e4"/>
    <path d="m198 266 317-110m-264 16 311 119" stroke="#f2f5ff" strokeWidth="2" strokeDasharray="12 10"/>
    <path d="m131 218 83-28 46 18-82 30Zm334 71 87-32 59 24-84 32Z" fill="#d6e0ef"/>
    <Tree x={149} y={223} size={.8}/><Tree x={612} y={247} size={.85}/><Tree x={381} y={143} size={.55}/>
    <House x={291} y={200} color="#7986cb" scale={.9}/><House x={489} y={226} color="#789bc4" scale={1.02}/><House x={344} y={289} color="#5c6bc0" scale={.91}/>
    <g transform="translate(202 260)"><path d="m-25-13 25-10 30 14-27 10Z" fill="#e6d4ae"/><path d="M-25-13v18L3 17V1Z" fill="#b7a179"/><path d="m3 1 27-10v18L3 17Z" fill="#d6be93"/><path d="m-14-18 12-5 19 9-13 5Z" fill="#a1bab1"/><ellipse cx="-15" cy="10" rx="5" ry="7" fill="#6b7e72"/><ellipse cx="20" cy="12" rx="5" ry="7" fill="#6b7e72"/></g>
    {level > 0 && <g clipPath={`url(#${id}-water-clip)`} data-water-overlay="true"><rect x="65" y={waterY} width="660" height={380 - waterY} fill={`url(#${id}-water)`}/><path d={`M65 ${waterY + 3}q25-7 50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0`} fill="none" stroke="#bbdefb" strokeWidth="2"/>
      {[0,1,2,3,4].map(i => <path key={i} d={`m${156 + i * 88} ${waterY + 22 + (i % 3) * 18}q14 4 29-2m-9 14 15-4`} fill="none" stroke="#e3f2fd" strokeWidth="1.5" opacity=".6"/>)}
    </g>}
    <path d="m643 222 32-12 13 5-32 12Z" fill="#638cbb"/><path d="m649 220 9 3m-2-6 9 3m-1-6 9 3" stroke="#e1e9dd" strokeWidth="1.3"/>
    <path d="M667 211v-36" stroke="#7e9ac0" strokeWidth="2"/><path d="m660 177 7-4 7 4" fill="none" stroke="#7e9ac0" strokeWidth="2"/>
  </>;
}
export function ScenarioScene({ scenario, stock, playing = false }: { scenario: Scenario; stock: number; playing?: boolean }) {
  const id = 'scene-' + useId().replace(/:/g, '');
  const { level } = sceneScale(stock, scenario.visualization.referenceStock);
  return <svg className={`scenario-scene ${scenario.id} ${playing ? 'scene-playing' : ''}`} viewBox="0 0 760 390" role="img" aria-labelledby={`${id}-title`} data-stock={stock} data-visual-level={level}>
    <title id={`${id}-title`}>{scenario.id === 'waste' ? 'An illustrated waste storage site' : 'An illustrated urban flooding scene'}. {scenario.stockLabel}: {new Intl.NumberFormat('en-GB').format(stock)} {scenario.stockUnit}. Symbolic scale.</title>
    <defs><pattern id={`${id}-dots`} width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill={scenario.id === 'waste' ? '#b8c4f2' : '#a8c8ef'} opacity=".45"/></pattern></defs>
    <rect width="760" height="390" rx="16" fill={scenario.id === 'waste' ? '#eef1ff' : '#eef6ff'}/><rect width="760" height="390" rx="16" fill={`url(#${id}-dots)`}/>
    <ellipse cx="394" cy="280" rx="288" ry="77" fill={scenario.id === 'waste' ? '#3f51b51a' : '#1565c01a'}/>
    {scenario.id === 'waste' ? <WasteSite level={level}/> : <UrbanBlock level={level} id={id}/>}
    <path d="m102 108 18-6m-9-7 1 14M665 96l14-5m-8-5 1 11" fill="none" stroke={scenario.id === 'waste' ? '#b2bdec' : '#a8c4e8'} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>;
}
