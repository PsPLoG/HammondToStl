import * as THREE from 'three';
import { partWorld } from './layout.js';
import ledCad from './cad/kicadLed5mm.json';
import { jackVariant } from './jackVariants.js';

// Reference envelopes, NOT manufacturer-certified CAD. Coordinates in mm.
// Local +Y points outside the panel; panel outside is local Y=0.
export const PART_BODIES = {
  potentiometer: { width: 17, length: 17, depth: 11.5, label: 'Alpha RV16AF reference, Ø16.5 body' },
  audioJack: { width: 20, length: 18, depth: 23, label: 'Box or turtle jack reference; choose profile in properties' },
  led: { width: 6, length: 6, depth: 9, label: '5mm panel LED reference' },
  footswitch: { width: 19.6, length: 17, depth: 17, label: '3PDT nine-terminal reference' },
  toggle: { width: 13, length: 8, depth: 12, label: 'mini toggle reference' },
  dcJack: { width: 15, length: 14, depth: 18, label: '5.5x2.1 panel DC jack reference' },
};
const metal = new THREE.MeshStandardMaterial({ color: '#bfc5c8', metalness: 0.7, roughness: 0.3 });
const plastic = new THREE.MeshStandardMaterial({ color: '#252a2d', roughness: 0.72 });
const board = new THREE.MeshStandardMaterial({ color: '#8c6850', roughness: 0.8 });
const lens = new THREE.MeshStandardMaterial({ color: '#e94b42', emissive: '#691b1a' });
const plated = new THREE.MeshStandardMaterial({ color: '#d6c7a2', metalness: 0.7, roughness: 0.32 });
const shellGray = new THREE.MeshStandardMaterial({ color: '#888d8d', metalness: 0.48, roughness: 0.5 });
const deep = new THREE.MeshStandardMaterial({ color: '#101316', roughness: 0.84 });
function cube(root, w, h, d, x, y, z, material = plastic) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); root.add(mesh);
}
function round(root, radius, height, x, y, z, material = metal, segments = 32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  mesh.position.set(x, y, z); root.add(mesh);
}
function hex(root, radius, height, y) { round(root, radius, height, 0, y, 0, metal, 6); }
function annulus(root, major, tube, x, y, z, material = metal) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(major, tube, 10, 48), material);
  mesh.position.set(x, y, z);
  mesh.rotation.x = -Math.PI / 2;
  root.add(mesh);
}
function plate(root, width, depth, x, y, z, material = metal) {
  cube(root, width, 0.5, depth, x, y, z, material);
}
function roundedCase(root, width, height, length, x, y, z, material = plastic) {
  const shape = new THREE.Shape();
  const w=width/2, l=length/2, r=Math.min(1.4,w/3,l/3);
  shape.moveTo(-w+r,-l);shape.lineTo(w-r,-l);
  shape.quadraticCurveTo(w,-l,w,-l+r);shape.lineTo(w,l-r);
  shape.quadraticCurveTo(w,l,w-r,l);shape.lineTo(-w+r,l);
  shape.quadraticCurveTo(-w,l,-w,l-r);shape.lineTo(-w,-l+r);
  shape.quadraticCurveTo(-w,-l,-w+r,-l);
  const g = new THREE.ExtrudeGeometry(shape,{depth:height,steps:1,bevelEnabled:false,curveSegments:6});
  g.rotateX(-Math.PI/2);
  g.translate(x,y-height/2,z);
  root.add(new THREE.Mesh(g,material));
}
function solderLug(root,x,y,z,rotate=false) {
  cube(root,rotate?0.8:2.5,3.7,rotate?2.5:0.8,x,y,z,plated);
  round(root,0.58,0.82,x,y-1.05,z,deep,16);
}

