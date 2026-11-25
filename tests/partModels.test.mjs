import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { ENCLOSURES, DEFAULT_PARTS, DEFAULT_SETTINGS } from '../src/presets.js';
import { partWorld, layoutIssues } from '../src/layout.js';
import { JACK_VARIANTS, jackVariant, setJackVariant } from '../src/jackVariants.js';
import { makePartReference } from '../src/partModels.js';
import { CAD_CATALOG, loadCatalogCad, makeMountedCadPart } from '../src/externalCad.js';
import hooyaCad from '../src/cad/hooyaPj609ba.json' with { type: 'json' };

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

test('the box jack is bundled as the complete original 1.8MB STEP rather than an empty file or Git LFS pointer', () => {
  const cad=readFileSync(new URL('../public/cad/amphenol/ACJS-MHOM.stp', import.meta.url),'utf8');
  assert.ok(cad.length>1000000, 'bundled box jack CAD must be complete');
  assert.ok(cad.startsWith('ISO-10303-21;'), 'STEP header missing');
  assert.match(cad,/PRODUCT\('ACJS-MHOM'/);
  assert.ok(cad.trimEnd().endsWith('END-ISO-10303-21;'));
  const item=CAD_CATALOG.audioJack.find(p=>p.id==='amphenol-acjs-mhom');
  assert.equal(item.url,'./cad/amphenol/ACJS-MHOM.stp');
  assert.deepEqual(item.mountPoint,[0,0,0]);
});

test('HOOYA 6-pin jack is bundled with authentic VRML triangles and does not require a network fetch', async () => {
  const src=readFileSync(new URL('../public/cad/hooya/jack_6.35mm_female.wrl', import.meta.url),'utf8');
  assert.ok(src.startsWith('#VRML V2.0 utf8'));
  assert.equal((src.match(/IndexedFaceSet/g)||[]).length, 2);
  assert.equal(hooyaCad.license, 'GPL-3.0');
  assert.equal(hooyaCad.meshes.reduce((total,mesh)=>total + mesh.indices.length/3,0),802);
  const item=CAD_CATALOG.audioJack.find(p=>p.id==='hooya-pj609ba');
  assert.equal(item.url, './cad/hooya/jack_6.35mm_female.wrl');
  const cad=await loadCatalogCad('audioJack','hooya-pj609ba');
  assert.equal(cad.group.children.length,2);
  assert.ok(cad.group.children.every(mesh=>mesh.isMesh && mesh.geometry.index.count>0));
  cad.group.traverse(mesh=>{ if(mesh.isMesh){mesh.geometry.dispose();mesh.material.dispose();} });
});

test('16mm potentiometer is rotated 180 degrees in the panel plane without moving its mounting axis', () => {
  const spec=CAD_CATALOG.potentiometer.find(p=>p.id==='alpha-rv16af-41-15r1');
  assert.equal(spec.panelRotation,180);
  const group=new THREE.Group();
  // Match the verified RV16 CAD maximum Z = 24.1 mm (15 mm outside the mounting point at Z = 9.1).
  // A shorter dummy mesh shifts the CAD's intentional outside correction and makes this test invalid.
  const body=new THREE.Mesh(new THREE.BoxGeometry(14,14,30.6),new THREE.MeshBasicMaterial());
  body.position.z=8.8;
  group.add(body);
  const part={id:'pot-orientation',type:'potentiometer',face:'top',u:8,v:-4};
  const baseAsset={id:spec.id,group,axis:spec.axis,mountPoint:spec.mountPoint,outside:spec.outside,offsetX:0,offsetY:0,offsetZ:0};
  const reference=makeMountedCadPart(part,preset,wall,{...baseAsset,panelRotation:0});
  const rotated=makeMountedCadPart(part,preset,wall,{...baseAsset,panelRotation:spec.panelRotation});
  reference.updateMatrixWorld(true);
  rotated.updateMatrixWorld(true);
  const target=new THREE.Vector3(...partWorld(part,preset,wall,wall/2).position);
  const mount=new THREE.Vector3(...spec.mountPoint);
  for(const model of [reference,rotated]){
    const position=mount.clone().applyMatrix4(model.children[0].matrixWorld);
    assert.ok(position.distanceTo(target)<1e-5,'rotation must keep shaft aligned with drilled hole');
  }
  const sample=mount.clone().add(new THREE.Vector3(5,0,0));
  const v0=sample.clone().applyMatrix4(reference.children[0].matrixWorld).sub(target);
  const v180=sample.clone().applyMatrix4(rotated.children[0].matrixWorld).sub(target);
  assert.ok(v0.clone().add(v180).length()<1e-5,'a 180 degree turn must reverse the terminal direction');
  body.geometry.dispose(); body.material.dispose();
});
