import test from 'node:test';
import assert from 'node:assert/strict';
import { ENCLOSURES, DEFAULT_SETTINGS } from '../src/presets.js';
import { getFastenerLayout } from '../src/fasteners.js';
import { makePCB, movePCB, sanitizePCB, checkPCBLayout } from '../src/pcb.js';
const settings = {...DEFAULT_SETTINGS};
const preset = ENCLOSURES['1590B'];
const mounting = getFastenerLayout(preset,settings);

test('default PCB fits available interior and full-height fastener posts', () => {
  for (const p of Object.values(ENCLOSURES)) {
    const board=makePCB(p,settings,0,'a');
    assert.equal(checkPCBLayout([board],p,settings,getFastenerLayout(p,settings)).length,0,p.code);
  }
});
test('PCB drag stays within straight wall boundaries', () => {
  const moved=movePCB(makePCB(preset,settings,0,'a'),200,-200,preset,settings);
  assert.ok(moved.x + moved.width/2 <= preset.w/2-settings.wall-0.8+0.01);
  assert.ok(moved.z - moved.length/2 >= -preset.l/2+settings.wall+0.8-0.01);
});
test('PCB collision catches adjacent corner posts and excessive height', () => {
  const board=makePCB(preset,settings,0,'a');
  const post=mounting.centers[0];
  const nearPost={...board,width:8,length:8,x:post[0],z:post[1]};
  assert.ok(checkPCBLayout([nearPost],preset,settings,mounting).some(x=>x.error.includes('기둥')));
  const tooHigh={...board,bottomY:preset.h-1};
  assert.ok(checkPCBLayout([tooHigh],preset,settings,mounting).some(x=>x.error.includes('높이')));
});
test('PCB validation detects 3D board overlap but allows vertically spaced boards', () => {
  const a=makePCB(preset,settings,0,'a');
  const b={...a,id:'b',name:'PCB 2'};
  assert.ok(checkPCBLayout([a,b],preset,settings,mounting).some(x=>x.error.includes('겹칩니다')));
  assert.equal(checkPCBLayout([a,{...b,bottomY:10}],preset,settings,mounting).length,0);
});
test('invalid imported PCB values are clamped to printable ranges', () => {
  const p=sanitizePCB({id:'bad',name:'Test',width:999,length:-2,thickness:-1,bottomY:999,x:Infinity},preset,settings);
  assert.ok(Number.isFinite(p.x) && p.width < preset.w && p.length >= 8 && p.thickness >= .8 && p.bottomY <= preset.h);
});
