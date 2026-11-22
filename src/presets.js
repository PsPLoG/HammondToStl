// w/l are nominal exterior dimensions. h is BODY depth excluding the separate
// 3.2 mm default lid, while assembledH is the nominal assembled reference height.
// Rounded corners, casting drafts and lid overlaps are simplified.
export const ENCLOSURES = {
  '1590A': { code: '1590A', name: 'Mini', w: 38.5, l: 92.6, h: 27.8, assembledH: 31.0, radius: 5.3, fastenerInsetX: 5, fastenerInsetZ: 5, screwBossHeight: 10, insideReference: { width: 33.70, length: 87.80 }, class: '컴팩트' },
  '1590B': { code: '1590B', name: 'Standard', w: 60.5, l: 112.4, h: 27.8, assembledH: 31.0, radius: 6.0, fastenerInsetX: 5, fastenerInsetZ: 5.15, screwBossHeight: 11, insideReference: { width: 55.45, length: 107.05 }, class: '스탠다드' },
  '125B': { code: '125B', name: 'Tall / 1590N1-like', w: 66.4, l: 122.0, h: 36.2, assembledH: 39.4, radius: 6.5, fastenerInsetX: 5, fastenerInsetZ: 5.6, screwBossHeight: 11, class: '톨' },
  '1590BB': { code: '1590BB', name: 'Wide', w: 94.0, l: 119.5, h: 30.8, assembledH: 34.0, radius: 7.5, fastenerInsetX: 5, fastenerInsetZ: 5, screwBossHeight: 11, insideReference: { width: 87.16, length: 112.66 }, class: '와이드' },
};

export const FACES = [
  { id: 'top', label: '상판', number: '01' },
  { id: 'front', label: '전면', number: '02' },
  { id: 'back', label: '후면', number: '03' },
  { id: 'left', label: '좌측', number: '04' },
  { id: 'right', label: '우측', number: '05' },
];

export const COMPONENTS = {
  potentiometer: { label: '포텐셔미터', short: 'POT', hole: 7.5, keepout: 16.0, color: '#b2e76d', glyph: '◉', hint: '일반 6 mm 샤프트 예시' },
  audioJack: { label: '인풋 / 아웃풋 잭', short: 'JACK', hole: 9.6, keepout: 19.0, color: '#a3bcff', glyph: '◍', hint: '6.35 mm 오디오 잭 예시' },
  led: { label: 'LED', short: 'LED', hole: 5.0, keepout: 9.0, color: '#ffd381', glyph: '✳', hint: '5 mm 패널 LED 예시' },
  footswitch: { label: '풋스위치', short: 'FOOT', hole: 12.0, keepout: 25.0, color: '#ffad9b', glyph: '⊕', hint: '3PDT 풋스위치 예시' },
  toggle: { label: '토글 스위치', short: 'TOGGLE', hole: 6.5, keepout: 14.0, color: '#c8b4f9', glyph: '⌁', hint: '미니 토글 예시' },
  dcJack: { label: 'DC 전원 잭', short: 'DC', hole: 12.0, keepout: 19.0, color: '#8cdbd0', glyph: '⏚', hint: '패널 DC 잭 예시' },
};

export const DEFAULT_PARTS = [
  { id: 'pot-1', type: 'potentiometer', face: 'top', u: -15.2, v: -30, hole: 7.5, keepout: 16 },
  { id: 'pot-2', type: 'potentiometer', face: 'top', u: 15.2, v: -30, hole: 7.5, keepout: 16 },
  { id: 'led-1', type: 'led', face: 'top', u: 0, v: -5, hole: 5, keepout: 9 },
  { id: 'foot-1', type: 'footswitch', face: 'top', u: 0, v: 31, hole: 12, keepout: 25 },
  { id: 'audio-1', type: 'audioJack', jackType: 'box', face: 'left', u: 10, v: 0, hole: 9.6, keepout: 19 },
  { id: 'audio-2', type: 'audioJack', jackType: 'box', face: 'right', u: 10, v: 0, hole: 9.6, keepout: 19 },
  { id: 'dc-1', type: 'dcJack', face: 'back', u: 0, v: 0, hole: 12, keepout: 19 },
];

export const DEFAULT_SETTINGS = {
  enclosure: '1590B',
  closure: 'screw',
  wall: 2.4,
  lidThickness: 3.2,
  edgeClearance: 3.0,
  partGap: 2.0,
  magnetDiameter: 5.0,
  magnetDepth: 2.0,
  magnetTolerance: 0.2,
  showLid: true,
  showDimensions: true,
  exploded: true,
  xray: false,
};

export function getPreset(key) {
  return ENCLOSURES[key] ?? ENCLOSURES['1590B'];
}
