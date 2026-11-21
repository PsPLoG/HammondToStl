import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  Box, BoxSelect, Check, ChevronDown, CircleHelp, Copy, Download, Eye, EyeOff,
  FileDown, FileJson, Grip, Info, Layers3, Magnet, Maximize2, Minus, MousePointer2,
  MoveHorizontal, MoveVertical, Plus, RotateCcw, Save, Settings2, Trash2, Upload,
  WandSparkles, X, AlertTriangle, Crosshair, Ruler, CircleDot, CircleCheck,
} from 'lucide-react';
import { COMPONENTS, DEFAULT_PARTS, DEFAULT_SETTINGS, ENCLOSURES, FACES, getPreset } from './presets.js';
import {
  mm, round1, clamp, faceSize, safePosition, moveWithSnap, layoutIssues,
  issueForPart, edgeDistances, nearestNeighbor, distribute, findOpenSpot, partWorld, assemblyIssues,
} from './layout.js';
import { buildShell, buildLid, modelToSTL, downloadBlob, FASTENER_SPEC } from './geometry.js';
import { getFastenerLayout, interiorCompliance } from './fasteners.js';
import { makePCB, sanitizePCB, movePCB, checkPCBLayout } from './pcb.js';
import { applyKnobPreset } from './knobPresets.js';
import './styles.css';

const STORAGE_KEY = 'pedalform_project_v1';
const FACE_LABELS = Object.fromEntries(FACES.map(f => [f.id, f.label]));
const FACES_SET = new Set(FACES.map(f => f.id));
const COMP_SET = new Set(Object.keys(COMPONENTS));
const idGen = () => (globalThis.crypto?.randomUUID?.() ?? `part-${Date.now()}-${Math.random().toString(16).slice(2)}`);

function readLocalProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const json = JSON.parse(raw);
    if (!Array.isArray(json.parts) || !json.settings) return null;
    return sanitizeProject(json);
  } catch { return null; }
}

function sanitizeProject(json) {
  const s = { ...DEFAULT_SETTINGS, ...(json.settings ?? {}) };
  if (!ENCLOSURES[s.enclosure]) s.enclosure = '1590B';
  if (!['screw', 'magnet'].includes(s.closure)) s.closure = 'screw';
  s.wall = clamp(Number(s.wall) || DEFAULT_SETTINGS.wall, 2, 5);
  s.lidThickness = clamp(Number(s.lidThickness) || DEFAULT_SETTINGS.lidThickness, 2.6, 6);
  s.edgeClearance = clamp(Number(s.edgeClearance) || DEFAULT_SETTINGS.edgeClearance, 1.5, 10);
  s.partGap = clamp(Number(s.partGap) || DEFAULT_SETTINGS.partGap, 0, 10);
  s.magnetDiameter = clamp(Number(s.magnetDiameter) || DEFAULT_SETTINGS.magnetDiameter, 3, 8);
  s.magnetDepth = clamp(Number(s.magnetDepth) || DEFAULT_SETTINGS.magnetDepth, 1, 3.2);
  s.magnetTolerance = clamp(Number(s.magnetTolerance) || DEFAULT_SETTINGS.magnetTolerance, 0, 0.8);
  const used = new Set();
  const p = (Array.isArray(json.parts) ? json.parts : []).filter(x => x && COMP_SET.has(x.type) && FACES_SET.has(x.face)).slice(0, 60).map(x => {
    let id = String(x.id || idGen());
    if (used.has(id)) id = idGen();
    used.add(id);
    const defaultP = COMPONENTS[x.type];
    const hole = clamp(Number(x.hole) || defaultP.hole, 1, 32);
    const keepout = clamp(Number(x.keepout) || defaultP.keepout, hole, 45);
    return { id, type: x.type, face: x.face, u: round1(Number(x.u) || 0), v: round1(Number(x.v) || 0), hole, keepout };
  });
  const boardPreset = getPreset(s.enclosure);
  const usedBoards = new Set();
  const boards = (Array.isArray(json.boards) ? json.boards : []).filter(Boolean).slice(0, 10).map(raw => {
    const board = sanitizePCB(raw, boardPreset, s);
    if (usedBoards.has(board.id)) board.id = idGen();
    usedBoards.add(board.id);
    return board;
  });
  return { settings: s, parts: p, boards };
}

function NumberField({ label, value, onCommit, min = -999, max = 999, step = 0.1, suffix = 'mm', disabled = false }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && draft.trim() !== '') onCommit(round1(clamp(n, min, max)));
    else setDraft(String(value));
  };
  return (
    <label className="number-field">
      <span>{label}</span>
      <div className="number-input-wrap">
        <input type="number" inputMode="decimal" step={step} min={min} max={max} value={draft}
          disabled={disabled} onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <span className="unit">{suffix}</span>
      </div>
    </label>
  );
}

function SegmentedTabs({ items, value, onChange, dense = false }) {
  return <div className={`segmented ${dense ? 'dense' : ''}`} role="tablist">
    {items.map(item => <button key={item.value} className={value === item.value ? 'active' : ''}
      onClick={() => onChange(item.value)} role="tab" aria-selected={value === item.value}>{item.label}</button>)}
  </div>;
}

