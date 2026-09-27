// Lighting catalogue for the native Endless Online graphics.
//
// Everything the lighting code knows about specific artwork lives here, so a
// different graphics pack needs a new catalogue rather than code changes.
// Graphic IDs are EMF graphics, not EGF resource IDs (those are graphic + 100).
// Verify window entries with scripts/audit-window-assets.cjs.

export const id = "eo-native";

// Indoor walls: plaster, panelled and plank rooms, curtained walls, their end
// strips and the low stubs drawn for a room's near walls. The doorways in the
// same series (380, 381, 385, 386, 391, 392, 396, 397, 405, 406, 412, 413,
// 421, 422, 425 and 426) stay open.
const indoorWalls = [
  262, 263, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374,
  375, 376, 377, 378, 379, 382, 383, 384, 387, 388, 389, 390, 393, 394, 395,
  398, 399, 400, 401, 402, 403, 404, 407, 408, 409, 410, 411, 414, 415, 416,
  417, 418, 419, 420, 423, 424, 427, 428, 429, 430,
];

// Opaque surfaces in gfx006 that block light and are shaded as upright
// surfaces. Wall layers also contain fences, posts, fires and decorations,
// which let light through and take one tint per bitmap. Walkability
// (TileSpec.Wall) is deliberately not used as an optical property.
export const solidWalls = [
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  12,
  13,
  92,
  93,
  94,
  95,
  96,
  98,
  99,
  100,
  116,
  342,
  344,
  350,
  351,
  352,
  353,
  354,
  355,
  356,
  357,
  431,
  438,
  462,
  464,
  465,
  467,
  468,
  469,
  471,
  472,
  474,
  475,
  476,
  477,
  479,
  480,
  482,
  483,
  484,
  486,
  534,
  535,
  ...indoorWalls,
];

export const chicagoAmber = { color: "#ffad46", brightness: 1.6, glow: 1.15 };

// Candle flames: warmer, dimmer and shorter-reaching than lamp glass.
const candlelight = { color: "#ffb45a", brightness: 0.9, glow: 1, radius: 3 };

