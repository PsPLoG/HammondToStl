// All previews use original millimetre-based assembly coordinates (bottom Y=0,
// top Y=height, lid just below Y=0). Flipping this parent assembly about the
// body's Y midpoint puts the lid above the body without modifying exports.
export function previewAssemblyTransform(height, flipped = false) {
  return {
    pivot: [0, height / 2, 0],
    rotation: [flipped ? Math.PI : 0, 0, 0],
    origin: [0, -height / 2, 0],
  };
}