function FaceDiagram({ settings, parts, face, selectedId, onSelect, onMove, showGuides, boards, selectedBoardId, onBoardSelect, onBoardMove }) {
  const svgRef = useRef(null);
  const dragging = useRef(null);
  const [snaps, setSnaps] = useState(null);
  const d = faceSize(settings.enclosure, face);
  const focused = parts.find(p => p.id === selectedId && p.face === face) ?? null;
  const inFace = parts.filter(p => p.face === face);
  const fasteners = face === 'top' ? getFastenerLayout(getPreset(settings.enclosure), settings) : null;
  const margin = Math.max(15, d.width * 0.18, d.height * 0.08);
  const vb = [-d.width / 2 - margin, -d.height / 2 - margin, d.width + margin * 2, d.height + margin * 2];
  const defId = `diagram-${face}`;
  const grid = [];
  for (let x = -Math.floor(d.width / 10) * 10; x < d.width / 2; x += 10) {
    if (x > -d.width / 2) grid.push(<line key={`x${x}`} x1={x} y1={-d.height / 2} x2={x} y2={d.height / 2} className="grid-major" />);
  }
  for (let y = -Math.floor(d.height / 10) * 10; y < d.height / 2; y += 10) {
    if (y > -d.height / 2) grid.push(<line key={`y${y}`} x1={-d.width / 2} y1={y} x2={d.width / 2} y2={y} className="grid-major" />);
  }
  const toLocal = e => {
    const svg = svgRef.current;
    if (!svg) return { u: 0, v: 0 };
    const p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return { u: 0, v: 0 };
    const q = p.matrixTransform(m.inverse());
    return { u: q.x, v: q.y };
  };
  const startDrag = (e, part) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    onSelect(part.id);
    const p = toLocal(e);
    dragging.current = { kind: 'part', id: part.id, offU: part.u - p.u, offV: part.v - p.v };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const startBoardDrag = (e, board) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    onBoardSelect(board.id);
    const p = toLocal(e);
    dragging.current = { kind: 'board', id: board.id, offU: board.x - p.u, offV: board.z - p.v };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const updateDrag = e => {
    if (!dragging.current) return;
    const p = toLocal(e);
    if (dragging.current.kind === 'board') {
      const board = boards.find(b => b.id === dragging.current.id);
      if (!board) return;
      const moved = movePCB(board, p.u + dragging.current.offU, p.v + dragging.current.offV, getPreset(settings.enclosure), settings);
      onBoardMove(board.id, { x: moved.x, z: moved.z });
      setSnaps(null);
      return;
    }
    const target = parts.find(x => x.id === dragging.current.id);
    if (!target) return;
    const moved = moveWithSnap(target, p.u + dragging.current.offU, p.v + dragging.current.offV, parts, settings, e.shiftKey);
    setSnaps({ u: moved.snappedU, v: moved.snappedV });
    onMove(dragging.current.id, { u: moved.u, v: moved.v });
  };
  const endDrag = () => { dragging.current = null; setSnaps(null); };
  const e = focused ? edgeDistances(focused, settings) : null;
  const neighbor = focused ? nearestNeighbor(focused, parts) : null;
  const textSize = clamp(Math.min(d.width, d.height) * 0.105, 2.9, 4.2);
  const r = focused ? focused.keepout / 2 : 0;
  return (
    <div className="diagram-wrap">
      <div className="diagram-intro"><MousePointer2 size={14} /> 드래그해 위치 지정 <span className="shortcut">Shift = 스냅 해제 · 방향키 이동</span></div>
      <svg ref={svgRef} className="face-svg" viewBox={vb.join(' ')} preserveAspectRatio="xMidYMid meet"
        aria-label={`${FACE_LABELS[face]} 부품 위치 편집기`}
        onPointerMove={updateDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
        onPointerDown={e => { if (e.target === e.currentTarget) onSelect(null); }}>
        <defs>
          <pattern id={`${defId}-grid`} width="5" height="5" patternUnits="userSpaceOnUse"><path d="M 5 0 L 0 0 0 5" fill="none" stroke="#d6dfdf" strokeWidth=".16" /></pattern>
          <clipPath id={`${defId}-clip`}><rect x={-d.width/2} y={-d.height/2} width={d.width} height={d.height} rx={d.radius} /></clipPath>
          <marker id={`${defId}-dot`} markerWidth="3" markerHeight="3" refX="1.5" refY="1.5"><circle cx="1.5" cy="1.5" r="1.2" fill="#328b81" /></marker>
        </defs>
        <rect x={-d.width/2 - 1} y={-d.height/2 - 1} width={d.width + 2} height={d.height + 2} rx={d.radius+1} fill="#d8e1df" />
        <rect x={-d.width/2} y={-d.height/2} width={d.width} height={d.height} rx={d.radius} fill="#fafdfe" stroke="#9bb7b4" strokeWidth=".38" />
        <g clipPath={`url(#${defId}-clip)`}>
          <rect x={-d.width/2} y={-d.height/2} width={d.width} height={d.height} fill={`url(#${defId}-grid)`} />
          {grid}
          {face === 'top' && boards.map(board => <g key={board.id} className="pcb-footprint" role="button" aria-label={board.name + ' 위치 이동'}
            onPointerDown={ev => startBoardDrag(ev, board)}>
            <rect x={board.x - board.width/2} y={board.z - board.length/2}
              width={board.width} height={board.length} rx="0.8"
              fill={selectedBoardId === board.id ? '#66cda0' : '#8dccb1'}
              fillOpacity={selectedBoardId === board.id ? .35 : .19}
              stroke={selectedBoardId === board.id ? '#16885b' : '#50a486'}
              strokeWidth={selectedBoardId === board.id ? .8 : .42}
              strokeDasharray={selectedBoardId === board.id ? '0' : '2 1.5'} />
            <text x={board.x} y={board.z} textAnchor="middle" fontSize="3.2" fill="#1e8062" fontWeight="800" pointerEvents="none">{board.name}</text>
            <text x={board.x} y={board.z + 4} textAnchor="middle" fontSize="2.3" fill="#1e8062" pointerEvents="none">{board.width.toFixed(0)} × {board.length.toFixed(0)} mm</text>
          </g>)}
          {fasteners?.centers.map(([x,z], i) => <g key={`post-${i}`} className="fastener-footprint" pointerEvents="none">
            <circle cx={x} cy={z} r={fasteners.radius} />
            <circle cx={x} cy={z} r={settings.closure === 'screw' ? FASTENER_SPEC.screwPilot / 2 : (settings.magnetDiameter + settings.magnetTolerance) / 2} className="fastener-bore" />
          </g>)}
          <line x1={-d.width/2} y1="0" x2={d.width/2} y2="0" className="centerline" />
          <line x1="0" y1={-d.height/2} x2="0" y2={d.height/2} className="centerline" />
          {focused && showGuides && <>
            {snaps?.u !== null && snaps?.u !== undefined && <line x1={focused.u} y1={-d.height/2} x2={focused.u} y2={d.height/2} className="snapline" />}
            {snaps?.v !== null && snaps?.v !== undefined && <line x1={-d.width/2} y1={focused.v} x2={d.width/2} y2={focused.v} className="snapline" />}
            <g className="measurement">
              <line x1={-d.width/2} y1={focused.v} x2={focused.u-r} y2={focused.v} />
              <line x1={focused.u+r} y1={focused.v} x2={d.width/2} y2={focused.v} />
              <line x1={focused.u} y1={-d.height/2} x2={focused.u} y2={focused.v-r} />
              <line x1={focused.u} y1={focused.v+r} x2={focused.u} y2={d.height/2} />
              {e.left > 3 && <text x={(-d.width/2+focused.u-r)/2} y={focused.v-2.1} textAnchor="middle">{e.left}</text>}
              {e.right > 3 && <text x={(d.width/2+focused.u+r)/2} y={focused.v-2.1} textAnchor="middle">{e.right}</text>}
              {e.top > 3 && <text x={focused.u + 2.4} y={(-d.height/2+focused.v-r)/2} dominantBaseline="middle">{e.top}</text>}
              {e.bottom > 3 && <text x={focused.u + 2.4} y={(d.height/2+focused.v+r)/2} dominantBaseline="middle">{e.bottom}</text>}
              {neighbor && neighbor.dist > 0.01 && (() => {
                const dx = (neighbor.part.u - focused.u)/neighbor.dist;
                const dy = (neighbor.part.v - focused.v)/neighbor.dist;
                const ax = focused.u + dx*r, ay = focused.v + dy*r;
                const bx = neighbor.part.u - dx*neighbor.part.keepout/2;
                const by = neighbor.part.v - dy*neighbor.part.keepout/2;
                return <>
                  <line x1={ax} y1={ay} x2={bx} y2={by} className={neighbor.gap < settings.partGap ? 'measure-danger' : 'neighbor-line'} />
                  <text x={(ax+bx)/2} y={(ay+by)/2-2.6} textAnchor="middle" className={neighbor.gap < settings.partGap ? 'measure-danger-text' : 'neighbor-text'}>{neighbor.gap} mm</text>
                </>;
              })()}
            </g>
          </>}
          {inFace.map(p => {
            const meta = COMPONENTS[p.type];
            const active = focused?.id === p.id;
            const invalid = !!issueForPart(p, parts, settings);
            return <g key={p.id} onPointerDown={ev => startDrag(ev, p)} role="button" aria-label={`${meta.label} 선택 및 드래그`} className={`component-marker ${active ? 'selected' : ''}`}>
              <circle cx={p.u} cy={p.v} r={p.keepout/2} fill={invalid ? '#ffe0df' : meta.color} fillOpacity={active ? 0.28 : 0.16} stroke={invalid ? '#de6660' : active ? '#1d8077' : '#849e9e'} strokeWidth={active ? 0.65 : 0.3} strokeDasharray={active ? '0' : '1.4 1.1'} />
              <circle cx={p.u} cy={p.v} r={p.hole/2} fill={invalid ? '#8e3e3e' : '#273b43'} stroke={active ? '#a8ef90' : '#fff'} strokeWidth={active ? 0.75 : 0.45} />
              <circle cx={p.u} cy={p.v} r={Math.max(5, p.keepout/2)} fill="transparent" />
              <text x={p.u} y={p.v+1.1} textAnchor="middle" fill="white" fontWeight="800" fontSize={Math.min(3.2, p.hole*0.43)} pointerEvents="none">{meta.short === 'FOOT' ? 'FS' : meta.short === 'TOGGLE' ? 'T' : meta.short.slice(0,2)}</text>
              {active && <circle cx={p.u} cy={p.v} r={p.keepout/2 + 1.65} fill="none" stroke="#288b7e" strokeWidth=".35" strokeDasharray="1.1 1.2" pointerEvents="none" />}
            </g>;
          })}
        </g>
        <g className="dimension-text" fontSize={textSize}>
          <text x="0" y={-d.height/2-6.5} textAnchor="middle">{mm(d.width)}</text>
          <text x={-d.width/2-8} y="0" textAnchor="middle" transform={`rotate(-90 ${-d.width/2-8} 0)`}>{mm(d.height)}</text>
          <text x={d.width/2 + 2} y={d.height/2 + 7} textAnchor="end" fontSize={textSize*.82}>1 unit = 1 mm</text>
        </g>
      </svg>
      <div className="diagram-footer"><span><i className="diagram-dot filled" /> 절삭 홀</span><span><i className="diagram-dot outlined" /> 부품 간섭 영역</span><span><i className="diagram-line" /> 실시간 치수</span>{face === 'top' && <><span className="fastener-legend">◌ 하판 체결부 투영</span><span className="pcb-legend">▧ PCB 내부 투영</span></>}</div>
    </div>
  );
}

function VisibleModel({ model, settings, preset, parts, selectedId, onSelect, onFace, boards, selectedBoardId, onBoardSelect }) {
  if (!model?.shell || !model?.lid) return null;
  const selected = parts.find(p => p.id === selectedId);
  const clickShell = e => {
    e.stopPropagation();
    const n = e.face?.normal;
    if (!n) return;
    const transformed = n.clone().transformDirection(e.object.matrixWorld);
    let face = 'top';
    if (Math.abs(transformed.y) > Math.max(Math.abs(transformed.x), Math.abs(transformed.z))) {
      face = transformed.y > 0 ? 'top' : 'top';
    } else if (Math.abs(transformed.z) > Math.abs(transformed.x)) {
      face = transformed.z > 0 ? 'front' : 'back';
    } else {
      face = transformed.x > 0 ? 'right' : 'left';
    }
    onFace(face);
  };
  const highlights = parts.map(p => {
    const x = partWorld(p, preset, settings.wall, settings.wall / 2 + 1.3);
    const orientation = p.face === 'top' ? [-Math.PI/2, 0, 0] :
      p.face === 'back' ? [0, Math.PI, 0] :
      p.face === 'left' ? [0, -Math.PI/2, 0] :
      p.face === 'right' ? [0, Math.PI/2, 0] : [0, 0, 0];
    const selected = p.id === selectedId;
    return <mesh key={p.id} position={x.position} rotation={orientation} onClick={e => { e.stopPropagation(); onSelect(p.id); onFace(p.face, true); }}>
      <torusGeometry args={[p.hole / 2 + 1.1, selected ? 0.62 : 0.35, 7, 32]} />
      <meshBasicMaterial color={selected ? '#baff78' : '#72c1b6'} transparent opacity={selected ? 1 : .56} depthTest={false} />
    </mesh>;
  });
  const label = selected ? partWorld(selected, preset, settings.wall, settings.wall / 2 + 6.5).position : null;
  return <>
    <mesh geometry={model.shell.geometry} onClick={clickShell} castShadow receiveShadow>
      <meshStandardMaterial color="#8ca4a5" metalness={0.47} roughness={0.36} side={THREE.DoubleSide}
        transparent={!!settings.xray} opacity={settings.xray ? .24 : 1} depthWrite={!settings.xray} />
    </mesh>
    {settings.showLid && <mesh geometry={model.lid.geometry} position={[0, settings.exploded ? -14 : 0, 0]} castShadow receiveShadow>
      <meshStandardMaterial color="#6b888b" metalness={0.38} roughness={0.42} side={THREE.DoubleSide} />
    </mesh>}
    {boards.map(board => <mesh key={board.id} position={[board.x, board.bottomY + board.thickness/2, board.z]}
      onClick={event => { event.stopPropagation(); onBoardSelect(board.id); }}>
      <boxGeometry args={[board.width, board.thickness, board.length]} />
      <meshStandardMaterial color={board.id === selectedBoardId ? '#6bdfaa' : '#27946f'}
        roughness={.6} metalness={.12} transparent opacity={.94} side={THREE.DoubleSide} />
    </mesh>)}
    {highlights}
    {selected && label && <Html position={label} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div className="three-label">{COMPONENTS[selected.type].short} <b>Ø {selected.hole.toFixed(1)}</b></div>
    </Html>}
  </>;
}

function ModelPreview({ model, settings, preset, parts, selectedId, onSelect, onFace, computing, boards, selectedBoardId, onBoardSelect }) {
  const [cameraKey, setCameraKey] = useState(0);
  const [wire, setWire] = useState(false);
  return <div className="preview-content">
    <div className="preview-floating"><span className="live-dot" />{computing ? 'UPDATING MESH' : model?.error ? 'MESH ERROR' : 'LIVE MODEL'}</div>
    <div className="preview-actions">
      <button title="카메라 초기화" onClick={() => setCameraKey(n => n+1)}><RotateCcw size={16} /></button>
      <button title="와이어프레임 전환" className={wire ? 'active' : ''} onClick={() => setWire(x => !x)}><Grip size={16} /></button>
    </div>
    <div className="preview-viewport">
      <Canvas key={cameraKey} shadows camera={{ position: [preset.w * 1.7, preset.h * 3.7, preset.l * 1.65], fov: 39, near: 0.1, far: 1200 }} dpr={[1, 1.8]} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={['#e5eceb']} />
        <ambientLight intensity={1.55} />
        <directionalLight position={[110, 170, 90]} intensity={2.4} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-100, 50, -80]} intensity={0.9} />
        <group>
          <VisibleModel model={model} preset={preset} settings={settings} parts={parts} selectedId={selectedId} onSelect={onSelect} onFace={onFace} boards={boards} selectedBoardId={selectedBoardId} onBoardSelect={onBoardSelect} />
          {wire && model?.shell && <mesh geometry={model.shell.geometry}>
            <meshBasicMaterial color="#487779" wireframe transparent opacity={0.22} depthTest={false} />
          </mesh>}
        </group>
        <gridHelper args={[Math.max(200, preset.l * 2), 20, '#9db4b3', '#cedbd9']} position={[0, -21, 0]} />
        <OrbitControls makeDefault target={[0, preset.h / 2, 0]} enableDamping minDistance={50} maxDistance={470} maxPolarAngle={Math.PI * 0.88} />
      </Canvas>
    </div>
    {model?.error && <div className="preview-error"><AlertTriangle size={15} /> {model.error}</div>}
    <div className="preview-bottom"><span>드래그로 회전 · 휠로 확대</span><span>CLICK A FACE TO EDIT</span></div>
  </div>;
}

