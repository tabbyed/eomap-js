import { isRgbaPixels } from "../../gfx/pixel-hit-mask.js";
import { HEX_COLOR } from "../model/validation.js";
import { ASSET_PACK } from "../packs/index.js";

// Each lamp's glass region, from the pack catalogue.
const GLASS_REGIONS = ASSET_PACK.bulbGlass;

/** Whether a native glass or flame colour is hot enough to glow. */
export function isGlowing(r, g, b) {
  const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
  // Native glass includes amber 255/222/132 and cream 214/206/181.
  // The brightest lantern wood is 197/156/107; metal is darker still.
  return r >= 210 && g >= 200 && luminance >= 200;
}

/** Build a white tintable mask from an ImageData-like decoded native sprite. */
export function createBulbMask(pixels, graphic) {
  if (!isRgbaPixels(pixels))
    throw new TypeError("A bulb mask requires complete RGBA sprite pixels.");
  const { width, height, data: source } = pixels;
  const data = new Uint8ClampedArray(width * height * 4);
  const region = GLASS_REGIONS.get(graphic);
  if (!region) return { width, height, data };

  for (let y = region.top; y <= Math.min(height - 1, region.bottom); y++) {
    for (let x = region.left; x <= Math.min(width - 1, region.right); x++) {
      const i = (y * width + x) * 4;
      if (
        source[i + 3] === 0 ||
        !isGlowing(source[i], source[i + 1], source[i + 2])
      )
        continue;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = source[i + 3];
    }
  }
  return { width, height, data };
}

/** Build one white, tintable halo texture; callers cache its renderer frame. */
export function createHaloPixels(size = 64) {
  if (!Number.isInteger(size) || size < 2 || size > 512)
    throw new RangeError("Halo size must be an integer between 2 and 512.");
  const data = new Uint8ClampedArray(size * size * 4);
  const radius = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - radius) / radius;
      const dy = (y + 0.5 - radius) / radius;
      const falloff = Math.max(0, 1 - dx * dx - dy * dy);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      // A smooth centre and zero slope at the edge avoid a visible halo ring.
      data[i + 3] = Math.round(255 * falloff ** 3);
    }
  }
  return { width: size, height: size, data };
}

function strength(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 0;
}

/** Colours are packed 0xRRGGBB; alpha values are independent of scene ambient. */
export function emissionAppearance(light) {
  const color = HEX_COLOR.test(light.color) ? light.color : "#ffcf88";
  const haloColor = parseInt(color.slice(1), 16);
  const channels = [haloColor >> 16, (haloColor >> 8) & 255, haloColor & 255];
  // Glass is hot and nearly white, while its local halo retains the light hue.
  const coreColor = channels.reduce(
    (result, channel) =>
      (result << 8) | Math.round(channel + (255 - channel) * 0.72),
    0,
  );
  const amount =
    light.enabled === false
      ? 0
      : strength(light.brightness ?? 1) * strength(light.glow ?? 1);
  return {
    enabled: amount > 0,
    coreAlpha: Math.min(1, amount * 0.95),
    haloAlpha: Math.min(0.5, amount * 0.22),
    coreColor,
    haloColor,
  };
}
