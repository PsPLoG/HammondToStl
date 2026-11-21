import * as THREE from 'three';
import { partWorld } from './layout.js';

// Local reference models. Dimensions are approximate except where noted.
// Axis +Y is outward from the panel; interior is negative Y.
export const PART_BODIES = {
  potentiometer: { width: 17, length: 17, depth: 10.7, label: 'Alpha RV16-type approximation' },
  audioJack: { width: 20.1, length: 15.2, depth: 22.3, label: 'Cliff CL1227G-type approximation' },
  led: { width: 5.8, length: 5.8, depth: 8, label: '5mm LED approximation' },
  footswitch: { width: 19.6, length: 17, depth: 16.7, label: 'Alpha 3PDT housing' },
  toggle: { width: 13, length: 8, depth: 12, label: 'mini toggle approximation' },
  dcJack: { width: 15, length: 14, depth: 18, label: 'panel DC jack approximation' },
};
const materials = {
  metal: new THREE.MeshStandardMaterial({color:'#c5ced2',metalness:0.78,roughness:0.28}),
  plastic: new THREE.MeshStandardMaterial({color:'#242c32',metalness:0.04,roughness:0.68}),
  led: new THREE.MeshStandardMaterial({color:'#ed4c4c',emissive:'#7b1616',roughness:0.2}),
};
function box(group,w,h,d,y,mat) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  mesh.position.y=y;group.add(mesh);
}
function cylinder(group,r,h,y,mat) {
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,24),mat);
  mesh.position.y=y;group.add(mesh);
}
export function makePartReference(part,preset,wall) {
  const spec=PART_BODIES[part.type];
  if(!spec)return null;
  const group=new THREE.Group();
  // Panel outside is at local Y=0, positive is exposed.
  box(group,spec.width,spec.depth,spec.length,-spec.depth/2-0.5,materials.plastic);
  cylinder(group,Math.min(part.hole/2-0.25,5.8),wall+3,(1.5-wall)/2,materials.metal);
  cylinder(group,Math.max(3.2,part.hole/2+1),1.1,0.6,materials.metal);
  if(part.type==='footswitch')cylinder(group,5,5,4,materials.metal);
  if(part.type==='potentiometer')cylinder(group,3,11,6,materials.metal);
  if(part.type==='toggle')cylinder(group,2,10,5.5,materials.metal);
  if(part.type==='led')cylinder(group,2.5,3,2.5,materials.led);
  const placement=partWorld(part,preset,wall,wall/2);
  group.position.set(...placement.position);
  // partWorld rotates cylindrical cutter from Y to face normal.
  group.rotation.set(...placement.rotation);
  if(part.face==='back')group.rotation.x=-Math.PI/2;
  if(part.face==='left')group.rotation.z=-Math.PI/2;
  return group;
}
export function partBoardCollisions(parts,boards,preset,wall) {
  const hits=[];
  for(const part of parts){
    const spec=PART_BODIES[part.type];if(!spec)continue;
    const object=makePartReference(part,preset,wall);
    const center=new THREE.Vector3(0,-spec.depth/2-0.5,0).applyMatrix4((object.updateMatrixWorld(true),object.matrixWorld));
    // Conservative oriented-box AABB, used for warnings only.
    const half=new THREE.Vector3(spec.width/2,spec.depth/2,spec.length/2);
    const bounds=new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0,-spec.depth/2-0.5,0),half.clone().multiplyScalar(2)).applyMatrix4(object.matrixWorld);
    for(const board of boards){
      const pcb=new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(board.x,board.bottomY+board.thickness/2,board.z),
        new THREE.Vector3(board.width,board.thickness,board.length));
      if(bounds.intersectsBox(pcb))hits.push({id:part.id,error:part.id+' ('+spec.label+') 와 '+board.name+' 간섭 가능성: 부품 외형을 확인하세요.'});
    }
    object.traverse(child=>{if(child.isMesh)child.geometry.dispose()});
  }
  return hits;
}