function Sidebar({ settings, setSettings, face, onAdd, parts, boards, selectedBoardId, onSelectBoard, onAddBoard, onRemoveBoard, onPreset }) {
  const preset = getPreset(settings.enclosure);
  const mounts = getFastenerLayout(preset, settings);
  const specFit = interiorCompliance(preset, settings);
  const set = (patch) => setSettings(s => ({ ...s, ...patch }));
  return <aside className="sidebar">
    <div className="aside-scroll">
      <div className="aside-head"><span className="section-eyebrow">01 / ENCLOSURE</span><h2>케이스 설정</h2></div>
      <div className="case-options">
        {Object.values(ENCLOSURES).map(p => <button className={`case-option ${settings.enclosure === p.code ? 'chosen' : ''}`} key={p.code} onClick={() => set({ enclosure: p.code })}>
          <span className="case-thumb"><span style={{ width: `${30 + p.w / 8}px`, height: `${24 + p.l / 15}px` }} /></span>
          <strong>{p.code}</strong><small>{p.name}</small>
          {settings.enclosure === p.code && <Check size={14} className="case-check" />}
        </button>)}
      </div>
      <div className="case-measure"><Ruler size={14} /> <span>{preset.w} × {preset.l} × {round1(preset.h + settings.lidThickness)} <b>mm (조립)</b></span></div>
      <div className={`interior-readout ${!specFit.passes ? 'interior-warning' : ''}`}>
        <span className="interior-title"><Ruler size={13} /> 내부 사용 공간 · 평면 기준</span>
        <div><span>중앙 내경</span><b>{mounts.insideWidth.toFixed(1)} × {mounts.insideLength.toFixed(1)} mm</b></div>
        <div><span>코너 기둥 사이</span><b>{mounts.cornerClearWidth.toFixed(1)} × {mounts.cornerClearLength.toFixed(1)} mm</b></div>
        <div><span>{settings.closure === 'screw' ? '나사 기둥' : '자석 기둥'}</span><b>Ø {(mounts.radius * 2).toFixed(1)} mm · 외벽 {(mounts.outerSkin).toFixed(1)} mm+</b></div>
        {specFit.measured && <p>{specFit.passes ? '✓ ' : '⚠ '}하몬드 도면의 중앙 내경 {specFit.targetWidth} × {specFit.targetLength} mm {specFit.passes ? '확보' : '미달'} (평면 치수만 비교)</p>}
      </div>
      <div className="aside-divider" />
      <div className="aside-head"><span className="section-eyebrow">02 / FASTENING</span><h2>하판 결합 방식</h2></div>
      <div className="closure-options">
        <button onClick={() => set({ closure: 'screw' })} className={`closure-option ${settings.closure === 'screw' ? 'chosen' : ''}`}>
          <span className="closure-icon">✳</span><span><b>슬림 M3 나사</b><small>Ø6mm 기둥 · 벽/상판 일체형 보강</small></span><span className="radio-dot" />
        </button>
        <button onClick={() => set({ closure: 'magnet' })} className={`closure-option ${settings.closure === 'magnet' ? 'chosen' : ''}`}>
          <Magnet size={21} /><span><b>네오디뮴 자석</b><small>본체 / 하판 4쌍 포켓</small></span><span className="radio-dot" />
        </button>
      </div>
      {settings.closure === 'magnet' && <div className="setting-pair">
        <NumberField label="자석 지름" value={settings.magnetDiameter} min={3} max={8} onCommit={n => set({ magnetDiameter: n })} />
        <NumberField label="자석 두께" value={settings.magnetDepth} min={1} max={2.6} onCommit={n => set({ magnetDepth: n })} />
        <NumberField label="포켓 여유" value={settings.magnetTolerance} min={0} max={.8} onCommit={n => set({ magnetTolerance: n })} />
      </div>}
      <div className="aside-divider" />
      <div className="aside-head"><span className="section-eyebrow">03 / COMPONENTS</span><h2>부품 라이브러리</h2><p>선택한 면에 부품을 추가하세요.</p></div>
      <div className="component-palette">
        {Object.entries(COMPONENTS).map(([type, m]) => <button key={type} className="palette-item" onClick={() => onAdd(type)} title={`${m.hint} · 홀 Ø${m.hole} mm`}>
          <span className="palette-symbol" style={{ '--color': m.color }}>{m.glyph}</span>
          <span className="palette-name"><b>{m.label}</b><small>Ø {m.hole.toFixed(1)} mm</small></span>
          <Plus size={16} className="palette-plus" />
        </button>)}
      </div>
      <div className="palette-hint"><Info size={14} /> 기본 홀 지름은 예시입니다. 실부품 데이터시트에 맞게 변경하세요.</div>
      <div className="aside-divider" />
      <div className="aside-head"><span className="section-eyebrow">04 / PRESETS</span><h2>노브 프리셋</h2>
        <p>상판 포텐셔미터만 교체하며 LED·잭·풋스위치는 유지합니다.</p></div>
      <div className="knob-presets">
        {[1,2,3,4,5,6].map(count => <button key={count} onClick={() => onPreset(count)} title={count + '노브 자동 배치'}>{count}<small>노브</small></button>)}
      </div>
      <div className="aside-divider" />
      <div className="aside-head"><span className="section-eyebrow">05 / PCB</span><h2>기판 배치</h2>
        <p>내부에 가상 PCB를 넣어 공간과 간섭을 확인하세요.</p></div>
      <button className="add-board" onClick={onAddBoard}><Plus size={16} /> PCB 추가</button>
      {boards.length > 0 && <div className="pcb-list">{boards.map(board =>
        <div key={board.id} className={'pcb-list-item ' + (selectedBoardId === board.id ? 'active' : '')}>
          <button onClick={() => onSelectBoard(board.id)}><Layers3 size={16} />
            <span><b>{board.name}</b><small>{board.width.toFixed(1)} × {board.length.toFixed(1)} mm</small></span></button>
          <button className="pcb-remove" onClick={() => onRemoveBoard(board.id)} title="PCB 삭제"><Trash2 size={14} /></button>
        </div>)}</div>}
      <div className="palette-hint"><Info size={14} /> PCB는 공간 검토용 모형입니다. 실제 PCB 고정 스탠드오프·부품 돌출 높이는 포함하지 않습니다.</div>
    </div>
  </aside>;
}

