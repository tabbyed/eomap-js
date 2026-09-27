const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");
const {
  createBulbMask,
  createHaloPixels,
  emissionAppearance,
} = require("../src/core/lighting/appearance/lamp-emission");
const { bulbGlass, lamps } = require("../src/core/lighting/packs/eo-native");

function sprite(width = 30, height = 140) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function pixel(image, x, y, rgba) {
  const i = (y * image.width + x) * 4;
  if (rgba) image.data.set(rgba, i);
  return [...image.data.slice(i, i + 4)];
}

test("native glass emits while metal, wood and pixels outside the glass do not", () => {
  // Palette values measured from the decoded native gfx004 lamp sprites.
  for (const [graphic, x, y] of [
    [7, 5, 12],
    [6, 5, 15],
    [585, 8, 16],
    [400, 6, 16],
    [89, 11, 17],
    [90, 11, 17],
    [379, 11, 16],
    [560, 9, 16],
    [561, 9, 16],
    [565, 10, 16],
    [566, 10, 16],
    [73, 23, 7],
    [74, 13, 7],
    [587, 15, 0],
    [595, 15, 0],
    [591, 42, 10],
    [596, 9, 10],
    [660, 26, 1],
    [661, 10, 1],
    [742, 35, 0],
    [743, 35, 0],
    [744, 28, 0],
    [745, 38, 0],
    [746, 29, 0],
    [747, 38, 0],
    [738, 25, 2],
    [748, 13, 0],
    [546, 1, 0],
  ]) {
    const source = sprite(64, 140);
    pixel(source, x, y, [255, 222, 132, 255]);
    pixel(source, x + 1, y, [214, 206, 181, 255]);
    pixel(source, x + 2, y, [82, 82, 82, 255]);
    pixel(source, x + 3, y, [197, 156, 107, 255]);
    pixel(source, 0, 0, [255, 255, 255, 255]);
    const originalPixels = source.data.slice();
    const mask = createBulbMask(source, graphic);
    assert.deepEqual(pixel(mask, x, y), [255, 255, 255, 255]);
    assert.deepEqual(pixel(mask, x + 1, y), [255, 255, 255, 255]);
    assert.equal(pixel(mask, x + 2, y)[3], 0);
    assert.equal(pixel(mask, x + 3, y)[3], 0);
    assert.equal(pixel(mask, 0, 0)[3], 0);
    assert.deepEqual(source.data, originalPixels);
  }
});

test("every lamp graphic, including variants, has exactly one emissive region", () => {
  const graphics = lamps.flatMap(({ graphic, variants = [] }) => [
    graphic,
    ...variants.map((variant) =>
      typeof variant === "number" ? variant : variant.graphic,
    ),
  ]);
  assert.equal(new Set(graphics).size, graphics.length);
  assert.deepEqual(
    [...graphics].sort((a, b) => a - b),
    [...bulbGlass.keys()].sort((a, b) => a - b),
  );
});

test("bulb masks preserve source transparency and leave unknown graphics dark", () => {
  const source = sprite();
  pixel(source, 6, 13, [255, 255, 255, 0]);
  pixel(source, 7, 13, [255, 255, 255, 80]);
  const mask = createBulbMask(source, 7);
  assert.equal(pixel(mask, 6, 13)[3], 0);
  assert.equal(pixel(mask, 7, 13)[3], 80);
  assert.ok(createBulbMask(source, 999).data.every((value) => value === 0));
});

test("halo is centred, symmetric and fades monotonically without an edge ring", () => {
  const halo = createHaloPixels();
  assert.equal(halo.width, 64);
  assert.equal(halo.height, 64);
  assert.equal(pixel(halo, 31, 31)[3], 255);
  assert.equal(pixel(halo, 0, 0)[3], 0);
  let previous = 255;
  for (let x = 32; x < 64; x++) {
    const alpha = pixel(halo, x, 31)[3];
    assert.ok(alpha <= previous);
    assert.equal(alpha, pixel(halo, 63 - x, 32)[3]);
    previous = alpha;
  }
  assert.equal(previous, 0);
  assert.throws(() => createHaloPixels(0), RangeError);
});

test("disabled, zero brightness and zero glow suppress both core and halo", () => {
  for (const settings of [{ enabled: false }, { brightness: 0 }, { glow: 0 }]) {
    const appearance = emissionAppearance({ color: "#ffcf88", ...settings });
    assert.equal(appearance.enabled, false);
    assert.equal(appearance.coreAlpha, 0);
    assert.equal(appearance.haloAlpha, 0);
  }
});

test("dimming affects both emissions and preserves the requested halo hue", () => {
  const normal = emissionAppearance({ color: "#ffcf88", brightness: 1 });
  const dim = emissionAppearance({ color: "#ffcf88", brightness: 0.25 });
  assert.equal(normal.enabled, true);
  assert.equal(normal.haloColor, 0xffcf88);
  assert.equal(normal.coreColor, 0xfff2de);
  assert.equal(dim.coreAlpha, normal.coreAlpha / 4);
  assert.equal(dim.haloAlpha, normal.haloAlpha / 4);
  const blue = emissionAppearance({ color: "#2040ff", glow: 2, brightness: 2 });
  assert.equal(blue.haloColor, 0x2040ff);
  assert.ok(blue.coreAlpha <= 1 && blue.haloAlpha <= 1);
  assert.equal(blue.coreColor & 255, 255);
});
