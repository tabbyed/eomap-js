import { WINDOW_DEFAULTS } from "../model/windows.js";
import { HEX_COLOR } from "../model/validation.js";
import { isRgbaPixels } from "../pixels.js";

// Window glow is the appearance of its glass. Brightness controls outdoor
// illumination separately, so a softly glowing room need not light the street.
export function windowAppearance(light) {
  const hex = HEX_COLOR.test(light?.color)
    ? light.color
    : WINDOW_DEFAULTS.color;
  const glow = light?.glow ?? WINDOW_DEFAULTS.glow;
  const alpha =
    light && light.enabled !== false && Number.isFinite(glow)
      ? Math.min(1, Math.max(0, glow) * 0.9)
      : 0;
  return { enabled: alpha > 0, alpha, color: parseInt(hex.slice(1), 16) };
}

// Cache once alongside the texture. Only exposed edges belong to a pane's
// outline: two adjacent glass pixels never create an internal grid line.
// Each run of exposed pixel sides is one segment, so a straight pane side is
// one line to draw rather than one per pixel.
export function maskOutline(pixels) {
  if (!isRgbaPixels(pixels)) return [];
  const { width, height, data } = pixels;
  const filled = (x, y) =>
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height &&
    data[(y * width + x) * 4 + 3] > 0;
  const edges = [];
  // Top sides lie on row y, bottom sides on row y + 1.
  for (const [dy, offset] of [
    [-1, 0],
    [1, 1],
  ])
    for (let y = 0; y < height; y++) {
      let start = -1;
      for (let x = 0; x <= width; x++) {
        const exposed = filled(x, y) && !filled(x, y + dy);
        if (exposed && start < 0) start = x;
        else if (!exposed && start >= 0) {
          edges.push([start, y + offset, x, y + offset]);
          start = -1;
        }
      }
    }
  // Left sides lie on column x, right sides on column x + 1.
  for (const [dx, offset] of [
    [-1, 0],
    [1, 1],
  ])
    for (let x = 0; x < width; x++) {
      let start = -1;
      for (let y = 0; y <= height; y++) {
        const exposed = filled(x, y) && !filled(x + dx, y);
        if (exposed && start < 0) start = y;
        else if (!exposed && start >= 0) {
          edges.push([x + offset, start, x + offset, y]);
          start = -1;
        }
      }
    }
  return edges;
}
