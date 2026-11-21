import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ENCLOSURES, DEFAULT_SETTINGS } from '../src/presets.js';
import { buildShell, trimForSTL } from '../src/geometry.js';
import { getFastenerLayout } from '../src/fasteners.js';

// A coordinate-only check cannot catch lost CSG unions. Shoot vertical rays
// through the corner area BETWEEN the cylindrical boss and its adjacent wall.
// With a true solid fill, the bottom-most face is at the lid plane (Y=0).
test('CSG output includes solid full-height joins in all four corners', () => {
  const settings = { ...DEFAULT_SETTINGS, closure: 'screw' };
  for (const preset of [ENCLOSURES['1590A'], ENCLOSURES['1590B'], ENCLOSURES['125B'], ENCLOSURES['1590BB']]) {
    const result = buildShell(preset, settings, []);
    const mesh = trimForSTL(result);
    mesh.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mounts = getFastenerLayout(preset, settings);
    try {
      const positions = mesh.geometry.attributes.position;
      assert.ok(positions.count > 100, preset.code + ' generated too few faces');
      for (const [x,z] of mounts.centers) {
        const px = x + Math.sign(x) * 2.1;
        const pz = z - Math.sign(z) * 2.25;
        const ray = new THREE.Raycaster(
          new THREE.Vector3(px, preset.h + 3, pz),
          new THREE.Vector3(0,-1,0),
          0, preset.h + 5,
        );
        const intersections = ray.intersectObject(mesh, false);
        assert.ok(intersections.length >= 2, preset.code + ' has an open or missing filled corner');
        const lowest = Math.min(...intersections.map(hit => hit.point.y));
        assert.ok(lowest < 0.08, preset.code + ' corner at ' + px + ',' + pz +
          ' is not filled to Y=0 (lowest mesh crossing at ' + lowest + ')');
      }
    } finally {
      mesh.geometry.dispose();
      mesh.material.dispose();
      result.geometry.dispose();
    }
  }
});