// Lamps in gfx004. Anchors are screen-pixel offsets from the tile centre to
// the visible foot; source heights are measured from that foot to the centre
// of the glass or flame. For a candle on furniture or a wall shelf, the foot
// is the floor directly beneath the flame.
export const lamps = [
  {
    id: "street",
    name: "Street lamp",
    graphic: 7,
    radius: 5,
    ...chicagoAmber,
    height: 103,
    anchor: { x: -1, y: 13 },
    description: "Chicago amber along a path",
  },
  {
    id: "tall",
    name: "Tall lamp",
    graphic: 6,
    // Graphic 585 has narrower glass in the same frame.
    variants: [585],
    radius: 6,
    ...chicagoAmber,
    brightness: 1.8,
    height: 114,
    anchor: { x: -2, y: 13 },
    description: "A wider pool for an entrance",
  },
  {
    id: "lantern",
    name: "Lantern",
    graphic: 400,
    radius: 3,
    ...chicagoAmber,
    brightness: 1.1,
    height: 15,
    anchor: { x: -2, y: 9 },
    description: "A small, intimate pool",
  },
  {
    id: "garden",
    name: "Garden lantern",
    graphic: 89,
    // Graphic 90 is identical artwork under another ID; placements use 89.
    variants: [90],
    radius: 3,
    ...chicagoAmber,
    brightness: 1.1,
    height: 16,
    anchor: { x: -3, y: 7 },
    description: "A low stone lantern for paths and gardens",
  },
  {
    id: "festive-street",
    name: "Festive street lamp",
    graphic: 379,
    radius: 5,
    ...chicagoAmber,
    height: 103,
    anchor: { x: -3, y: 10 },
    description: "A street lamp dressed with a winter wreath",
  },
  {
    id: "festive-tall",
    name: "Festive tall lamp",
    graphic: 560,
    // A mirror image (565) and snow-covered copies (561, 566).
    variants: [561, 565, 566],
    radius: 6,
    ...chicagoAmber,
    brightness: 1.8,
    height: 114,
    anchor: { x: -2, y: 13 },
    description: "A tall lamp with a wreath for festive streets",
  },
  {
    id: "shelf-candle",
    name: "Shelf candle",
    graphic: 73,
    variants: [{ graphic: 74, anchor: { x: -8, y: -11 } }],
    ...candlelight,
    height: 41,
    anchor: { x: 3, y: -11 },
    description: "A candle on a wall shelf",
  },
  {
    id: "bedside-candle",
    name: "Bedside candle",
    graphic: 587,
    variants: [{ graphic: 595, anchor: { x: -2, y: -5 } }],
    ...candlelight,
    height: 45,
    anchor: { x: -3, y: -5 },
    description: "A candlestick on a small table",
  },
  {
    id: "desk-candle",
    name: "Desk candle",
    graphic: 591,
    variants: [{ graphic: 596, anchor: { x: -18, y: -1 } }],
    ...candlelight,
    height: 37,
    anchor: { x: 14, y: -1 },
    description: "A candle beside an open book",
  },
  {
    id: "cabinet-candle",
    name: "Cabinet candle",
    graphic: 660,
    variants: [{ graphic: 661, anchor: { x: -10, y: 0 } }],
    ...candlelight,
    height: 45,
    anchor: { x: 5, y: 0 },
    description: "A candle on a cabinet",
  },
  {
    id: "shrine-candle",
    name: "Shrine candle",
    graphic: 742,
    // One candle artwork on shrines of different shapes.
    variants: [
      { graphic: 743, anchor: { x: 1, y: -1 } },
      { graphic: 744, anchor: { x: -7, y: -1 } },
      { graphic: 745, anchor: { x: -1, y: -1 } },
      { graphic: 746, anchor: { x: -5, y: -1 } },
      { graphic: 747, anchor: { x: 3, y: -1 } },
      { graphic: 738, anchor: { x: -5, y: 0 }, height: 109, radius: 5 },
      { graphic: 748, anchor: { x: -4, y: 4 }, height: 32, brightness: 0.9 },
    ],
    ...candlelight,
    // High flames need more reach and strength to light the floor.
    radius: 4,
    brightness: 1.2,
    height: 85,
    anchor: { x: -4, y: -1 },
    description: "A candle burning on a stone shrine",
  },
  {
    id: "blue-brazier",
    name: "Blue brazier",
    graphic: 546,
    radius: 4,
    color: "#9cc8ff",
    brightness: 1.2,
    glow: 1,
    height: 60,
    anchor: { x: -3, y: 4 },
    description: "Cold blue fire in a silver bowl",
  },
];

// Each lamp's glass or flame in unscaled sprite pixels, inclusive. Frames,
// supports, poles and nearby props (wreaths, books, flowers) stay out of the
// emissive overlay, even where they have highlights.
const gardenLanternGlass = { left: 11, top: 17, right: 21, bottom: 22 };
const festiveTallGlass = { left: 9, top: 16, right: 21, bottom: 34 };
const festiveTallMirrorGlass = { left: 10, top: 16, right: 22, bottom: 34 };
const bedsideCandleFlame = { left: 15, top: 0, right: 20, bottom: 14 };
const shrineCandleFlame = { left: 35, top: 0, right: 39, bottom: 8 };
const shrineCandleMirrorFlame = { left: 38, top: 0, right: 42, bottom: 8 };
export const bulbGlass = new Map([
  [7, { left: 5, top: 12, right: 12, bottom: 17 }],
  [6, { left: 5, top: 15, right: 23, bottom: 33 }],
  [585, { left: 8, top: 16, right: 20, bottom: 34 }],
  [400, { left: 6, top: 16, right: 18, bottom: 35 }],
  [89, gardenLanternGlass],
  [90, gardenLanternGlass],
  [379, { left: 11, top: 16, right: 19, bottom: 21 }],
  [560, festiveTallGlass],
  [561, festiveTallGlass],
  [565, festiveTallMirrorGlass],
  [566, festiveTallMirrorGlass],
  [73, { left: 23, top: 7, right: 26, bottom: 14 }],
  [74, { left: 13, top: 7, right: 16, bottom: 14 }],
  [587, bedsideCandleFlame],
  [595, bedsideCandleFlame],
  [591, { left: 42, top: 10, right: 47, bottom: 22 }],
  [596, { left: 9, top: 10, right: 14, bottom: 22 }],
  [660, { left: 26, top: 1, right: 31, bottom: 16 }],
  [661, { left: 10, top: 1, right: 15, bottom: 16 }],
  [742, shrineCandleFlame],
  [743, shrineCandleFlame],
  [744, { left: 28, top: 0, right: 32, bottom: 8 }],
  [745, shrineCandleMirrorFlame],
  [746, { left: 29, top: 0, right: 33, bottom: 8 }],
  [747, shrineCandleMirrorFlame],
  [738, { left: 25, top: 2, right: 29, bottom: 10 }],
  [748, { left: 13, top: 0, right: 17, bottom: 8 }],
  // White flame cores only; the silver bowl and stand are excluded.
  [546, { left: 1, top: 0, right: 40, bottom: 32 }],
]);

