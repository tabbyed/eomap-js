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