function Inspector({ selected, parts, settings, onUpdate, onDuplicate, onDelete, issueCount }) {
  const d = selected ? edgeDistances(selected, settings) : null;
  const next = selected ? nearestNeighbor(selected, parts) : null;
  const issue = selected ? issueForPart(selected, parts, settings) : null;
  return <aside className="inspector">
    <div className="inspector-head"><span className="section-eyebrow">PROPERTIES</span><h2>속성 및 측정</h2></div>
    {!selected ? <div className="empty-inspector"><div className="empty-inspector-icon"><MousePointer2 size={25} /></div><h3>부품을 선택하세요</h3><p>2D 도면에서 부품을 클릭하면<br />좌표, 가공 치수, 벽 간격이 표시됩니다.</p><span>SELECT AN ELEMENT</span></div> : <div className="inspector-body">
      <div className="selected-meta"><div className="inspector-symbol" style={{ '--accent': COMPONENTS[selected.type].color }}>{COMPONENTS[selected.type].glyph}</div><div><span>SELECTED COMPONENT</span><h3>{COMPONENTS[selected.type].label}</h3><small>{FACE_LABELS[selected.face]} · {COMPONENTS[selected.type].short}</small></div></div>
      <div className="inspector-section"><h4><Crosshair size={15} /> 위치 <span>CENTER ORIGIN</span></h4><div className="two-fields">
        <NumberField label="X / U" value={selected.u} onCommit={u => onUpdate(selected.id, { u })} />
        <NumberField label="Y / V" value={selected.v} onCommit={v => onUpdate(selected.id, { v })} />
      </div><p className="micro-help">각 면 중앙이 (0, 0)입니다. mm 단위로 조정됩니다.</p></div>
      <div className="inspector-section"><h4><CircleDot size={15} /> 가공 지름</h4><div className="two-fields">
        <NumberField label="관통 홀 Ø" value={selected.hole} min={1} max={32} onCommit={hole => onUpdate(selected.id, { hole, keepout: Math.max(hole, selected.keepout) })} />
        <NumberField label="간섭 영역 Ø" value={selected.keepout} min={selected.hole} max={45} onCommit={keepout => onUpdate(selected.id, { keepout })} />
      </div><p className="micro-help">간섭 영역은 너트·와셔·부품 몸체가 차지하는 공간입니다.</p></div>
      <div className="inspector-section"><h4><Ruler size={15} /> 벽과의 거리 <span>EDGE CLEARANCE</span></h4>
        <div className="clearance-map"><div className="cleared top-gap">{d.top.toFixed(1)}</div><div className="h-clear"><span className="cleared">{d.left.toFixed(1)}</span><span className="center-indicator">Ø {selected.keepout.toFixed(1)}</span><span className="cleared">{d.right.toFixed(1)}</span></div><div className="cleared bottom-gap">{d.bottom.toFixed(1)}</div></div>
        <div className="distance-legend">모든 수치는 부품 <b>간섭 영역의 끝</b> 기준 (mm)</div>
        {next && <div className="neighbor-stat"><span>가장 가까운 부품</span><strong className={next.gap < settings.partGap ? 'danger' : ''}>{next.gap.toFixed(1)} mm</strong></div>}
      </div>
      {issue ? <div className="inspector-alert"><AlertTriangle size={15} /><span>{issue}</span></div> : <div className="inspector-ok"><CircleCheck size={15} /><span>현재 부품의 기본 간격 조건 통과</span></div>}
      <div className="inspect-actions"><button onClick={() => onDuplicate(selected.id)}><Copy size={15} /> 복제</button><button className="delete" onClick={() => onDelete(selected.id)}><Trash2 size={15} /> 삭제</button></div>
    </div>}
    <div className="inspector-bottom"><div className="inspector-bottom-top"><span>LAYOUT CHECK</span><strong>{issueCount === 0 ? 'PASS' : `${issueCount} ISSUES`}</strong></div><p>{issueCount ? '충돌 또는 벽 간격 부족이 있습니다. 수정하면 STL을 내보낼 수 있습니다.' : '설계된 부품 간 기본 간격이 확인되었습니다.'}</p></div>
  </aside>;
}

