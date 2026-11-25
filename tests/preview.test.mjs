import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { previewAssemblyTransform } from '../src/previewTransforms.js';
import { ENCLOSURES, DEFAULT_SETTINGS } from '../src/presets.js';

function scenePoint(height, flipped, y) {
  const transform=previewAssemblyTransform(height, flipped);
  const pivot=new THREE.Group();
  pivot.position.set(...transform.pivot);
  pivot.rotation.set(...transform.rotation);
  const origin=new THREE.Group();
  origin.position.set(...transform.origin);
  pivot.add(origin);
  pivot.updateMatrixWorld(true);
  return new THREE.Vector3(0,y,0).applyMatrix4(origin.matrixWorld);
}

test('normal preview keeps lid below the enclosure', () => {
  const h=ENCLOSURES['1590B'].h;
  const bottomLidY=-DEFAULT_SETTINGS.lidThickness;
  assert.ok(Math.abs(scenePoint(h,false,0).y)<1e-8);
  assert.ok(Math.abs(scenePoint(h,false,h).y-h)<1e-8);
  assert.ok(scenePoint(h,false,bottomLidY).y<0);
});

test('flipped preview moves the bottom plate above the body and reverses its face', () => {
  for (const preset of Object.values(ENCLOSURES)) {
    const h=preset.h;
    assert.ok(Math.abs(scenePoint(h,true,0).y-h)<1e-8);
    assert.ok(Math.abs(scenePoint(h,true,h).y)<1e-8);
    assert.ok(scenePoint(h,true,-DEFAULT_SETTINGS.lidThickness).y>h);
    // The existing exploded lid uses a negative local Y offset.
    assert.ok(scenePoint(h,true,-14).y>h);
    const yDirection=scenePoint(h,true,1).sub(scenePoint(h,true,0));
    assert.ok(Math.abs(yDirection.y+1)<1e-8);
  }
});

test('the preview flip setting is disabled by default and does not change modeling dimensions', () => {
  assert.equal(DEFAULT_SETTINGS.flipPreview,false);
  const h=ENCLOSURES['1590B'].h;
  for(const mode of [false,true]){
    const distance=scenePoint(h,mode,h).distanceTo(scenePoint(h,mode,0));
    assert.ok(Math.abs(distance-h)<1e-8);
  }
});
