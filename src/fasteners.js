// Pure millimetre-scale fastener placement. The mounting centres and internal
// corner clearance are shared by the shell, lid, editor overlays and tests.
// These are printable-design dimensions, not manufacturer-certified tooling.
export const COMPACT_SCREW = Object.freeze({
  major: 3.0,
  pilot: 2.45,
  clearance: 3.45,
  postRadius: 3.0,
  headRadius: 2.55,
  headHeight: 2.6,
  shaftLength: 7.2,
  pitch: 0.5,
});

const SKIN_MIN = 1.2; // minimum material outside bosses at rounded outer corners
const MAGNET_RING = 1.6; // radial printable material around magnet recesses

// True minimum clearance from a point to the rounded *outside* outline.
export function outlineClearance(preset, x, z) {
  const r = preset.radius;
  const qx = Math.abs(x) - (preset.w / 2 - r);
  const qz = Math.abs(z) - (preset.l / 2 - r);
  const signed = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
  return -signed;
}

export function getFastenerLayout(preset, settings) {
  const screw = settings.closure === 'screw';
  const radius = screw ? COMPACT_SCREW.postRadius :
    (settings.magnetDiameter + settings.magnetTolerance) / 2 + MAGNET_RING;
  // 1590A: 5.00/5.00, 1590B: 5.00/5.15 mm offsets from edges.
  // Large rounded corners may need a small inward shift to preserve skin.
  let insetX = preset.fastenerInsetX ?? 5.0;
  let insetZ = preset.fastenerInsetZ ?? 5.0;
  for (let step = 0; step < 250; step++) {
    const x = preset.w / 2 - insetX;
    const z = preset.l / 2 - insetZ;
    if (outlineClearance(preset, x, z) >= radius + SKIN_MIN - 1e-6) break;
    insetX += 0.025;
    insetZ += 0.025;
  }
  const x = preset.w / 2 - insetX;
  const z = preset.l / 2 - insetZ;
  const centers = [[-x, -z], [x, -z], [-x, z], [x, z]];
  // Connect every boss to the inside of the roof, all the way down to the lid plane.
  // A small roof overlap ensures a continuous printable union, never a suspended boss.
  const bossHeight = preset.h - settings.wall + 0.45;
  return {
    centers, radius, insetX, insetZ, bossHeight,
    outerSkin: outlineClearance(preset, x, z) - radius,
    // Clear width / length between the opposed corner columns at lid height.
    cornerClearWidth: 2 * x - 2 * radius,
    cornerClearLength: 2 * z - 2 * radius,
    // Nominal XY interior rectangle away from the corner features.
    insideWidth: preset.w - settings.wall * 2,
    insideLength: preset.l - settings.wall * 2,
  };
}

export function interiorCompliance(preset, settings) {
  const { insideWidth, insideLength } = getFastenerLayout(preset, settings);
  const ref = preset.insideReference;
  if (!ref) return { measured: false, passes: true };
  const passes = insideWidth >= ref.width - 0.01 && insideLength >= ref.length - 0.01;
  return { measured: true, passes, targetWidth: ref.width, targetLength: ref.length };
}


// A solid corner fill, not two free-standing ribs.  Build a 2D polygon reaching
// INTO the actual shell wall, while following the rounded outside profile.
// This removes the 0.35mm air gap left by the old rectangular reinforcement.
// The small exterior skin ensures the union never expands the outside outline.
export function getCornerWebs(preset, settings) {
  const mounting = getFastenerLayout(preset, settings);
  const exteriorSkin = 0.65;
  const outerX = preset.w / 2 - exteriorSkin;
  const radius = Math.max(0.7, preset.radius - exteriorSkin);
  const cx = preset.w / 2 - preset.radius;
  const cz = preset.l / 2 - preset.radius;
  const outerZ = preset.l / 2 - exteriorSkin;
  const outerZAtX = x => x <= cx ? outerZ :
    Math.min(outerZ, cz + Math.sqrt(Math.max(0, radius * radius - (x - cx) ** 2)));

  return mounting.centers.map(([x, z]) => {
    const sx = Math.sign(x), sz = Math.sign(z);
    const startX = Math.abs(x) - mounting.radius * 0.78;
    const startZ = Math.abs(z) - mounting.radius * 0.78;
    if (startX >= outerX || startZ >= outerZAtX(outerX)) {
      throw new Error('Corner fill cannot fit this enclosure');
    }

    // Follow the exterior quarter circle with a short polygonal arc.
    const points = [[startX, startZ], [outerX, startZ]];
    const segments = 18;
    for (let i = segments; i >= 0; i--) {
      const px = startX + (outerX - startX) * i / segments;
      points.push([px, outerZAtX(px)]);
    }
    return {
      points: points.map(([px,pz]) => [sx * px, sz * pz]),
      x: sx * (startX + outerX) / 2,
      z: sz * (startZ + outerZAtX(startX)) / 2,
      width: outerX - startX,
      length: outerZAtX(startX) - startZ,
      startX, startZ,
      exteriorSkin,
    };
  });
}
