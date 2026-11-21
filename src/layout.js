import { getPreset } from './presets.js';
import { interiorCompliance } from './fasteners.js';

export const mm = value => `${Number(value).toFixed(1)} mm`;
export const round1 = n => Math.round(n * 10) / 10;
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

export function faceSize(enclosure, face) {
  const { w, l, h, radius } = typeof enclosure === 'string' ? getPreset(enclosure) : enclosure;
  if (face === 'top') return { width: w, height: l, radius };
  if (face === 'front' || face === 'back') return { width: w, height: h, radius: 2 };
  return { width: l, height: h, radius: 2 };
}

export function safePosition(part, settings) {
  const dim = faceSize(settings.enclosure, part.face);
  const r = part.keepout / 2;
  const maxU = Math.max(0, dim.width / 2 - settings.edgeClearance - r);
  const maxV = Math.max(0, dim.height / 2 - settings.edgeClearance - r);
  return { ...part, u: round1(clamp(part.u, -maxU, maxU)), v: round1(clamp(part.v, -maxV, maxV)) };
}

export function moveWithSnap(part, rawU, rawV, parts, settings, disableSnap = false) {
  const dim = faceSize(settings.enclosure, part.face);
  const r = part.keepout / 2;
  const uMax = Math.max(0, dim.width / 2 - settings.edgeClearance - r);
  const vMax = Math.max(0, dim.height / 2 - settings.edgeClearance - r);
  let u = clamp(rawU, -uMax, uMax);
  let v = clamp(rawV, -vMax, vMax);
  let snappedU = null;
  let snappedV = null;
  if (!disableSnap) {
    const same = parts.filter(p => p.face === part.face && p.id !== part.id);
    const snap = (value, candidates) => {
      const target = candidates.reduce((best, c) => Math.abs(c - value) < Math.abs(best - value) ? c : best, Infinity);
      return Math.abs(target - value) <= 1.8 ? target : null;
    };
    snappedU = snap(u, [0, ...same.map(p => p.u), -uMax, uMax]);
    snappedV = snap(v, [0, ...same.map(p => p.v), -vMax, vMax]);
    if (snappedU !== null) u = snappedU;
    if (snappedV !== null) v = snappedV;
  }
  return { u: round1(u), v: round1(v), snappedU, snappedV };
}

export function issueForPart(part, parts, settings) {
  const d = faceSize(settings.enclosure, part.face);
  const r = part.keepout / 2;
  const edge = settings.edgeClearance;
  if (part.keepout < part.hole) return '부품 간섭 지름이 홀 지름보다 작습니다.';
  if (part.hole <= 0 || part.keepout <= 0) return '지름은 0보다 커야 합니다.';
  if (d.width / 2 - Math.abs(part.u) - r < edge - 0.01 || d.height / 2 - Math.abs(part.v) - r < edge - 0.01) {
    return `벽과 ${mm(edge)} 이상 떨어뜨려 주세요.`;
  }
  // The top's rounded X/Z corners also need clearance; checking the four
  // bounding-box edges alone would miss a circle that clips a corner arc.
  if (part.face === 'top') {
    const qx = Math.abs(part.u) - (d.width / 2 - d.radius);
    const qy = Math.abs(part.v) - (d.height / 2 - d.radius);
    const signedDistance = Math.hypot(Math.max(0, qx), Math.max(0, qy)) + Math.min(Math.max(qx, qy), 0) - d.radius;
    if (-signedDistance < r + edge - 0.01) {
      return `라운드 모서리와 ${mm(edge)} 이상 떨어뜨려 주세요.`;
    }
  }
  const conflict = parts.find(p => p.face === part.face && p.id !== part.id &&
    Math.hypot(p.u - part.u, p.v - part.v) < (p.keepout + part.keepout) / 2 + settings.partGap - 0.01);
  if (conflict) return `다른 부품과 필요한 간격 ${mm(settings.partGap)}이 부족합니다.`;
  return null;
}

export function layoutIssues(parts, settings) {
  return parts.map(p => ({ id: p.id, error: issueForPart(p, parts, settings) })).filter(x => x.error);
}

