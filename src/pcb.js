import { getPreset } from './presets.js';

const min = (n,a,b) => Math.max(a,Math.min(b,n));
const n = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export const PCB_GAP = 0.8;

export function makePCB(preset, settings, index = 0, id = 'pcb-1') {
  return {
    id, name: 'PCB ' + (index + 1),
    width: Math.round(Math.min(40, preset.w - 2 * settings.wall - 8) * 10) / 10,
    length: Math.round(Math.min(60, preset.l - 2 * settings.wall - 16) * 10) / 10,
    thickness: 1.6, x: 0, z: 0, bottomY: 4.5 + index * 5,
  };
}

export function sanitizePCB(value, preset, settings) {
  const v = value || {};
  const maxWidth = Math.max(8, preset.w - 2 * settings.wall - 1.6);
  const maxLength = Math.max(8, preset.l - 2 * settings.wall - 1.6);
  const thickness = min(n(v.thickness, 1.6), 0.8, 4);
  return {
    id: String(v.id || 'pcb'),
    name: String(v.name || 'PCB').slice(0, 48),
    width: min(n(v.width, 30), 8, maxWidth),
    length: min(n(v.length, 40), 8, maxLength),
    thickness,
    x: min(n(v.x, 0), -preset.w, preset.w),
    z: min(n(v.z, 0), -preset.l, preset.l),
    bottomY: min(n(v.bottomY, 4.5), 0, preset.h),
  };
}

// Clamp drag positioning to nominal straight internal walls. Actual rounded
// corner / fastener collision detection is performed by checkPCBLayout.
export function movePCB(board, x, z, preset, settings) {
  const maxX = Math.max(0, preset.w / 2 - settings.wall - PCB_GAP - board.width / 2);
  const maxZ = Math.max(0, preset.l / 2 - settings.wall - PCB_GAP - board.length / 2);
  return {
    ...board,
    // Round inward; nearest-tenth rounding can push an edge past the wall by 0.05mm.
    x: Math.trunc(min(x, -maxX, maxX) * 10) / 10,
    z: Math.trunc(min(z, -maxZ, maxZ) * 10) / 10,
  };
}

function innerOutlineClearance(preset, settings, x, z) {
  const w = preset.w - 2 * settings.wall;
  const l = preset.l - 2 * settings.wall;
  const r = Math.max(0.7, preset.radius - settings.wall);
  const qx = Math.abs(x) - (w / 2 - r);
  const qz = Math.abs(z) - (l / 2 - r);
  return r - (Math.hypot(Math.max(qx,0), Math.max(qz,0)) + Math.min(Math.max(qx,qz),0));
}

function distanceToRect(px,pz,b) {
  const dx = Math.max(Math.abs(px-b.x) - b.width/2, 0);
  const dz = Math.max(Math.abs(pz-b.z) - b.length/2, 0);
  return Math.hypot(dx,dz);
}

export function checkPCBLayout(boards, presetOrKey, settings, mounting) {
  const preset = typeof presetOrKey === 'string' ? getPreset(presetOrKey) : presetOrKey;
  const errors = [];
  const bottomLimit = 1.7; // lid alignment tongues enter the box near the opening
  const topLimit = preset.h - settings.wall - 0.6;
  for (const board of boards) {
    const label = board.name || 'PCB';
    if (board.width < 8 || board.length < 8 || board.thickness < 0.8) {
      errors.push({ id: board.id, error: label + ': 기판 크기/두께를 확인하세요.' });
      continue;
    }
    if (board.bottomY < bottomLimit - 1e-3 || board.bottomY + board.thickness > topLimit + 1e-3) {
      errors.push({ id: board.id, error: label + ': 하판 탭과 상판 안쪽 사이 높이 여유가 부족합니다.' });
    }
    let tooClose = false;
    for (const dx of [-board.width/2, board.width/2]) {
      for (const dz of [-board.length/2, board.length/2]) {
        if (innerOutlineClearance(preset, settings, board.x + dx, board.z + dz) < PCB_GAP - 1e-3) tooClose = true;
      }
    }
    if (tooClose) errors.push({ id: board.id, error: label + ': 라운드 내벽에서 최소 0.8 mm 떨어뜨려 주세요.' });
    if (mounting.centers.some(([px,pz]) => distanceToRect(px,pz,board) < mounting.radius + PCB_GAP - 1e-3)) {
      errors.push({ id: board.id, error: label + ': 코너 체결 기둥과 간섭합니다.' });
    }
  }
  for (let i = 0; i < boards.length; i++) {
    const a = boards[i];
    for (let j = i + 1; j < boards.length; j++) {
      const b = boards[j];
      const overlapX = Math.abs(a.x - b.x) < (a.width+b.width)/2 + PCB_GAP;
      const overlapZ = Math.abs(a.z - b.z) < (a.length+b.length)/2 + PCB_GAP;
      const overlapY = a.bottomY < b.bottomY+b.thickness+PCB_GAP && b.bottomY < a.bottomY+a.thickness+PCB_GAP;
      if (overlapX && overlapZ && overlapY) errors.push({ id: b.id, error: (b.name || 'PCB') + ': 다른 기판과 겹칩니다.' });
    }
  }
  return errors;
}
