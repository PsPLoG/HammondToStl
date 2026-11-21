import * as THREE from 'three';
import { partWorld } from './layout.js';
import ledCad from './cad/kicadLed5mm.json';

// Reference envelopes, NOT manufacturer-certified CAD. Coordinates in mm.
// Local +Y points outside the panel; panel outside is local Y=0.
export const PART_BODIES = {
  potentiometer: { width: 17, length: 17, depth: 11.5, label: 'Alpha RV16AF reference, Ø16.5 body' },
  audioJack: { width: 20.1, length: 15.2, depth: 22.3, label: 'Cliff CL1227G reference envelope' },
  led: { width: 6, length: 6, depth: 9, label: '5mm panel LED reference' },
  footswitch: { width: 19.6, length: 17, depth: 17, label: '3PDT nine-terminal reference' },
  toggle: { width: 13, length: 8, depth: 12, label: 'mini toggle reference' },
  dcJack: { width: 15, length: 14, depth: 18, label: '5.5x2.1 panel DC jack reference' },
};
const metal = new THREE.MeshStandardMaterial({ color: '#bfc5c8', metalness: 0.7, roughness: 0.3 });
const plastic = new THREE.MeshStandardMaterial({ color: '#252a2d', roughness: 0.72 });
const board = new THREE.MeshStandardMaterial({ color: '#8c6850', roughness: 0.8 });
const lens = new THREE.MeshStandardMaterial({ color: '#e94b42', emissive: '#691b1a' });
function cube(root, w, h, d, x, y, z, material = plastic) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); root.add(mesh);
}
function round(root, radius, height, x, y, z, material = metal, segments = 32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  mesh.position.set(x, y, z); root.add(mesh);
}
function hex(root, radius, height, y) { round(root, radius, height, 0, y, 0, metal, 6); }
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
    group.add(new THREE.Mesh(geometry, material));
  }
  return group;
}

function buildLocal(part, wall) {
  const root = new THREE.Group();
  const type = part.type;
  const depth = PART_BODIES[type]?.depth || 10;
  if (type === 'potentiometer') {
    // Alpha RV16AF: round Ø16.5 metal can, three solder tabs, M7 bushing, Ø6 shaft.
    round(root, 8.25, 9.1, 0, -wall - 4.55, 0, metal, 48);
    round(root, 3.5, wall + 5, 0, -wall / 2 + 2.5, 0);
    round(root, 3, 11, 0, 7.5, 0);
    hex(root, 5.3, 1.6, 0.9);
    for (const x of [-5, 0, 5]) cube(root, 1.6, 6, 0.8, x, -wall - 11.8, 6.8, metal);
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
    cube(root, 20.1, 15.2, 15.2, 0, -wall - 7.6, 0);
    round(root, 5.55, wall + 4, 0, 2 - wall / 2, 0);
    hex(root, 7.2, 1.7, 1.0);
    // Contact terminals protrude from the inside.
    for (const x of [-6, 0, 6]) cube(root, 1.3, 7, 1.8, x, -wall - 18.5, 4, metal);
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
  if (part.face === 'back') root.rotation.x = -Math.PI / 2;
  if (part.face === 'left') root.rotation.z = -Math.PI / 2;
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
    object.traverse(node => { if (node.isMesh) node.geometry.dispose(); });
  }
  return hits;
}
