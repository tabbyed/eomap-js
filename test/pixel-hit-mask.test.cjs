const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");

const {
  createPixelHitMask,
  pixelHit,
} = require("../src/core/gfx/pixel-hit-mask");

test("alpha threshold is packed across byte and non-aligned row boundaries", () => {
  const pixels = {
    width: 11,
    height: 3,
    data: new Uint8ClampedArray(11 * 3 * 4),
  };
  const alpha = [0, 127, 128, 255];
  for (let i = 0; i < 33; i++) pixels.data[i * 4 + 3] = alpha[i % 4];
  pixels.data[32 * 4 + 3] = 128;
  const mask = createPixelHitMask(pixels);
  assert.equal(mask.bits.byteLength, Math.ceil(33 / 8));
  assert.deepEqual([...mask.bits], [0xcc, 0xcc, 0xcc, 0xcc, 1]);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 11; x++) {
      const i = y * 11 + x;
      assert.equal(pixelHit(mask, x, y), i === 32 || i % 4 >= 2);
    }
  }
});

test("fractional coordinates select a pixel without wrapping outside the resource", () => {
  const pixels = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
  pixels.data[15] = 255;
  const mask = createPixelHitMask(pixels);
  assert.equal(pixelHit(mask, 1, 1), true);
  assert.equal(pixelHit(mask, 1.999, 1.999), true);
  assert.equal(pixelHit(mask, 0.999, 1), false);
  for (const [x, y] of [
    [-0.1, 1],
    [1, -0.1],
    [2, 1],
    [1, 2],
    [NaN, 1],
    [1, Infinity],
  ])
    assert.equal(pixelHit(mask, x, y), false);
  assert.equal(pixelHit(null, 0, 0), false);
  assert.equal(pixelHit(undefined, 0, 0), false);
});

test("the compact mask remains usable after decoded pixels change or are released", () => {
  const pixels = { width: 17, height: 1, data: new Uint8ClampedArray(17 * 4) };
  pixels.data[3] = 255;
  pixels.data[16 * 4 + 3] = 255;
  const mask = createPixelHitMask(pixels);
  pixels.data.fill(0);
  pixels.data = null;
  assert.equal(mask.bits.byteLength, 3);
  assert.equal(pixelHit(mask, 0, 0), true);
  assert.equal(pixelHit(mask, 16, 0), true);
  assert.equal(pixelHit(mask, 8, 0), false);
});

test("incomplete or invalid RGBA resources cannot produce misleading hit masks", () => {
  for (const pixels of [
    null,
    { width: 0, height: 1, data: [] },
    { width: 1.5, height: 1, data: new Uint8Array(8) },
    { width: 2, height: 2, data: new Uint8Array(15) },
  ])
    assert.throws(() => createPixelHitMask(pixels), /complete RGBA/);
});
