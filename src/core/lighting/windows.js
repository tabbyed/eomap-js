import { wallSurfaceVertex } from "./wall-surface.js";
import { isRgbaPixels } from "../gfx/pixel-hit-mask.js";
import { finiteRange, hexColor, tileInMap } from "./validation.js";

// Native gfx006 windows are opaque panes embedded in 32 px wall bitmaps, not
// transparent holes or separate object sprites. Within its bounds
// (right/bottom exclusive) each listed glass colour occurs only on the panes,
// so selecting those colours there gives an exact mask. Verify with
// scripts/audit-window-assets.cjs, which also regenerates
// docs/window-assets.json.
const BRICK = "Brick window";
const GREY = "Window";
const TIMBER = "Timber window";
const COTTAGE = "Cottage window";
const ARCHED = "Arched window";
const LANTERN = "Wall lantern";

// Textured glass: the church windows' wood-grain panes and the lantern. Both
// are warm against neutral stucco and frames; the palettes do not overlap.
// prettier-ignore
const CHURCH_GLASS = [
  [107, 74, 41], [123, 90, 58], [132, 99, 66], [132, 99, 74], [140, 99, 66],
  [140, 99, 74], [140, 107, 66], [140, 107, 74], [140, 107, 82], [148, 107, 66],
  [148, 107, 74], [148, 107, 82], [148, 123, 66], [148, 123, 74], [148, 123, 82],
  [148, 123, 90], [156, 123, 74], [156, 123, 82], [156, 123, 90], [156, 132, 74],
  [156, 132, 90], [156, 132, 99], [165, 132, 99], [165, 140, 99], [165, 140, 107],
];
// prettier-ignore
const LANTERN_GLASS = [
  [148, 115, 49], [148, 115, 66], [148, 115, 82], [173, 132, 66],
  [173, 132, 74], [173, 132, 82], [173, 132, 99], [173, 140, 99],
];

export const WINDOW_DEFAULTS = Object.freeze({
  enabled: true,
  color: "#ffd495",
  brightness: 0.65,
  glow: 0.85,
  radius: 3.5,
  shadows: true,
});

// A fixed wall fixture: warmer and brighter than a window, lit by default.
const LANTERN_DEFAULTS = {
  color: "#ffad46",
  brightness: 1.1,
  glow: 1,
  radius: 4,
};

const definitions = [
  // graphic, layer, bitmap height, glass bounds, glass colour(s), name
  // [, fixture defaults]
  [474, 4, 248, [4, 176, 26, 209], [33, 16, 0], BRICK],
  [477, 3, 248, [6, 176, 28, 209], [41, 25, 0], BRICK],
  [464, 3, 200, [6, 128, 28, 161], [41, 25, 0], BRICK],
  [465, 4, 200, [4, 128, 26, 161], [33, 16, 0], BRICK],
  [1555, 4, 200, [4, 128, 26, 161], [33, 16, 0], BRICK],
  [1568, 3, 248, [6, 176, 28, 209], [41, 24, 0], BRICK],
  [1569, 3, 200, [6, 128, 28, 161], [41, 24, 0], BRICK],
  [1576, 4, 248, [4, 176, 26, 209], [33, 16, 0], BRICK],
  [1582, 3, 248, [6, 176, 28, 209], [41, 24, 0], BRICK],
  [351, 3, 200, [6, 102, 26, 149], [0, 16, 33], GREY],
  [354, 4, 248, [6, 150, 26, 197], [0, 16, 33], GREY],
  [355, 4, 248, [6, 160, 26, 207], [0, 16, 33], GREY],
  [356, 4, 239, [6, 141, 26, 188], [0, 16, 33], GREY],
  [431, 4, 248, [6, 160, 26, 207], [0, 16, 33], GREY],
  [1583, 4, 248, [6, 160, 26, 207], [0, 16, 33], GREY],
  [1586, 3, 201, [6, 103, 26, 150], [0, 16, 33], GREY],
  [1587, 4, 248, [6, 150, 26, 197], [0, 16, 33], GREY],
  [1588, 4, 239, [6, 141, 26, 188], [0, 16, 33], GREY],
  [93, 3, 201, [6, 126, 28, 160], [41, 24, 0], TIMBER],
  [96, 4, 249, [4, 175, 26, 209], [41, 24, 0], TIMBER],
  [99, 4, 240, [4, 166, 26, 200], [41, 24, 0], TIMBER],
  [116, 4, 249, [4, 175, 26, 209], [41, 25, 0], TIMBER],
  [438, 4, 248, [4, 162, 26, 196], [41, 25, 0], TIMBER],
  [46, 4, 248, [3, 184, 16, 213], [16, 16, 16], COTTAGE],
  [53, 3, 248, [16, 184, 29, 213], [16, 16, 16], COTTAGE],
  [62, 3, 212, [16, 148, 29, 177], [16, 16, 16], COTTAGE],
  // Church (Aeven): each arched window continues into a partner sprite below.
  [3, 3, 257, [25, 171, 32, 218], CHURCH_GLASS, ARCHED],
  [5, 3, 384, [25, 298, 32, 345], CHURCH_GLASS, ARCHED],
  [9, 4, 384, [23, 309, 28, 338], CHURCH_GLASS, ARCHED],
  [13, 4, 127, [0, 67, 13, 96], CHURCH_GLASS, ARCHED],
  [12, 4, 159, [3, 105, 11, 111], LANTERN_GLASS, LANTERN, LANTERN_DEFAULTS],
];

// Glass of a window owned by a neighbouring sprite on the same wall layer.
// The owner sits at (x + dx, y + dy); its settings and light cover both parts.
// These pairs are always placed together on the native maps.
const parts = [
  // graphic, layer, owner graphic, dx, dy, bitmap height, bounds, colours
  [4, 3, 3, -1, 0, 320, [0, 218, 15, 273], CHURCH_GLASS],
  [6, 3, 5, -1, 0, 515, [0, 413, 15, 468], CHURCH_GLASS],
  [10, 4, 9, 0, 1, 320, [0, 260, 6, 286], CHURCH_GLASS],
  [12, 4, 13, 0, -1, 159, [31, 92, 32, 113], CHURCH_GLASS],
];

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
