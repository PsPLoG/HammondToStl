import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PARTS, DEFAULT_SETTINGS } from '../src/presets.js';
import { applyKnobPreset } from '../src/knobPresets.js';
import { layoutIssues } from '../src/layout.js';

test('all six knob counts generate valid spaced templates for 1590B', () => {
  for (let count=1;count<=6;count++) {
    const result=applyKnobPreset(count,DEFAULT_PARTS,DEFAULT_SETTINGS);
    assert.equal(result.error,undefined,count + ' knobs: ' + result.error);
    const pots=result.parts.filter(p=>p.face==='top'&&p.type==='potentiometer');
    assert.equal(pots.length,count);
    assert.deepEqual(layoutIssues(result.parts,DEFAULT_SETTINGS),[]);
  }
});
test('knob preset preserves other components and does not accumulate knobs', () => {
  const a=applyKnobPreset(6,DEFAULT_PARTS,DEFAULT_SETTINGS);
  const b=applyKnobPreset(2,a.parts,DEFAULT_SETTINGS);
  assert.equal(b.parts.filter(p=>p.face==='top'&&p.type==='potentiometer').length,2);
  const originalOthers=DEFAULT_PARTS.filter(p=>p.type!=='potentiometer');
  for (const other of originalOthers) assert.ok(b.parts.some(x=>x.id===other.id));
});
test('unfittable templates never mutate existing layout', () => {
  const settings={...DEFAULT_SETTINGS,enclosure:'1590A'};
  const a=applyKnobPreset(6,DEFAULT_PARTS,settings);
  assert.ok(a.error);
  assert.equal(a.parts,DEFAULT_PARTS);
});
