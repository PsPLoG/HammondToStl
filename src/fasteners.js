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


// Fill the entire inward-facing corner quadrant between each round boss and
// its two neighbouring walls. The web sits INSIDE the exterior rounded profile.
// End inset prevents a protruding square corner; roof-to-lid extrusion joins
// all three surfaces into one printable shell instead of isolated cylinders.
export function getCornerWebs(preset, settings) {
  const mounting = getFastenerLayout(preset, settings);
  const endX = preset.w / 2 - settings.wall - 0.35;
  const endZ = preset.l / 2 - settings.wall - 0.35;
  return mounting.centers.map(([x, z]) => {
    const startX = Math.abs(x) - mounting.radius * 0.55;
    const startZ = Math.abs(z) - mounting.radius * 0.55;
    const width = endX - startX;
    const length = endZ - startZ;
    if (width <= 0 || length <= 0) throw new Error('Corner reinforcement cannot fit this enclosure');
    return {
      x: Math.sign(x) * (startX + endX) / 2,
      z: Math.sign(z) * (startZ + endZ) / 2,
      width, length,
    };
  });
}