// Moving flames, shown only in the lighting preview; the game draws these
// lamps still. Candle frames use the candles' own flame colours: wick (A),
// cream (B), amber (C), white-hot (D) and dark amber (E). A frame's top-left
// sits at (x, y) in sprite pixels and may rise above the sprite. `clear`
// (inclusive) hides a native flame that the frames replace; tapers have only
// a wick, and their flame sits on it. `mirror` flips the frames.
export const flamePalette = {
  A: [33, 33, 33],
  B: [236, 207, 119],
  C: [216, 170, 31],
  D: [249, 239, 208],
  E: [164, 129, 23],
};
// prettier-ignore
const candleFlame = [
  ["........", "........", "........", "...A....", "...ABC..", ".CDACBC.", ".CDDBCE.", ".CCBBBC."],
  ["........", "....C...", "....B...", "...ABC..", "..CADB..", ".CDADBC.", ".CDDDBE.", ".CCBBBC."],
  ["........", "........", "..C.....", "..BA....", ".CBAC...", ".CDABC..", ".CDDBCE.", ".CCBBBC."],
  ["........", "........", "........", "...A....", "...AC...", "..CABC..", ".CBDBCE.", ".CCBBBC."],
];
// The bedside candle's flame stands clear of the wax: a teardrop narrowing
// onto a short wick, so it never reads as the top of the candle.
// prettier-ignore
const standingFlame = [
  ["........", "........", "...C....", "..CBC...", ".CBDBC..", ".CDDBC..", ".CDABCE.", ".CBABC..", "..CAC...", "...A...."],
  ["....C...", "....B...", "...CBC..", "..CBDC..", ".CBDDBC.", ".CDDBCE.", ".CDABC..", "..BAB...", "..CAC...", "...A...."],
  ["........", ".C......", ".BC.....", "CBDC....", ".BDBC...", ".CDDBC..", ".CDABC..", "..BAC...", "..CAC...", "...A...."],
  ["........", "........", "........", "...C....", "..CBC...", ".CBDBC..", ".CDABC..", "..CAC...", "...A....", "...A...."],
];
// prettier-ignore
const taperFlame = [
  [".....", "..C..", ".CBC.", ".BDB.", ".BDB.", ".CAC.", "..A.."],
  ["...C.", "..CB.", ".CBC.", ".BDB.", ".BDBC", ".CAB.", "..A.."],
  [".....", ".C...", ".BC..", "CBDC.", ".BDB.", ".CAC.", "..A.."],
  [".....", ".....", ".....", "..C..", ".CDC.", ".BAB.", "..A.."],
];
const taper = (x, y) => ({ frames: taperFlame, x, y });
export const flames = new Map([
  [587, { frames: standingFlame, x: 14, y: -5, clear: [14, 0, 21, 4] }],
  [
    595,
    {
      frames: standingFlame,
      x: 14,
      y: -5,
      clear: [14, 0, 21, 4],
      mirror: true,
    },
  ],
  [660, { frames: candleFlame, x: 25, y: -1, clear: [25, 2, 32, 6] }],
  [
    661,
    { frames: candleFlame, x: 9, y: -1, clear: [9, 2, 16, 6], mirror: true },
  ],
  [591, taper(42, 5)],
  [596, taper(10, 5)],
  [73, taper(23, 1)],
  [74, taper(12, 1)],
  [742, taper(35, -6)],
  [743, taper(35, -6)],
  [744, taper(28, -6)],
  [745, taper(38, -6)],
  [746, taper(29, -6)],
  [747, taper(38, -6)],
  [738, taper(25, -4)],
  [748, taper(13, -6)],
  // The brazier's own fire, bent into frames: a sway that grows with height
  // and tongues that stretch upward. The empty bowl (545) shows beneath, and
  // the fire never covers bowl pixels that it did not already cover.
  [546, { empty: 545, count: 6, sway: 1.6, lift: 2, base: 30, margin: 3 }],
]);

