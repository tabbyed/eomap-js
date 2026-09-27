import { Layer } from "../../data/layer.js";
// EO tiles project to (32 * (x - y) + 32, 16 * (x + y) + 16).
// A wall is a continuous vertical plane, even when its art is split across
// bitmap resources with different heights. Match EOMap's -1px wall offset and
// bottom origin here; bitmap-local rows are not physical height coordinates.
//
// Native wall bitmaps can also contain roofs, trim and overhangs. This mapping
// treats those opaque pixels as part of the wall plane; it cannot infer their
// separate 3D surfaces or normals from alpha. Those need asset metadata.
export function wallSurfaceVertex(
  layer,
  tileX,
  tileY,
  frameHeight,
  localX,
  localY,
) {
  if (layer === Layer.DownWall) {
    const x = tileX - 0.5 + localX / 32;
    return {
      x,
      y: tileY + 0.5,
      height: frameHeight - 15 + localX / 2 - localY,
      sampleX: x,
      sampleY: tileY + 1,
    };
  }
  if (layer === Layer.RightWall) {
    const y = tileY + 0.5 - localX / 32;
    return {
      x: tileX + 0.5,
      y,
      height: frameHeight + 1 - localX / 2 - localY,
      sampleX: tileX + 1,
      sampleY: y,
    };
  }
  throw new RangeError("A wall surface must use the Down or Right wall layer.");
}

// The tile-centred field has no separate samples on the two sides of an edge.
// sampleX/sampleY therefore retain the exact tangent coordinate but use the
// exterior cell centre along the normal. This avoids averaging light through
// a closed wall, at the cost of a half-tile normal-distance approximation.

// Align interpolation knots to world space. Starting strips at each bitmap's
// own top creates different gradients at shared edges when resource heights
// differ. Endpoints remain at the frame bounds so texture UVs stay inside it.
export function wallSurfaceSlices(tileX, tileY, frameHeight, step = 16) {
  if (!Number.isFinite(step) || step <= 0)
    throw new RangeError("Wall slice spacing must be positive and finite.");
  if (!Number.isFinite(frameHeight) || frameHeight < 0)
    throw new RangeError("Wall frame height must be non-negative and finite.");
  const top = (tileX + tileY) * 16 + 31 - frameHeight;
  const bottom = top + frameHeight;
  const slices = [0];
  for (
    let worldY = (Math.floor(top / step) + 1) * step;
    worldY < bottom;
    worldY += step
  ) {
    slices.push(worldY - top);
  }
  if (frameHeight > 0) slices.push(frameHeight);
  return slices;
}
