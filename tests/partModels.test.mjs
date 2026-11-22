import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ENCLOSURES, DEFAULT_PARTS, DEFAULT_SETTINGS } from '../src/presets.js';
import { partWorld, layoutIssues } from '../src/layout.js';
import { JACK_VARIANTS, jackVariant, setJackVariant } from '../src/jackVariants.js';
import { makePartReference } from '../src/partModels.js';
import { CAD_CATALOG, makeMountedCadPart } from '../src/externalCad.js';

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
  assert.equal(Object.keys(JACK_VARIANTS).length,4);
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

test('both third-party jack models have direct public CAD sources and distinct variants', () => {
  const box = CAD_CATALOG.audioJack.find(item=>item.id==='amphenol-acjs-mhom');
  const turtle = CAD_CATALOG.audioJack.find(item=>item.id==='hooya-pj609ba');
  assert.equal(box.jackType, 'box-amphenol');
  assert.equal(turtle.jackType, 'turtle-pj609ba');
  assert.ok(box.url.endsWith('/ACJS-MHOM.stp'));
  assert.ok(turtle.url.endsWith('/jack_6.35mm_female.wrl'));
  assert.equal(turtle.axis, '+y');
  assert.equal(DEFAULT_PARTS.find(p=>p.id==='audio-1').jackType, 'box-amphenol');
  assert.equal(DEFAULT_PARTS.find(p=>p.id==='audio-2').jackType, 'turtle-pj609ba');
});

test('Alpha RV16 shaft origin aligns with drilled hole, not asymmetric full CAD bounds', () => {
  const spec = CAD_CATALOG.potentiometer.find(item => item.id === 'alpha-rv16af-41-15r1');
  assert.deepEqual(spec.mountPoint, [0,0,9.1]);
  const group = new THREE.Group();
  // Representative measured CAD extents: X -8.24..10, Y -5.6..16.25,
  // Z -6.5..24.1, intentionally not centred on the shaft.
  const body = new THREE.Mesh(new THREE.BoxGeometry(18.24,21.85,30.6),new THREE.MeshBasicMaterial());
  body.position.set(.88,5.325,8.8);
  group.add(body);
  for(const face of ['top','left','right','front','back']){
    const part = {id:'pot-test',type:'potentiometer',face,u:7,v:-3};
    const asset={id:spec.id,group,axis:spec.axis,mountPoint:spec.mountPoint,outside:spec.outside,offsetX:0,offsetY:0,offsetZ:0};
    const placed=makeMountedCadPart(part,preset,wall,asset);
    placed.updateMatrixWorld(true);
    const hole=new THREE.Vector3(...partWorld(part,preset,wall,wall/2).position);
    const shaftCenter=new THREE.Vector3(...spec.mountPoint).applyMatrix4(placed.children[0].matrixWorld);
    assert.ok(shaftCenter.distanceTo(hole)<1e-5,face+' shaft needs to meet hole centre');
  }
  body.geometry.dispose();
  body.material.dispose();
});
test('Amphenol jack bushing origin aligns with the side-panel hole', () => {
  const spec=CAD_CATALOG.audioJack.find(item=>item.id==='amphenol-acjs-mhom');
  assert.deepEqual(spec.mountPoint,[0,0,0]);
  assert.equal(spec.outside,8.7);
  const group=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(17.325,23.866,47.1),new THREE.MeshBasicMaterial());
  body.position.set(1.445,-1.376,-14.85);
  group.add(body);
  for(const face of ['left','right']){
    const part={id:'jack-test',type:'audioJack',face,u:11,v:1};
    const asset={id:spec.id,group,axis:spec.axis,mountPoint:spec.mountPoint,outside:spec.outside,offsetX:0,offsetY:0,offsetZ:0};
    const placed=makeMountedCadPart(part,preset,wall,asset);
    placed.updateMatrixWorld(true);
    const target=new THREE.Vector3(...partWorld(part,preset,wall,wall/2).position);
    const holeAxis=new THREE.Vector3(...spec.mountPoint).applyMatrix4(placed.children[0].matrixWorld);
    assert.ok(holeAxis.distanceTo(target)<1e-5,face+' bushing origin must meet panel hole');
  }
  body.geometry.dispose();
  body.material.dispose();
});
