import * as THREE from 'three';
import { partWorld } from './layout.js';
import ledCad from './cad/kicadLed5mm.json' with { type: 'json' };

// No procedural hardware meshes. The only built-in reference geometry is
// triangulated from KiCad's original LED_D5.0mm.wrl (CC-BY-SA 4.0).
// All other parts MUST be rendered from imported, product-specific CAD.
function makeKiCadLed() {
  const root = new THREE.Group();
  for (const source of ledCad.meshes) {
    const positions = new Float32Array(source.positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = source.positions[i] * ledCad.unitScale;
      positions[i + 1] = (source.positions[i + 2] - 2.5) * ledCad.unitScale;
      positions[i + 2] = source.positions[i + 1] * ledCad.unitScale;
    }
    const indices = source.indices.slice();
    for (let i = 0; i < indices.length; i += 3) {
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: source.color, roughness: 0.48, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    root.add(mesh);
  }
  return root;
}

export function makePartReference(part, preset, wall) {
  if (part.type !== 'led') return null;
  const root = makeKiCadLed();
  const transform = partWorld(part, preset, wall, wall / 2);
  root.position.set(...transform.position);
  root.rotation.set(...transform.rotation);
  return root;
}

export function partBoardCollisions(parts, boards, preset, wall) {
  const hits = [];
  // This examines the KiCad LED mesh only; unverified parts are never
  // tested using imaginary component shapes.
  for (const part of parts) {
    const object = makePartReference(part, preset, wall);
    if (!object) continue;
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    for (const pcb of boards) {
      const boardBounds = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(pcb.x, pcb.bottomY + pcb.thickness / 2, pcb.z),
        new THREE.Vector3(pcb.width, pcb.thickness, pcb.length),
      );
      if (bounds.intersectsBox(boardBounds)) {
        hits.push({ id: part.id, error: part.id + ' / ' + pcb.name + ': KiCad LED CAD 외형과 PCB 간섭 가능성 (AABB)' });
      }
    }
    object.traverse(node => {
      if (node.isMesh) {
        node.geometry.dispose();
        node.material.dispose();
      }
    });
  }
  return hits;
}
