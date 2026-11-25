import test from 'node:test';
import assert from 'node:assert/strict';
import { ENCLOSURES } from '../src/presets.js';
import { faceScreenPoint, faceModelPoint, faceScreenClearances, lidDatumHeight, lidDatumScreenY } from '../src/faceReference.js';
import { faceSize, partWorld } from '../src/layout.js';

test('the 2D hole centres and image/guide points are mirrored exactly with the flipped 3D assembly', () => {
  for(const face of ['top','front','back','left','right']){
    const [u,v]=[8.5,-4.2];
    const shown=faceScreenPoint(face,u,v,true);
    assert.equal(shown.v,4.2,face);
    assert.equal(shown.u,face==='left'||face==='right'?-8.5:8.5,face);
    assert.deepEqual(faceModelPoint(face,shown.u,shown.v,true),{u,v},face);
    assert.deepEqual(faceScreenPoint(face,u,v,false),{u,v},face);
    const a=faceScreenPoint(face,1,2,true),b=faceScreenPoint(face,6,8,true);
    assert.equal(Math.hypot(a.u-b.u,a.v-b.v),Math.hypot(5,6),face);
  }
});
test('selected hole edge guides mirror together with their centres', () => {
  for(const face of ['top','front','back','left','right']){
    const part={face,u:8,v:4,keepout:10};
    const dim=faceSize(ENCLOSURES['1590B'],face);
    const normal=faceScreenClearances(part,dim,false);
    const inverted=faceScreenClearances(part,dim,true);
    assert.equal(inverted.top,normal.bottom,face);
    assert.equal(inverted.bottom,normal.top,face);
    if(['left','right'].includes(face)){
      assert.equal(inverted.left,normal.right,face);
      assert.equal(inverted.right,normal.left,face);
    }else {
      assert.equal(inverted.left,normal.left,face);
      assert.equal(inverted.right,normal.right,face);
    }
  }
});
test('side-panel hole height is measured from the bottom-plate mating plane in either orientation', () => {
  for(const preset of Object.values(ENCLOSURES)){
    for(const face of ['front','back','left','right']){
      const part={face,u:4,v:7};
      const physicalY=partWorld(part,preset,2.4).position[1];
      assert.equal(lidDatumHeight(part,preset),Math.round(physicalY*10)/10);
      const normalY=lidDatumScreenY(face,preset,false);
      const reversedY=lidDatumScreenY(face,preset,true);
      assert.equal(normalY,preset.h/2);
      assert.equal(reversedY,-preset.h/2);
      const shown=faceScreenPoint(face,part.u,part.v,true);
      // The ruler begins at the top edge when the lid is the upper face.
      assert.equal(Math.round((shown.v-reversedY)*10)/10,lidDatumHeight(part,preset));
    }
  }
  assert.equal(lidDatumHeight({face:'top',u:0,v:0},ENCLOSURES['1590B']),null);
});
