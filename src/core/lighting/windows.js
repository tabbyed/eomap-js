import { wallSurfaceVertex } from "./wall-surface.js";
import { isRgbaPixels } from "../gfx/pixel-hit-mask.js";
import { finiteRange, hexColor, tileInMap } from "./validation.js";
import { ASSET_PACK } from "./packs/index.js";

export const WINDOW_DEFAULTS = Object.freeze({
  enabled: true,
  color: "#ffd495",
  brightness: 0.65,
  glow: 0.85,
  radius: 3.5,
  shadows: true,
});

// The catalogue's windows and split-window parts; see the pack for details.
const definitions = ASSET_PACK.windows;
const parts = ASSET_PACK.windowParts;

const packRgb = ([r, g, b]) => (r << 16) | (g << 8) | b;

// One sprite's glass: what createWindowMask selects and the texture cache key.
function glassSpec(key, graphic, layer, height, bounds, glass) {
  const colours = Array.isArray(glass[0]) ? glass : [glass];
  return {
    key,
    graphic,
    layer,
    width: 32,
    height,
    bounds,
    glass: colours,
    colors: new Set(colours.map(packRgb)),
  };
}

// Top-left of a wall bitmap on screen (see wallSurfaceSlices).
function spriteOrigin(layer, x, y, height) {
  return {
    x: (x - y) * 32 + (layer === 4 ? 32 : 0),
    y: (x + y) * 16 + 31 - height,
  };
}

export const WINDOW_PARTS = new Map(
  parts.map(([graphic, layer, owner, dx, dy, height, bounds, glass]) => [
    graphic,
    {
      ...glassSpec(`${graphic}-part`, graphic, layer, height, bounds, glass),
      owner,
      dx,
      dy,
    },
  ]),
);

// The light source sits at the centre of all of a window's glass, including
// a partner part, in the owner bitmap's coordinates. Opening height depends
// only on the bitmaps, so it is computed once per graphic.
export const WINDOW_DEFINITIONS = new Map(
  definitions.map(([graphic, layer, height, bounds, glass, name, defaults]) => {
    let [left, top, right, bottom] = bounds;
    for (const part of WINDOW_PARTS.values()) {
      if (part.owner !== graphic || part.layer !== layer) continue;
      const own = spriteOrigin(layer, 0, 0, height);
      const other = spriteOrigin(layer, -part.dx, -part.dy, part.height);
      const offsetX = other.x - own.x,
        offsetY = other.y - own.y;
      left = Math.min(left, part.bounds[0] + offsetX);
      top = Math.min(top, part.bounds[1] + offsetY);
      right = Math.max(right, part.bounds[2] + offsetX);
      bottom = Math.max(bottom, part.bounds[3] + offsetY);
    }
    const centreX = (left + right) / 2,
      centreY = (top + bottom) / 2;
    const surface = wallSurfaceVertex(layer, 0, 0, height, centreX, centreY);
    return [
      graphic,
      {
        ...glassSpec(`${graphic}`, graphic, layer, height, bounds, glass),
        name,
        fixture: defaults ? "lantern" : "window",
        defaults: Object.freeze({ ...WINDOW_DEFAULTS, ...defaults }),
        centreX,
        centreY,
        sourceHeight: surface.height,
      },
    ];
  }),
);

export function windowKey(x, y, layer, graphic) {
  return `${x},${y},${layer},${graphic}`;
}

export function windowAt(emf, settings, x, y, layer) {
  if ((layer !== 3 && layer !== 4) || !tileInMap(emf, x, y)) return null;
  const graphic = emf.getTile(x, y).gfx[layer];
  const definition = WINDOW_DEFINITIONS.get(graphic);
  if (!definition || definition.layer !== layer) return null;
  const key = windowKey(x, y, layer, graphic);
  return {
    ...definition.defaults,
    ...settings?.windows?.[key],
    kind: "window",
    fixture: definition.fixture,
    name: definition.name,
    x,
    y,
    layer,
    graphic,
    key,
    height: definition.sourceHeight,
    // A window emits outside an intact wall; it never opens its blocker edge.
    shadows: true,
  };
}

