import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ENCLOSURES, DEFAULT_PARTS, DEFAULT_SETTINGS } from '../src/presets.js';
import { partWorld, layoutIssues } from '../src/layout.js';
import { JACK_VARIANTS, jackVariant, setJackVariant } from '../src/jackVariants.js';
import { makePartReference } from '../src/partModels.js';

const preset=ENCLOSURES['1590B'];
const wall=DEFAULT_SETTINGS.wall;
const directions={
  top:[0,1,0],front:[0,0,1],back:[0,0,-1],left:[-1,0,0],right:[1,0,0],
};
test('hole cutter and attached hardware face outside on all sides',()=>{
  for(const [face,expected] of Object.entries(directions)){
    const part={id:'reference',type:'audioJack',jackType:'box',face,u:0,v:0,hole:9.6,keepout:19};
    const {rotation}=partWorld(part,preset,wall);
    const outward=new THREE.Vector3(0,1,0).applyEuler(new THREE.Euler(...rotation));
    expected.forEach((coordinate,index)=>assert.ok(Math.abs(outward.getComponent(index)-coordinate)<1e-7,face+' outward axis '+index));
    const model=makePartReference(part,preset,wall);
    model.updateMatrixWorld(true);
    assert.ok(model.children.length>4,face+' hardware missing');
    assert.ok(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).length()>10);
    model.traverse(node=>{if(node.isMesh)node.geometry.dispose()});
  }
});
test('jack kinds have different reference geometry and hole/keepout settings',()=>{
  assert.equal(Object.keys(JACK_VARIANTS).length,2);
  const base={id:'jack-1',type:'audioJack',face:'left',u:0,v:0};
  const box=setJackVariant(base,'box');
  const turtle=setJackVariant(base,'turtle');
  assert.equal(jackVariant(box).id,'box');
  assert.equal(jackVariant(turtle).id,'turtle');
  assert.ok(turtle.hole>box.hole);
  assert.ok(turtle.keepout>box.keepout);
  const a=makePartReference(box,preset,wall);
  const b=makePartReference(turtle,preset,wall);
  assert.notEqual(a.children.length,b.children.length);
  a.traverse(node=>{if(node.isMesh)node.geometry.dispose()});
  b.traverse(node=>{if(node.isMesh)node.geometry.dispose()});
});
test('RV16 reference has a round body, nut, shaft and three lug positions',()=>{
  const part={id:'pot',type:'potentiometer',face:'top',u:0,v:0,hole:7.5,keepout:18};
  const model=makePartReference(part,preset,wall);
  const count=model.children.filter(node=>node.isMesh).length;
  assert.ok(count>=14,'RV16 missing detail');
  const bounds=new THREE.Box3().setFromObject(model);
  assert.ok(bounds.getSize(new THREE.Vector3()).y>25,'shaft/body height missing');
  model.traverse(node=>{if(node.isMesh)node.geometry.dispose()});
});
test('default pedal layout still satisfies basic spacing rules',()=>{
  assert.deepEqual(layoutIssues(DEFAULT_PARTS,DEFAULT_SETTINGS),[]);
});