function PCBInspector({ board, boards, preset, settings, onUpdate, onDelete, issueCount }) {
  const issue = checkPCBLayout(boards, preset, settings, getFastenerLayout(preset, settings)).find(i => i.id === board.id);
  return <aside className="inspector">
    <div className="inspector-head"><span className="section-eyebrow">PCB PROPERTIES</span><h2>PCB 치수 및 위치</h2></div>
    <div className="inspector-body">
      <div className="selected-meta"><div className="pcb-inspector-icon"><Layers3 size={24} /></div>
        <div><span>SELECTED CIRCUIT BOARD</span><h3>{board.name}</h3><small>내부 공간 검토용 가상 기판</small></div></div>
      <div className="inspector-section"><h4><Ruler size={15} /> 실물 기판 크기</h4><div className="two-fields">
        <NumberField label="너비 X" value={board.width} min={8} max={Math.max(8,preset.w-2*settings.wall-1.6)} onCommit={width => onUpdate(board.id,{width})} />
        <NumberField label="길이 Z" value={board.length} min={8} max={Math.max(8,preset.l-2*settings.wall-1.6)} onCommit={length => onUpdate(board.id,{length})} />
        <NumberField label="두께" value={board.thickness} min={.8} max={4} onCommit={thickness => onUpdate(board.id,{thickness})} />
      </div></div>
      <div className="inspector-section"><h4><Crosshair size={15} /> 내부 위치</h4><div className="two-fields">
        <NumberField label="중심 X" value={board.x} onCommit={x => onUpdate(board.id,{x})} />
        <NumberField label="중심 Z" value={board.z} onCommit={z => onUpdate(board.id,{z})} />
        <NumberField label="하판 위 높이 Y" value={board.bottomY} min={0} max={preset.h} onCommit={bottomY => onUpdate(board.id,{bottomY})} />
      </div><p className="micro-help">하판 접합면 Y=0 기준, 상판 내부 천장 Y={(preset.h-settings.wall).toFixed(1)} mm</p></div>
      {issue ? <div className="inspector-alert"><AlertTriangle size={15} /><span>{issue.error}</span></div> :
        <div className="inspector-ok"><CircleCheck size={15} /><span>내벽·기둥·다른 PCB와의 기본 간섭 검사 통과</span></div>}
      <p className="micro-help">상판 2D에서 PCB 영역을 드래그할 수 있습니다. 전자부품·PCB 고정용 나사홀·스탠드오프는 아직 모델링하지 않습니다.</p>
      <div className="inspect-actions"><button className="delete" onClick={() => onDelete(board.id)}><Trash2 size={15} /> PCB 삭제</button></div>
    </div>
    <div className="inspector-bottom"><div className="inspector-bottom-top"><span>LAYOUT CHECK</span><strong>{issueCount === 0 ? 'PASS' : issueCount + ' ISSUES'}</strong></div><p>STL 출력에는 기판을 포함하지 않습니다.</p></div>
  </aside>;
}