export function windowSource(light) {
  const definition = WINDOW_DEFINITIONS.get(light.graphic);
  if (!definition || definition.layer !== light.layer)
    throw new RangeError("Unknown native window surface.");
  const surface = wallSurfaceVertex(
    definition.layer,
    light.x,
    light.y,
    definition.height,
    definition.centreX,
    definition.centreY,
  );
  const normalX = light.layer === 4 ? 1 : 0;
  const normalY = light.layer === 3 ? 1 : 0;
  // Start outside the closed wall to avoid self-shadowing. This is smaller
  // than one screen pixel, but larger than visibility's numerical tolerance.
  const epsilon = 0.001;
  return {
    x: surface.x + normalX * epsilon,
    y: surface.y + normalY * epsilon,
    height: surface.height,
    normalX,
    normalY,
  };
}

const NO_GLASS = Object.freeze([]);

// Glass drawn on the wall sprite at (x, y): its own window or fixture, and a
// partner part of a neighbour's window. Each carries the light it shows.
export function windowGlassAt(emf, settings, x, y, layer) {
  if ((layer !== 3 && layer !== 4) || !tileInMap(emf, x, y)) return NO_GLASS;
  const graphic = emf.getTile(x, y).gfx[layer];
  const part = WINDOW_PARTS.get(graphic);
  if (!WINDOW_DEFINITIONS.has(graphic) && !part) return NO_GLASS;
  const glass = [];
  const own = windowAt(emf, settings, x, y, layer);
  if (own) glass.push({ light: own, spec: WINDOW_DEFINITIONS.get(graphic) });
  if (part?.layer === layer) {
    const owner = windowAt(emf, settings, x + part.dx, y + part.dy, layer);
    if (owner?.graphic === part.owner) glass.push({ light: owner, spec: part });
  }
  return glass;
}

// Every placed sprite showing a light's glass: its owner and any partner.
export function windowGlassSprites(emf, light) {
  const sprites = [
    { x: light.x, y: light.y, spec: WINDOW_DEFINITIONS.get(light.graphic) },
  ];
  for (const part of WINDOW_PARTS.values()) {
    if (part.owner !== light.graphic || part.layer !== light.layer) continue;
    const x = light.x - part.dx,
      y = light.y - part.dy;
    if (
      tileInMap(emf, x, y) &&
      emf.getTile(x, y).gfx[light.layer] === part.graphic
    )
      sprites.push({ x, y, spec: part });
  }
  return sprites;
}

/**
 * Build an ImageData-like white mask without repainting frames or masonry.
 * `glass` is a catalogue graphic or a glass spec from windowGlassAt.
 */
export function createWindowMask(pixels, glass) {
  if (!isRgbaPixels(pixels))
    throw new TypeError("A window mask requires complete RGBA sprite pixels.");
  const { width, height, data: source } = pixels;
  const data = new Uint8ClampedArray(width * height * 4);
  const spec =
    typeof glass === "number" ? WINDOW_DEFINITIONS.get(glass) : glass;
  if (!spec || width !== spec.width || height !== spec.height)
    return { width, height, data };
  const [left, top, right, bottom] = spec.bounds;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const index = (y * width + x) * 4;
      if (
        !source[index + 3] ||
        !spec.colors.has(
          (source[index] << 16) | (source[index + 1] << 8) | source[index + 2],
        )
      )
        continue;
      data[index] = data[index + 1] = data[index + 2] = 255;
      data[index + 3] = source[index + 3];
    }
  }
  return { width, height, data };
}

export function windowSettings(value) {
  if (!value || typeof value !== "object" || typeof value.enabled !== "boolean")
    throw new TypeError("Missing window enabled state.");
  return {
    enabled: value.enabled,
    color: hexColor(
      value.color,
      "Choose a six-digit window colour, such as #ffd495.",
      TypeError,
    ),
    brightness: finiteRange(
      value.brightness,
      0,
      2,
      "Window brightness",
      RangeError,
    ),
    glow: finiteRange(value.glow, 0, 2, "Window glow", RangeError),
    radius: finiteRange(value.radius, 1, 6, "Window reach", RangeError),
  };
}
