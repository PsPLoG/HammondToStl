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
  const bossHeight = screw ? (preset.screwBossHeight ?? 10.0) :
    Math.max(6, settings.magnetDepth + 2.2);
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