export function edgeDistances(part, settings) {
  const d = faceSize(settings.enclosure, part.face);
  const r = part.keepout / 2;
  return {
    left: round1(d.width / 2 + part.u - r),
    right: round1(d.width / 2 - part.u - r),
    top: round1(d.height / 2 + part.v - r),
    bottom: round1(d.height / 2 - part.v - r),
  };
}

export function nearestNeighbor(part, parts) {
  let best = null;
  for (const p of parts) {
    if (part.id === p.id || part.face !== p.face) continue;
    const dist = Math.hypot(p.u - part.u, p.v - part.v);
    const gap = dist - (p.keepout + part.keepout) / 2;
    if (!best || gap < best.gap) best = { part: p, dist, gap: round1(gap) };
  }
  return best;
}

// Spacing is based on the actual keepout diameters, not merely on hole centres.
export function distribute(parts, face, axis, settings) {
  const target = parts.filter(p => p.face === face).sort((a, b) => a[axis] - b[axis]);
  if (target.length < 2) return { parts, error: '해당 면에 부품이 2개 이상 있어야 합니다.' };
  const d = faceSize(settings.enclosure, face);
  const size = axis === 'u' ? d.width : d.height;
  const total = target.reduce((sum, p) => sum + p.keepout, 0);
  const free = size - settings.edgeClearance * 2 - total;
  const gap = free / (target.length + 1);
  if (gap < settings.partGap) {
    return { parts, error: `이 면에는 필요한 간격이 없습니다. 홀 또는 간섭 지름을 줄여 주세요.` };
  }
  let cursor = -size / 2 + settings.edgeClearance + gap;
  const changed = new Map();
  target.forEach(p => {
    changed.set(p.id, round1(cursor + p.keepout / 2));
    cursor += p.keepout + gap;
  });
  return { parts: parts.map(p => changed.has(p.id) ? { ...p, [axis]: changed.get(p.id) } : p), gap: round1(gap) };
}

export function findOpenSpot(newPart, parts, settings) {
  const d = faceSize(settings.enclosure, newPart.face);
  const candidates = [{ u: 0, v: 0 }];
  // Scan from centre toward the outside, with fine enough increments for small cases.
  for (let radius = 7; radius < Math.max(d.width, d.height); radius += 6) {
    for (let i = 0; i < 16; i++) {
      const theta = 2 * Math.PI * i / 16;
      candidates.push({ u: radius * Math.cos(theta), v: radius * Math.sin(theta) });
    }
  }
  for (const c of candidates) {
    const next = safePosition({ ...newPart, ...c }, settings);
    if (!issueForPart(next, [...parts, next], settings)) return next;
  }
  return safePosition(newPart, settings);
}

// Each part is defined in the selected face's own (u,v) editor space.
// Its cutter can be projected onto the shell by a single canonical transform.
export function partWorld(part, preset, wall, offset = 0) {
  const { w, l, h } = preset;
  switch (part.face) {
    case 'top': return { position: [part.u, h - wall / 2 + offset, part.v], rotation: [0, 0, 0] };
    case 'front': return { position: [part.u, h / 2 - part.v, l / 2 - wall / 2 + offset], rotation: [Math.PI / 2, 0, 0] };
    case 'back': return { position: [part.u, h / 2 - part.v, -l / 2 + wall / 2 - offset], rotation: [Math.PI / 2, 0, 0] };
    case 'left': return { position: [-w / 2 + wall / 2 - offset, h / 2 - part.v, part.u], rotation: [0, 0, Math.PI / 2] };
    case 'right': return { position: [w / 2 - wall / 2 + offset, h / 2 - part.v, part.u], rotation: [0, 0, Math.PI / 2] };
    default: throw new Error(`Unknown face: ${part.face}`);
  }
}

export function assemblyIssues(settings) {
  const errors = [];
  const fit = interiorCompliance(getPreset(settings.enclosure), settings);
  if (fit.measured && !fit.passes) {
    errors.push({ id: 'inside-size', error: `하몬드 기준 평면 내경(${mm(fit.targetWidth)} × ${mm(fit.targetLength)})이 부족합니다. 벽 두께를 줄여 주세요.` });
  }
  if (settings.closure === 'magnet' && settings.magnetDepth + 0.2 > settings.lidThickness - 0.8) {
    errors.push({ id: 'lid-pocket-floor', error: '자석 포켓 아래 최소 0.8 mm 두께가 필요합니다.' });
  }
  return errors;
}
