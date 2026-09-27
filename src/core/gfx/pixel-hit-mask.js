import { isRgbaPixels } from "../lighting/pixels.js";

export { isRgbaPixels };

// Preserve only opaque-pixel hit information after decoded RGBA data is released.
// One bit per source pixel, shared by all frames and placements of the resource.
export function createPixelHitMask(pixels) {
  if (!isRgbaPixels(pixels))
    throw new TypeError(
      "A pixel hit mask requires complete RGBA sprite pixels.",
    );
  const { width, height, data } = pixels;
  const count = width * height;
  const bits = new Uint8Array(Math.ceil(count / 8));
  for (let i = 0; i < count; i++) {
    if (data[i * 4 + 3] >= 128) bits[i >>> 3] |= 1 << (i & 7);
  }
  return { width, height, bits };
}

// Coordinates are relative to the original decoded resource, not its atlas page.
export function pixelHit(mask, x, y) {
  if (
    !mask ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    y < 0 ||
    x >= mask.width ||
    y >= mask.height
  )
    return false;
  const index = Math.floor(y) * mask.width + Math.floor(x);
  return Boolean(mask.bits[index >>> 3] & (1 << (index & 7)));
}
