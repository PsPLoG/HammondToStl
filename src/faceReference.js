// Screen projection for a full 180° X-axis flip of the assembled enclosure.
// All coordinates remain canonically stored in the original case CAD frame.
// Reflecting for the editor changes the view, not the physical drilled holes.
export function faceScreenPoint(face, u, v, flipped = false) {
  if (!flipped) return { u, v };
  return {
    u: face === 'left' || face === 'right' ? -u : u,
    v: -v,
  };
}

// Reflections are self-inverse, so pointer and keyboard operations can map
// back to the original stored (u,v) before snapping / drilling.
export const faceModelPoint = faceScreenPoint;

const tenth = n => Math.round(n * 10) / 10;

export function faceScreenClearances(part, dim, flipped = false) {
  const { u, v } = faceScreenPoint(part.face, part.u, part.v, flipped);
  const r = part.keepout / 2;
  return {
    left: tenth(dim.width / 2 + u - r),
    right: tenth(dim.width / 2 - u - r),
    top: tenth(dim.height / 2 + v - r),
    bottom: tenth(dim.height / 2 - v - r),
  };
}

// Y=0 at the mating plane of the bottom plate and shell (not the
// detached plate's lower surface); positive Y points toward the roof.
export function lidDatumHeight(part, preset) {
  if (part.face === 'top') return null;
  return tenth(preset.h / 2 - part.v);
}

export function lidDatumScreenY(face, preset, flipped = false) {
  if (face === 'top') return null;
  return flipped ? -preset.h / 2 : preset.h / 2;
}
