import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ENCLOSURES, DEFAULT_PARTS, DEFAULT_SETTINGS } from '../src/presets.js';
import { partWorld, layoutIssues } from '../src/layout.js';
import { JACK_VARIANTS, jackVariant, setJackVariant } from '../src/jackVariants.js';
import { makePartReference } from '../src/partModels.js';
import { CAD_CATALOG } from '../src/externalCad.js';

const preset = ENCLOSURES['1590B'];
const wall = DEFAULT_SETTINGS.wall;
const directions = {
  top: [0,1,0], front: [0,0,1], back: [0,0,-1], left: [-1,0,0], right: [1,0,0],
};
test('hole cutter and real hardware local Y axes face outward on all sides', () => {
  for (const [face, expected] of Object.entries(directions)) {
    const {rotation} = partWorld({face, u:0, v:0}, preset, wall);
    const normal = new THREE.Vector3(0,1,0).applyEuler(new THREE.Euler(...rotation));
    expected.forEach((coordinate,i) => assert.ok(Math.abs(normal.getComponent(i)-coordinate)<1e-7,face));
  }
});
test('no invented or primitive component models are rendered', () => {
  for (const type of ['potentiometer','audioJack','footswitch','toggle','dcJack']) {
    assert.equal(makePartReference({type,face:'top',u:0,v:0},preset,wall),null,type);
  }
});
test('the only built-in model comes from KiCad LED CAD triangles', () => {
  const led = makePartReference({type:'led',face:'top',u:0,v:0},preset,wall);
  assert.ok(led.children.length >= 8);
  assert.ok(led.children.every(child => child.isMesh && child.geometry.index?.count > 0));
  led.traverse(node => { if(node.isMesh){node.geometry.dispose();node.material.dispose();} });
});
test('the 16mm RV16 potentiometer points to a STEP source, not a 9mm substitute', () => {
  const pot = CAD_CATALOG.potentiometer[0];
  assert.match(pot.label,/RV16AF-41-15R1/);
  assert.ok(pot.url.endsWith('th-potentiometer-rv16af-41-15r1.step'));
  assert.match(pot.name,/\.step$/);
});
test('jack kinds retain distinct hole parameters but provide no fake 3D models', () => {
  assert.equal(Object.keys(JACK_VARIANTS).length,2);
  const base={id:'jack',type:'audioJack',face:'left',u:0,v:0};
  const box=setJackVariant(base,'box');
  const turtle=setJackVariant(base,'turtle');
  assert.equal(jackVariant(box).id,'box');
  assert.equal(jackVariant(turtle).id,'turtle');
  assert.ok(turtle.hole>box.hole);
  assert.equal(makePartReference(box,preset,wall),null);
  assert.equal(makePartReference(turtle,preset,wall),null);
});
test('default layout still satisfies placement spacing rules', () => {
  assert.deepEqual(layoutIssues(DEFAULT_PARTS,DEFAULT_SETTINGS),[]);
});
