import { isRgbaPixels } from "../../gfx/pixel-hit-mask.js";
import { ASSET_PACK } from "../packs/index.js";
import { isGlowing } from "./lamp-emission.js";

// Moving flames for the lighting preview, from the pack catalogue.
export const FLAMES = ASSET_PACK.flames;
const PALETTE = ASSET_PACK.flamePalette;

// Uneven steps keep the flicker from settling into a beat. Every flame
// changes on the same steps, so redraws stay near six a second however many
// flames are in view.
const STEPS_MS = [150, 130, 180, 140, 170, 120, 160, 190];
const CYCLE_MS = STEPS_MS.reduce((sum, ms) => sum + ms, 0);

/** The flicker step at `time` milliseconds. */
export function flameStep(time) {
  const cycle = Math.floor(time / CYCLE_MS);
  let rest = time - cycle * CYCLE_MS;
  let index = 0;
  while (rest >= STEPS_MS[index]) rest -= STEPS_MS[index++];
  return cycle * STEPS_MS.length + index;
}

// A well-mixed 32-bit hash of a light's key and a step, so that neighbouring
// flames flicker independently.
function hash(key, step) {
  let h = (0x811c9dc5 ^ step) >>> 0;
  for (let i = 0; i < key.length; i++)
    h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * The frame a light shows at `step`. Alternate steps choose from alternate
 * halves of the frames, so a flame never holds one shape for two steps.
 */
export function flameFrame(key, step, count) {
  if (count < 2) return 0;
  const half = Math.floor(count / 2);
  const second = (step + hash(key, 0)) % 2 === 1;
  return second
    ? half + (hash(key, step) % (count - half))
    : hash(key, step) % half;
}

/** Glow strength at `step`: a multiplier between 0.78 and 1.12. */
export function flameFlicker(key, step) {
  return 0.78 + (0.34 * (hash(key, ~step) & 0xffff)) / 0xffff;
}

const pixelsOf = (width, height) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});

/**
 * Build a moving flame from decoded RGBA sprite pixels: a still base (the
 * sprite without its native flame; null when the sprite shows no flame to
 * hide) and frames, each with its colours, a white mask of the pixels that
 * glow, and its offset from the sprite's top-left. A bent flame also needs
 * the pixels of its `empty` sprite, and a borrowed one those of the `fire`
 * it borrows (see flameSources). Returns null for other graphics.
 */
export function createFlameAnimation(pixels, graphic, { empty, fire } = {}) {
  const spec = FLAMES.get(graphic);
  if (!spec) return null;
  if (!isRgbaPixels(pixels))
    throw new TypeError("A flame requires complete RGBA sprite pixels.");
  if (spec.empty) return bentFlame(spec, pixels, empty);
  if (spec.fire) return borrowedFlame(spec, pixels, fire);
  return drawnFlame(spec, pixels);
}

/**
 * The resources a graphic's flame is built from, by the name
 * createFlameAnimation takes them: its own sprite as `pixels`, and any
 * `empty` sprite or borrowed `fire`. Each is [gfx file, graphic ID].
 */
export function flameSources(graphic) {
  const spec = FLAMES.get(graphic);
  if (!spec) return null;
  const sources = { pixels: [4, graphic] };
  if (spec.empty) sources.empty = [4, spec.empty];
  if (spec.fire) sources.fire = [spec.fire.file, spec.fire.graphic];
  return sources;
}

// Hearth interiors are dark; stonework and logs are lighter and stay in front.
const FIREBOX_LUMINANCE = 85;
// Campfire flames are warm and bright; its logs and embers are not.
const isFire = (r, g) => r > 150 && g > 60;

function borrowedFlame(spec, { width, height, data }, source) {
  if (!isRgbaPixels(source))
    throw new TypeError("A borrowed flame requires its source's pixels.");
  const { frames: count, rows } = spec.fire;
  const frameWidth = Math.floor(source.width / count);
  const [left, top, right, bottom] = spec.window;
  const w = right - left + 1,
    h = bottom - top + 1;
  const frames = [];
  for (let k = 0; k < count; k++) {
    const flame = pixelsOf(w, h),
      core = pixelsOf(w, h);
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const i = (y * width + x) * 4;
        const luminance =
          data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
        if (!data[i + 3] || luminance >= FIREBOX_LUMINANCE) continue;
        const sx = x - spec.x,
          sy = y - spec.y;
        if (sx < 0 || sy < 0 || sx >= frameWidth || sy >= rows) continue;
        const j = (sy * source.width + k * frameWidth + sx) * 4;
        const [r, g, b] = source.data.subarray(j, j + 3);
        if (!source.data[j + 3] || !isFire(r, g)) continue;
        const o = ((y - top) * w + (x - left)) * 4;
        flame.data.set(source.data.subarray(j, j + 4), o);
        if (isGlowing(r, g, b)) core.data.set([255, 255, 255, 255], o);
      }
    frames.push({ x: left, y: top, flame, core });
  }
  return { base: null, frames };
}

