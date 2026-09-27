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
    id: "candlestick",
    name: "Candlestick",
    graphic: 40,
    ...candlelight,
    // The flame stands higher than a table candle's, so it reaches further.
    radius: 3.5,
    height: 51,
    anchor: { x: -2, y: 7 },
    description: "A tall iron candlestick, as in Aeven's church",
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
  {
    id: "fireplace",
    name: "Fireplace",
    graphic: 77,
    // The hearth's right-hand half is its own sprite on the next tile.
    parts: [{ graphic: 78, dx: 1, dy: 0 }],
    radius: 5,
    color: "#ff9a3c",
    brightness: 1.5,
    glow: 1,
    height: 12,
    anchor: { x: 8, y: 7 },
    description: "A log fire in a stone hearth",
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
  [40, { left: 6, top: 0, right: 10, bottom: 8 }],
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
  // The hearth has no fire drawn; its glow comes from its moving flames.
  [77, { left: 14, top: 25, right: 31, bottom: 58 }],
]);