// Indexed meshes converted from KiCad's original CC-BY-SA 4.0 VRML asset.
// VRML coordinates use 0.1-inch units; orientation is Z along the LED axis.
function makeCadLed(wall) {
  const group = new THREE.Group();
  for (const item of ledCad.meshes) {
    const geometry = new THREE.BufferGeometry();
    const source = item.positions;
    const points = new Float32Array(source.length);
    for (let i = 0; i < source.length; i += 3) {
      points[i] = source[i] * ledCad.unitScale;
      points[i + 1] = (source[i + 2] - 2.5) * ledCad.unitScale;
      points[i + 2] = source[i + 1] * ledCad.unitScale;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
    // The Y/Z axis swap flips winding; invert each triangle to preserve outward normals.
    const indices = item.indices.slice();
    for (let i = 0; i < indices.length; i += 3) {
      const temp = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = temp;
    }
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.48, side: THREE.DoubleSide });
    material.userData.referenceAsset = true;
    group.add(new THREE.Mesh(geometry, material));
  }
  return group;
}

function buildLocal(part, wall) {
  const root = new THREE.Group();
  const type = part.type;
  const depth = PART_BODIES[type]?.depth || 10;
  if (type === 'potentiometer') {
    // Alpha RV16AF-type metal case, mounting front at local Y=0.
    // RV16 body Ø16.5; M7x0.75 bushing, Ø6 shaft, three 5mm-spaced solder terminals.
    const bodyTop = -wall;
    round(root,8.25,9.2,0,bodyTop-4.6,0,shellGray,72);
    round(root,7.9,0.6,0,bodyTop-9.2,0,metal,72);
    round(root,6.35,0.55,0,bodyTop-0.1,0,metal,64);
    annulus(root,7.85,0.35,0,bodyTop-0.4,0,metal);
    // Rear moulded insulator and three real solder tab locations.
    cube(root,15.2,2,4.8,0,bodyTop-10.3,5.4,plastic);
    for(const x of [-5,0,5]) {
      cube(root,3,1.4,2.8,x,bodyTop-11.4,7.6,plastic);
      solderLug(root,x,bodyTop-14.2,8.5,false);
    }
    // Anti-rotation lug is recessed into the panel side of the case.
    cube(root,2.8,1.2,1.4,8.1,bodyTop-0.15,0,metal);
    round(root,3.48,wall+4.7,0,2.35-wall/2,0,plated,56);
    annulus(root,4.9,0.62,0,0.48,0,plated);
    hex(root,5.4,1.6,1.65);
    // Shaft with short collar and visible D-flat.
    round(root,3.0,12,0,8.2,0,shellGray,56);
    cube(root,6.0,11.6,0.45,0,8.2,2.75,shellGray);
    round(root,2.8,0.55,0,14.1,0,metal,56);
  } else if (type === 'footswitch') {
    cube(root, 19.6, 16.5, 17, 0, -wall - 8.25, 0);
    cube(root, 19.6, 2, 17, 0, -wall - 1.1, 0, metal);
    round(root, 5.7, wall + 6, 0, 3 - wall / 2, 0);
    hex(root, 8.5, 1.8, 0.9);
    round(root, 4.5, 6, 0, 6, 0);
    // Nine solder lugs on the bottom, arranged 3x3.
    for (const x of [-5, 0, 5]) for (const z of [-5, 0, 5]) {
      cube(root, 1.6, 6, 0.9, x, -wall - 19.2, z, metal);
    }
  } else if (type === 'audioJack') {
    const variant = jackVariant(part);
    // Bushing axis is local Y. Panel outside is Y=0; body remains behind Y=-wall.
    const shoulder = -wall;
    if(variant.id === 'box') {
      // Closed square housing, bevelled edges, rear lid seam, and three spade lugs.
      roundedCase(root,17,19.2,17,0,shoulder-9.6,0,plastic);
      cube(root,16.4,0.55,16.2,0,shoulder-19.3,0,shellGray);
      cube(root,15,0.85,15,0,shoulder-0.25,0,shellGray);
      for(const x of [-5,0,5]) {
        cube(root,2.5,5.3,0.8,x,shoulder-22.6,4.2,plated);
        cube(root,1.1,1.3,1.5,x,shoulder-25.7,4.2,plated);
      }
    } else {
      // RPJ-303-style 6-pin open-frame jack ("turtle jack"):
      // two black insulation decks, exposed spring contacts and six solder tabs.
      roundedCase(root,15.8,3.2,15.3,0,shoulder-3.6,0,plastic);
      roundedCase(root,15.8,2.8,15.3,0,shoulder-18.2,0,plastic);
      cube(root,2,12,13, -7,shoulder-10.9,0,plastic);
      cube(root,2,12,13, 7,shoulder-10.9,0,plastic);
      for(const x of [-5.6,5.6]) for(const z of [-4.5,0,4.5]) {
        cube(root,1.7,11.5,0.8,x,shoulder-10.3,z,plated);
        cube(root,1.4,5,0.9,x,shoulder-22,z,plated);
      }
      for(const z of [-4,0,4]) cube(root,8.8,0.5,0.8,0,shoulder-13.5,z,plated);
      round(root,6.0,1.3,0,shoulder-1,0,plastic,56);
    }
    // Hollow-looking panel mouth: metal threaded bushing, washer and hex nut.
    round(root,variant.id==='box'?4.72:5.3,wall+4.8,0,2.4-wall/2,0,plated,64);
    annulus(root,variant.id==='box'?5.2:5.9,0.64,0,0.55,0,metal);
    hex(root,variant.id==='box'?7.2:7.4,1.4,1.4);
    annulus(root,3.45,1.35,0,2.7,0,plated);
    round(root,3.15,0.33,0,2.78,0,deep,48);
    annulus(root,2.65,0.22,0,2.98,0,metal);
  } else if (type === 'led') {
    round(root, 2.5, 8, 0, -wall - 2, 0, lens);
    round(root, 3, 1, 0, 0.6, 0, metal);
    for (const x of [-1.25, 1.25]) cube(root, 0.6, 10, 0.6, x, -wall - 10, 0, metal);
  } else if (type === 'toggle') {
    cube(root, 13, 12, 8, 0, -wall - 6, 0);
    round(root, 3, wall + 4, 0, 2 - wall / 2, 0);
    hex(root, 5, 1.4, 0.8);
    round(root, 1.8, 10, 0, 7, 0);
    for (const x of [-4, 0, 4]) cube(root, 1.2, 5, 0.8, x, -wall - 14.5, 0, metal);
  } else if (type === 'dcJack') {
    cube(root, 15, 14, 14, 0, -wall - 7, 0);
    round(root, 5.5, wall + 3, 0, 1.5 - wall / 2, 0);
    hex(root, 7, 1.6, 0.8);
    for (const x of [-4, 0, 4]) cube(root, 1.2, 6, 1, x, -wall - 17, 2, metal);
  } else {
    cube(root, 12, depth, 12, 0, -wall - depth / 2, 0, board);
  }
  return root;
}
export function makePartReference(part, preset, wall) {
  if (!PART_BODIES[part.type]) return null;
  const root = part.type === 'led' ? makeCadLed(wall) : buildLocal(part, wall);
  const transform = partWorld(part, preset, wall, wall / 2);
  root.position.set(...transform.position);
  root.rotation.set(...transform.rotation);
  // partWorld supplies the outward normal for each of the five faces.
  return root;
}
export function partBoardCollisions(parts, boards, preset, wall) {
  const hits = [];
  for (const part of parts) {
    const object = makePartReference(part, preset, wall);
    if (!object) continue;
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    for (const pcb of boards) {
      const boardBounds = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(pcb.x, pcb.bottomY + pcb.thickness / 2, pcb.z),
        new THREE.Vector3(pcb.width, pcb.thickness, pcb.length));
      if (bounds.intersectsBox(boardBounds)) hits.push({
        id: part.id, error: part.id + ' / ' + pcb.name + ': 참고 외형 간섭 가능성 (실측 확인 필요)',
      });
    }
    object.traverse(node => { if (node.isMesh) { node.geometry.dispose(); if(node.material?.userData?.referenceAsset) node.material.dispose(); } });
  }
  return hits;
}