function drawnFlame(spec, { width, height, data }) {
  const base = { width, height, data: new Uint8ClampedArray(data) };
  if (spec.clear) {
    const [left, top, right, bottom] = spec.clear;
    for (let y = Math.max(0, top); y <= Math.min(height - 1, bottom); y++)
      for (let x = Math.max(0, left); x <= Math.min(width - 1, right); x++)
        base.data[(y * width + x) * 4 + 3] = 0;
  }
  const frames = spec.frames.map((rows) => {
    const w = rows[0].length;
    const flame = pixelsOf(w, rows.length),
      core = pixelsOf(w, rows.length);
    rows.forEach((row, y) => {
      for (let x = 0; x < w; x++) {
        const colour = PALETTE[row[spec.mirror ? w - 1 - x : x]];
        if (!colour) continue;
        const i = (y * w + x) * 4;
        flame.data.set([...colour, 255], i);
        if (isGlowing(...colour)) core.data.set([255, 255, 255, 255], i);
      }
    });
    return { x: spec.x, y: spec.y, flame, core };
  });
  return { base, frames };
}

function bentFlame(spec, pixels, empty) {
  if (!isRgbaPixels(empty))
    throw new TypeError("A bent flame requires its empty sprite's pixels.");
  const { width, height, data } = pixels;
  // Object sprites are bottom-aligned, so the empty sprite sits at the foot.
  const offset = height - empty.height;
  const bowlAt = (x, y) => {
    const ey = y - offset;
    if (x < 0 || x >= empty.width || ey < 0 || ey >= empty.height) return -1;
    const i = (ey * empty.width + x) * 4;
    return empty.data[i + 3] ? i : -1;
  };
  // Fire is whatever the lit sprite adds to or changes in the empty one.
  const fireAt = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return -1;
    const i = (y * width + x) * 4;
    if (!data[i + 3]) return -1;
    const j = bowlAt(x, y);
    const unchanged =
      j >= 0 &&
      data[i] === empty.data[j] &&
      data[i + 1] === empty.data[j + 1] &&
      data[i + 2] === empty.data[j + 2];
    return unchanged ? -1 : i;
  };
  const base = pixelsOf(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const j = bowlAt(x, y);
      if (j >= 0)
        base.data.set(empty.data.subarray(j, j + 4), (y * width + x) * 4);
    }

  const { count, sway, lift, base: rootY, margin } = spec;
  const frames = [];
  for (let k = 0; k < count; k++) {
    const phase = (2 * Math.PI * k) / count;
    const flame = pixelsOf(width, height + margin),
      core = pixelsOf(width, height + margin);
    for (let row = 0; row < height + margin; row++) {
      const y = row - margin;
      // Movement grows from nothing at the fire's root to full at its tips.
      const reach = Math.max(0, Math.min(1, (rootY - y) / rootY)) ** 1.2;
      for (let x = 0; x < width; x++) {
        // Never cover bowl pixels that the native fire left showing.
        if (bowlAt(x, y) >= 0 && fireAt(x, y) < 0) continue;
        const sourceX =
          x + Math.round(sway * reach * Math.sin(phase + y * 0.45));
        const sourceY =
          y +
          Math.round(lift * reach * (0.5 + 0.5 * Math.sin(phase + x * 0.6)));
        const i = fireAt(sourceX, sourceY);
        if (i < 0) continue;
        const o = (row * width + x) * 4;
        flame.data.set(data.subarray(i, i + 4), o);
        if (isGlowing(data[i], data[i + 1], data[i + 2]))
          core.data.set([255, 255, 255, 255], o);
      }
    }
    frames.push({ x: 0, y: -margin, flame, core });
  }
  return { base, frames };
}
