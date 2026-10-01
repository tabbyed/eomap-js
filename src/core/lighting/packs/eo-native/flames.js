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
const campfire = { file: 6, graphic: 597, frames: 4, rows: 24 };
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
  // The candlestick's wick tops its sprite; the flame rises above it.
  [40, taper(6, -6)],
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
  // The inn tables' candles (web-only art) have a drawn flame on the wax;
  // the taper's frames replace it, their wick on the wax's top.
  [987, { frames: taperFlame, x: 28, y: -3, clear: [29, 0, 31, 3] }],
  [
    988,
    {
      frames: taperFlame,
      x: 27,
      y: -3,
      clear: [28, 0, 30, 3],
      mirror: true,
    },
  ],
  // The brazier's own fire, bent into frames: a sway that grows with height
  // and tongues that stretch upward. The empty bowl (545) shows beneath, and
  // the fire never covers bowl pixels that it did not already cover.
  [546, { empty: 545, count: 6, sway: 1.6, lift: 2, base: 30, margin: 3 }],
  // The fireplace borrows the campfire's flames (wall 597, four frames; its
  // top 24 rows, without the logs) and shows them only through the dark
  // firebox within `window`, so the hearth's own logs and stone stay in front.
  // The hearth spans two sprites; its lamp lists the right-hand half (78) as
  // a part, which draws its share of the fire on its own tile, in step with
  // the hearth, so draw order never cuts the fire.
  [77, { fire: campfire, x: -3, y: 34, window: [14, 25, 31, 58] }],
  [78, { fire: campfire, x: -35, y: 25, window: [0, 24, 6, 56] }],
]);