export default function App() {
  const initial = useRef(readLocalProject());
  const [settings, setSettings] = useState(() => initial.current?.settings ?? { ...DEFAULT_SETTINGS });
  const [parts, setParts] = useState(() => initial.current?.parts ?? DEFAULT_PARTS.map(p => ({ ...p })));
  const [boards, setBoards] = useState(() => initial.current?.boards ?? []);
  const [selectedBoardId, setSelectedBoardId] = useState(null);
  const [activeFace, setActiveFace] = useState('top');
  const [selectedId, setSelectedId] = useState('foot-1');
  const [notification, setNotification] = useState(null);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState(null);
  const [computing, setComputing] = useState(true);
  const fileRef = useRef(null);
  const preset = getPreset(settings.enclosure);
  const pcbIssues = useMemo(() => checkPCBLayout(boards, preset, settings, getFastenerLayout(preset, settings)), [boards, preset, settings]);
  const issues = useMemo(() => [...layoutIssues(parts, settings), ...assemblyIssues(settings), ...pcbIssues], [parts, settings, pcbIssues]);
  const selected = parts.find(p => p.id === selectedId) ?? null;
  const selectedBoard = boards.find(b => b.id === selectedBoardId) ?? null;
  const selectPart = id => { setSelectedId(id); setSelectedBoardId(null); };
  const selectBoard = id => { setSelectedId(null); setSelectedBoardId(id); setActiveFace('top'); };
  const onFace = (face, preserveSelection = false) => {
    setActiveFace(face);
    if (!preserveSelection) { setSelectedId(null); setSelectedBoardId(null); }
  };
  const notify = (text, tone = 'info') => setNotification({ text, tone });

  // Keep edit operations entirely local; no project data goes to a server.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, settings, parts, boards })); }
    catch { /* Browser may disallow local storage; JSON export still works. */ }
  }, [settings, parts, boards]);

  const modelKey = useMemo(() => JSON.stringify({
    enclosure: settings.enclosure, closure: settings.closure,
    wall: settings.wall, lidThickness: settings.lidThickness,
    magnetDiameter: settings.magnetDiameter, magnetDepth: settings.magnetDepth,
    magnetTolerance: settings.magnetTolerance, parts,
  }), [settings, parts]);
  useEffect(() => {
    let canceled = false;
    setComputing(true);
    const timeout = setTimeout(() => {
      let shell = null; let lid = null;
      try {
        shell = buildShell(preset, settings, parts);
        lid = buildLid(preset, settings);
        if (canceled) {
          shell.geometry.dispose(); lid.geometry.dispose();
        } else {
          setModel({ shell, lid, key: modelKey, error: null });
          setComputing(false);
        }
      } catch (e) {
        if (shell) shell.geometry.dispose();
        if (lid) lid.geometry.dispose();
        if (!canceled) {
          setModel({ key: modelKey, shell: null, lid: null, error: e.message });
          setComputing(false);
        }
      }
    }, 180);
    return () => { canceled = true; clearTimeout(timeout); };
  // modelKey deliberately excludes rendering-only display preferences.
  }, [modelKey]);
  useEffect(() => () => {
    model?.shell?.geometry.dispose();
    model?.lid?.geometry.dispose();
  }, [model]);

  const updatePart = (id, patch) => setParts(list => list.map(p => p.id === id ? { ...p, ...patch } : p));
  const updateBoard = (id, patch) => setBoards(list => list.map(b => b.id === id ? { ...b, ...patch } : b));
  const dragBoard = (id, patch) => setBoards(list => list.map(b => b.id === id ? movePCB({...b, ...patch}, patch.x ?? b.x, patch.z ?? b.z, preset, settings) : b));
  const addBoard = () => {
    if (boards.length >= 10) { notify('PCB는 최대 10장까지 추가할 수 있습니다.', 'error'); return; }
    const next = makePCB(preset, settings, boards.length, idGen());
    setBoards(list => [...list, next]);
    selectBoard(next.id);
    setSettings(s => ({ ...s, xray: true }));
    notify('PCB를 추가했습니다. 2D 도면에서 배치하세요.');
  };
  const removeBoard = id => {
    setBoards(list => list.filter(b => b.id !== id));
    setSelectedBoardId(null);
    notify('PCB를 삭제했습니다.');
  };
  const setKnobPreset = count => {
    const result = applyKnobPreset(count, parts, settings);
    if (result.error) { notify(result.error, 'error'); return; }
    setParts(result.parts);
    setSelectedId(result.parts.find(p => p.type === 'potentiometer' && p.face === 'top')?.id ?? null);
    setSelectedBoardId(null);
    setActiveFace('top');
    notify(count + '노브 프리셋을 적용했습니다.');
  };
  const addPart = (type) => {
    const meta = COMPONENTS[type];
    const newPart = findOpenSpot({ id: idGen(), type, face: activeFace, u: 0, v: 0, hole: meta.hole, keepout: meta.keepout }, parts, settings);
    setParts(list => [...list, newPart]);
    selectPart(newPart.id);
    notify(`${meta.label} 추가됨 · ${FACE_LABELS[activeFace]}`);
  };
  const deletePart = (id) => {
    setParts(list => list.filter(p => p.id !== id));
    setSelectedId(null);
    notify('부품이 삭제되었습니다.');
  };
  const duplicatePart = (id) => {
    const original = parts.find(p => p.id === id);
    if (!original) return;
    const dup = findOpenSpot({ ...original, id: idGen(), u: original.u + original.keepout, v: original.v + 10 }, parts, settings);
    setParts(list => [...list, dup]);
    selectPart(dup.id);
    notify('부품을 복제했습니다.');
  };
  const autoSpace = (axis) => {
    const result = distribute(parts, activeFace, axis, settings);
    if (result.error) { notify(result.error, 'error'); return; }
    setParts(result.parts);
    notify(`${FACE_LABELS[activeFace]} · ${axis === 'u' ? '가로' : '세로'} 균등 간격 ${mm(result.gap)}`);
  };
  const projectJson = () => JSON.stringify({ format: 'pedalform-enclosure', version: 2, settings, parts, boards }, null, 2);
  const saveJson = () => {
    downloadBlob(new Blob([projectJson()], { type: 'application/json;charset=utf-8' }), `pedalform_${settings.enclosure}_layout.json`);
    notify('프로젝트 JSON을 다운로드했습니다.');
  };
  const loadJson = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const json = sanitizeProject(JSON.parse(await file.text()));
      setSettings(json.settings); setParts(json.parts); setBoards(json.boards); setActiveFace('top'); setSelectedId(null); setSelectedBoardId(null);
      notify('프로젝트를 불러왔습니다.');
    } catch {
      notify('프로젝트 파일을 읽지 못했습니다. JSON 형식을 확인하세요.', 'error');
    }
    event.target.value = '';
  };
  const reset = () => {
    if (!window.confirm('현재 프로젝트를 초기화할까요? 로컬 저장 내용도 덮어써집니다.')) return;
    setSettings({ ...DEFAULT_SETTINGS });
    setParts(DEFAULT_PARTS.map(p => ({ ...p })));
    setBoards([]); setSelectedBoardId(null);
    setActiveFace('top'); setSelectedId('foot-1');
    notify('기본 설계를 복원했습니다.');
  };
  const exportAll = () => {
    if (issues.length) {
      notify(`간섭/벽 간격 오류 ${issues.length}개를 먼저 수정해 주세요.`, 'error'); return;
    }
    setBusy(true);
    notify('STL 파일을 생성하고 있습니다.');
    // Allow the pending/loading state to paint before the expensive CSG work.
    window.setTimeout(() => {
      let shell = null; let lid = null;
      try {
        shell = buildShell(preset, settings, parts);
        lid = buildLid(preset, settings);
        modelToSTL(shell, lid, settings.closure, `pedalform_${settings.enclosure}`, settings.lidThickness);
        notify('본체·하판' + (settings.closure === 'screw' ? '·나사 4개' : '') + ' STL을 ZIP으로 다운로드했습니다.', 'success');
      } catch (e) {
        notify(`STL 내보내기 오류: ${e.message}`, 'error');
      } finally {
        shell?.geometry.dispose(); lid?.geometry.dispose(); setBusy(false);
      }
    }, 50);
  };
  const currentParts = parts.filter(p => p.face === activeFace);
  useEffect(() => {
    const onKey = e => {
      if ((!selectedId && !selectedBoardId) || e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target?.isContentEditable) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selectedBoardId) removeBoard(selectedBoardId);
        else deletePart(selectedId);
        return;
      }
      const direction = { ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0] }[e.key];
      if (!direction) return;
      e.preventDefault();
      if (selectedBoardId) {
        const board = boards.find(b => b.id === selectedBoardId);
        if (!board) return;
        const delta = e.shiftKey ? 5 : 0.5;
        dragBoard(board.id, { x: board.x + direction[0]*delta, z: board.z + direction[1]*delta });
        return;
      }
      const part = parts.find(p => p.id === selectedId);
      if (!part) return;
      const delta = e.shiftKey ? 5 : 0.5;
      const moved = moveWithSnap(part, part.u + direction[0]*delta, part.v + direction[1]*delta, parts, settings, true);
      updatePart(selectedId, { u:moved.u, v:moved.v });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, selectedBoardId, settings, parts, boards]);

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-logo"><Box size={21} strokeWidth={2.2} /></div><div className="brand-word">PEDAL<span>FORM</span><small>ENCLOSURE STUDIO</small></div></div>
      <div className="project-title"><span className="project-status-dot" /><span>UNTITLED ENCLOSURE</span><span className="project-separator">/</span><b>{settings.enclosure}</b><span className="beta-badge">BETA</span></div>
      <div className="header-actions">
        <input type="file" ref={fileRef} accept=".json,application/json" onChange={loadJson} hidden />
        <button className="top-btn subtle" onClick={reset} title="초기화"><RotateCcw size={16} /> <span>초기화</span></button>
        <button className="top-btn subtle" onClick={() => fileRef.current?.click()} title="프로젝트 불러오기"><Upload size={16} /> <span>불러오기</span></button>
        <button className="top-btn subtle" onClick={saveJson} title="프로젝트 저장"><Save size={16} /> <span>설계 저장</span></button>
        <button className="top-btn primary" disabled={busy || issues.length > 0} onClick={exportAll} title={issues.length ? '간섭 오류 해결 후 사용 가능' : 'STL ZIP 내보내기'}>
          <Download size={17} /> {busy ? '생성 중...' : 'STL 다운로드'}
        </button>
      </div>
    </header>

    <div className="app-layout">
      <Sidebar settings={settings} setSettings={setSettings} face={activeFace} onAdd={addPart} parts={parts} boards={boards} selectedBoardId={selectedBoardId} onSelectBoard={selectBoard} onAddBoard={addBoard} onRemoveBoard={removeBoard} onPreset={setKnobPreset} />
      <main className="workbench">
        <div className="workbench-title"><div><div className="section-eyebrow">WORKSPACE / DESIGNER</div><h1>이펙터 케이스 설계<span className="heading-mark">.</span></h1><p>부품·PCB 배치, 노브 프리셋, 홀 가공, STL까지 한 화면에서.</p></div><div className="workbench-stat"><span><Layers3 size={15} /> 5 SURFACES</span><b>{parts.length.toString().padStart(2, '0')} <small>COMPONENTS</small></b></div></div>
        <div className="design-panels">
          <section className="drawing-panel">
            <div className="panel-top"><div><span className="panel-index">A / 2D EDITOR</span><h2>홀 위치 편집</h2></div><div className="panel-top-icon"><BoxSelect size={18} /></div></div>
            <div className="face-tabs">
              {FACES.map(f => <button key={f.id} onClick={() => onFace(f.id)} className={activeFace === f.id ? 'active' : ''}><span>{f.number}</span>{f.label}<b className={issues.some(i => parts.some(p => p.id === i.id && p.face === f.id)) ? 'has-issue' : ''}>{parts.filter(p => p.face === f.id).length}</b></button>)}
            </div>
            <div className="editor-tools"><span className="tool-label">AUTO LAYOUT</span><button onClick={() => autoSpace('u')} title="간섭 영역 기준 가로 균등 배치"><MoveHorizontal size={16} /> 가로 균등</button><button onClick={() => autoSpace('v')} title="간섭 영역 기준 세로 균등 배치"><MoveVertical size={16} /> 세로 균등</button>
              <button className={`guides-toggle ${settings.showDimensions ? 'active' : ''}`} onClick={() => setSettings(s => ({ ...s, showDimensions: !s.showDimensions }))} title="거리 가이드 표시 전환">{settings.showDimensions ? <Eye size={16} /> : <EyeOff size={16} />}</button>
            </div>
            <FaceDiagram settings={settings} parts={parts} face={activeFace} selectedId={selectedId} onSelect={selectPart} onMove={updatePart} showGuides={settings.showDimensions} boards={boards} selectedBoardId={selectedBoardId} onBoardSelect={selectBoard} onBoardMove={dragBoard} />
            <div className="panel-footnote"><span>{FACE_LABELS[activeFace]} / {currentParts.length}개 부품</span><span className="mono">{faceSize(settings.enclosure, activeFace).width.toFixed(1)} × {faceSize(settings.enclosure, activeFace).height.toFixed(1)} mm</span></div>
          </section>
          <section className="model-panel">
            <div className="panel-top"><div><span className="panel-index">B / 3D PREVIEW</span><h2>실시간 3D 모델</h2></div><div className="panel-top-icon"><Box size={18} /></div></div>
            <div className="model-toolbar"><button onClick={() => setSettings(s => ({ ...s, showLid: !s.showLid }))} className={settings.showLid ? 'active' : ''}>{settings.showLid ? <Eye size={15} /> : <EyeOff size={15} />} 하판</button><button disabled={!settings.showLid} onClick={() => setSettings(s => ({ ...s, exploded: !s.exploded }))} className={settings.exploded ? 'active' : ''}><Layers3 size={15} /> 분해도</button><button onClick={() => setSettings(s => ({ ...s, xray: !s.xray }))} className={settings.xray ? 'active' : ''}><Eye size={15} /> 내부 보기</button><div className="model-toolbar-hint">ORBIT / ZOOM</div></div>
            <ModelPreview model={model} computing={computing || model?.key !== modelKey} settings={settings} preset={preset} parts={parts} selectedId={selectedId} onSelect={selectPart} onFace={onFace} boards={boards} selectedBoardId={selectedBoardId} onBoardSelect={selectBoard} />
            <div className="panel-footnote"><span>CSG / 실제 관통 홀 반영</span><span className="mono">MM · STL READY</span></div>
          </section>
        </div>
        <div className="bottom-cards">
          <div className="info-card"><div className="info-card-icon"><Settings2 size={18} /></div><div><span>PRINT PARAMETERS</span><strong>기본 출력 설정</strong><div className="parameter-inputs"><NumberField label="벽 두께" value={settings.wall} min={2} max={5} onCommit={wall => setSettings(s => ({ ...s, wall }))} /><NumberField label="하판 두께" value={settings.lidThickness} min={2.6} max={6} onCommit={lidThickness => setSettings(s => ({ ...s, lidThickness }))} /></div></div></div>
          <div className="info-card"><div className="info-card-icon"><Ruler size={18} /></div><div><span>SAFE SPACING</span><strong>간격 기준</strong><div className="parameter-inputs"><NumberField label="벽 여유" value={settings.edgeClearance} min={1.5} max={10} onCommit={edgeClearance => setSettings(s => ({ ...s, edgeClearance }))} /><NumberField label="부품 간격" value={settings.partGap} min={0} max={10} onCommit={partGap => setSettings(s => ({ ...s, partGap }))} /></div></div></div>
          <div className={`info-card validation-card ${issues.length ? 'warn' : 'pass'}`}><div className="info-card-icon">{issues.length ? <AlertTriangle size={18} /> : <CircleCheck size={18} />}</div><div><span>DESIGN VALIDATION</span><strong>{issues.length ? `${issues.length}개 간섭 확인 필요` : '배치 검증 통과'}</strong><p>{issues.length ? issues[0].error : '부품 간섭 영역과 벽 여유를 확인했습니다.'}</p></div></div>
        </div>
        <div className="engineering-notes"><Info size={15}/><span>슬림 M3 기둥은 하몬드 도면의 <b>평면 내경 및 코너 여유를 참고해 설계</b>했습니다. 전체 내부 높이·내벽 구배와 제조사 제품의 기계적 호환성을 검증한 것은 아닙니다. 특히 3D 프린트 M3 나사는 강도가 낮을 수 있어 테스트 출력 후 금속 M3 나사 사용도 고려하세요.</span></div>
        {notification && <div className={`toast ${notification.tone}`} role="status"><span>{notification.tone === 'error' ? <AlertTriangle size={17}/> : <CircleCheck size={17}/>}</span>{notification.text}<button onClick={() => setNotification(null)} aria-label="알림 닫기"><X size={15}/></button></div>}
      </main>
      {selectedBoard ? <PCBInspector board={selectedBoard} boards={boards} settings={settings} preset={preset} onUpdate={updateBoard} onDelete={removeBoard} issueCount={issues.length} /> :
        <Inspector selected={selected} parts={parts} settings={settings} onUpdate={updatePart} onDuplicate={duplicatePart} onDelete={deletePart} issueCount={issues.length} />}
    </div>
    <footer className="footer"><span>© PEDALFORM · 3D PRINTABLE ENCLOSURE DESIGN</span><span>LOCAL-FIRST <b>·</b> MILLIMETERS <b>·</b> BROWSER-BASED</span><span>V 0.3 / PCB + WEBBED POSTS</span></footer>
  </div>;
}