// Windows in gfx006 are opaque panes painted into 32 px wall bitmaps. Within
// its bounds (left, top, right, bottom; right/bottom exclusive) each listed
// glass colour occurs only on the panes, so selecting those colours there
// gives an exact mask.

// Textured glass: the church windows' wood-grain panes and the lantern. Both
// are warm against neutral stucco and frames; the palettes do not overlap.
// prettier-ignore
const churchGlass = [
  [107, 74, 41], [123, 90, 58], [132, 99, 66], [132, 99, 74], [140, 99, 66],
  [140, 99, 74], [140, 107, 66], [140, 107, 74], [140, 107, 82], [148, 107, 66],
  [148, 107, 74], [148, 107, 82], [148, 123, 66], [148, 123, 74], [148, 123, 82],
  [148, 123, 90], [156, 123, 74], [156, 123, 82], [156, 123, 90], [156, 132, 74],
  [156, 132, 90], [156, 132, 99], [165, 132, 99], [165, 140, 99], [165, 140, 107],
];
// prettier-ignore
const lanternGlass = [
  [148, 115, 49], [148, 115, 66], [148, 115, 82], [173, 132, 66],
  [173, 132, 74], [173, 132, 82], [173, 132, 99], [173, 140, 99],
];

const BRICK = "Brick window";
const GREY = "Window";
const TIMBER = "Timber window";
const COTTAGE = "Cottage window";
const ARCHED = "Arched window";
const LANTERN = "Wall lantern";

// A fixed wall fixture: warmer and brighter than a window, lit by default.
const lanternDefaults = {
  color: "#ffad46",
  brightness: 1.1,
  glow: 1,
  radius: 4,
};

// graphic, layer, bitmap height, glass bounds, glass colour(s), name
// [, fixture defaults]
export const windows = [
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
  [3, 3, 257, [25, 171, 32, 218], churchGlass, ARCHED],
  [5, 3, 384, [25, 298, 32, 345], churchGlass, ARCHED],
  [9, 4, 384, [23, 309, 28, 338], churchGlass, ARCHED],
  [13, 4, 127, [0, 67, 13, 96], churchGlass, ARCHED],
  [12, 4, 159, [3, 105, 11, 111], lanternGlass, LANTERN, lanternDefaults],
];

// Glass of a window owned by a neighbouring sprite on the same wall layer.
// The owner sits at (x + dx, y + dy); its settings and light cover both parts.
// These pairs are always placed together on the native maps.
// graphic, layer, owner graphic, dx, dy, bitmap height, bounds, colours
export const windowParts = [
  [4, 3, 3, -1, 0, 320, [0, 218, 15, 273], churchGlass],
  [6, 3, 5, -1, 0, 515, [0, 413, 15, 468], churchGlass],
  [10, 4, 9, 0, 1, 320, [0, 260, 6, 286], churchGlass],
  [12, 4, 13, 0, -1, 159, [31, 92, 32, 113], churchGlass],
];
