import { COMPONENTS } from './presets.js';
import { layoutIssues, round1 } from './layout.js';

// Top-only templates: preserve switches, LEDs, jacks and all non-potentiometers.
const SHAPES = {
  1: [[[0]]],
  2: [[[-0.5,0.5]], [[0],[0]]],
  3: [[[-1,0,1]], [[0],[0],[0]]],
  4: [[[-0.5,0.5],[-0.5,0.5]], [[-1.5,-0.5,0.5,1.5]], [[0],[0],[0],[0]]],
  5: [[[-1,0,1],[-0.5,0.5]], [[-0.5,0.5],[-0.5,0.5],[0]]],
  6: [[[-1,0,1],[-1,0,1]], [[-0.5,0.5],[-0.5,0.5],[-0.5,0.5]], [[0],[0],[0],[0],[0],[0]]],
};

export function applyKnobPreset(count, parts, settings) {
  if (!Number.isInteger(count) || count < 1 || count > 6) {
    return { parts, error: '노브 개수는 1~6개입니다.' };
  }
  const other = parts.filter(p => !(p.type === 'potentiometer' && p.face === 'top'));
  const usedIds = new Set(other.map(p=>p.id));
  const pot = COMPONENTS.potentiometer;
  const existing = parts.filter(p => p.type === 'potentiometer' && p.face === 'top');
  const getId = index => {
    const prior = existing[index]?.id;
    if (prior && !usedIds.has(prior)) { usedIds.add(prior); return prior; }
    let id = 'preset-knob-' + (index+1);
    while (usedIds.has(id)) id += '-x';
    usedIds.add(id);
    return id;
  };
  const ids = Array.from({length: count}, (_,i)=>getId(i));
  const starts = [-40,-38,-42,-36,-44,-34,-32,-30,-28,-26,-24,-22,-20,-18,-16,-14,-12,-10,-8,-6,-4,0,4,8,12,16,20];
  const shiftX = [0,-2,2,-4,4,-6,6];
  for (const shape of SHAPES[count]) {
    for (const firstV of starts) {
      for (const dx of shiftX) {
        let index = 0;
        const pots = shape.flatMap((columns, row) => columns.map(column => ({
          id: ids[index++], type: 'potentiometer', face: 'top',
          u: round1(dx + column * 18.6), v: round1(firstV + row * 20),
          hole: pot.hole, keepout: pot.keepout,
        })));
        const candidate = [...other, ...pots];
        const potIds = new Set(pots.map(p=>p.id));
        if (!layoutIssues(candidate,settings).some(issue => potIds.has(issue.id))) {
          return { parts: candidate, count, layout: shape.length + '행' };
        }
      }
    }
  }
  return { parts, error: '현재 케이스와 다른 부품의 여유 공간에 ' + count + '노브를 배치할 수 없습니다. 큰 케이스를 선택하거나 기존 부품을 이동하세요.' };
}
