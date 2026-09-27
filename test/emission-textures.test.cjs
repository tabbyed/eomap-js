const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");
global.Phaser = { Textures: { LINEAR: 1, NEAREST: 0 } };
const {
  EmissionTextures,
} = require("../src/core/gameobjects/emission-textures");

function fixture() {
  const loads = [],
    textures = [],
    removed = [];
  let invalidations = 0;
  const cache = new EmissionTextures(
    { textures: { remove: (key) => removed.push(key) } },
    {
      resourceInfo: () => ({}),
      loadResource(file, id) {
        return new Promise((resolve) => loads.push({ file, id, resolve }));
      },
    },
    () => invalidations++,
  );
  // Replace only the GPU/DOM upload, retaining production async/cache logic.
  cache.createTexture = (key, pixels) => {
    const frame = { key, pixels };
    textures.push(frame);
    cache.keys.push(key);
    return frame;
  };
  return {
    cache,
    loads,
    textures,
    removed,
    invalidations: () => invalidations,
  };
}

function pixels(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

test("many placements share one decode/upload and one halo per lamp type", async () => {
  const f = fixture();
  for (let i = 0; i < 30; i++) assert.equal(f.cache.get(7), null);
  assert.equal(f.loads.length, 1);
  f.loads[0].resolve(pixels(17, 119));
  await Promise.resolve();
  const first = f.cache.get(7);
  assert.ok(first);
  assert.equal(f.textures.length, 2);
  for (let i = 0; i < 30; i++) assert.equal(f.cache.get(7), first);
  f.cache.get(6);
  f.loads[1].resolve(pixels(30, 140));
  await Promise.resolve();
  assert.equal(f.cache.get(6).halo, first.halo);
  assert.equal(f.textures.length, 3);
  assert.equal(f.invalidations(), 2);
});

test("a moving flame decodes its sprites once and uploads its base and every frame", async () => {
  const f = fixture();
  for (let i = 0; i < 10; i++) assert.equal(f.cache.getFlame(587), null);
  assert.equal(f.loads.length, 1);
  f.loads[0].resolve(pixels(36, 64));
  await Promise.resolve();
  await Promise.resolve();
  const candle = f.cache.getFlame(587);
  assert.equal(candle.frames.length, 4);
  // One base, then a colour image and a glow mask per frame.
  assert.equal(f.textures.length, 1 + 4 * 2);
  assert.equal(f.cache.getFlame(587), candle);
  // The brazier also needs its empty bowl.
  f.cache.getFlame(546);
  assert.deepEqual(
    f.loads.slice(1).map(({ id }) => id),
    [646, 645],
  );
  assert.equal(f.cache.getFlame(7), null);
  assert.equal(f.invalidations(), 1);
});

test("a fireplace loads its hearth and the fire it borrows, each from its own file", async () => {
  const f = fixture();
  assert.equal(f.cache.getFlame(77), null);
  // The hearth from the objects file, the campfire from the walls file.
  assert.deepEqual(
    f.loads.map(({ file, id }) => [file, id]),
    [
      [4, 177],
      [6, 697],
    ],
  );
  // A dark firebox, and four frames of bright campfire.
  const hearth = pixels(32, 67);
  for (let i = 0; i < hearth.data.length; i += 4)
    hearth.data.set([20, 16, 12, 255], i);
  const campfire = pixels(160, 30);
  for (let i = 0; i < campfire.data.length; i += 4)
    campfire.data.set([240, 150, 40, 255], i);
  f.loads[0].resolve(hearth);
  f.loads[1].resolve(campfire);
  await new Promise(setImmediate);
  const fire = f.cache.getFlame(77);
  assert.equal(fire.base, null, "the hearth's own art stays; no base");
  assert.equal(fire.frames.length, 4);
  assert.equal(f.textures.length, 4 * 2);
  assert.ok(fire.frames.every(({ flame }) => flame.pixels.data.some(Boolean)));
});

test("closing the map during flame decode creates no late GPU resources", async () => {
  const f = fixture();
  f.cache.getFlame(587);
  f.cache.destroy();
  f.loads[0].resolve(pixels(36, 64));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.textures.length, 0);
  assert.equal(f.invalidations(), 0);
  assert.equal(f.cache.getFlame(587), null);
});

test("closing the map during lamp/window decode creates no late GPU resources", async () => {
  const f = fixture();
  f.cache.get(7);
  f.cache.getWindow(474);
  f.cache.destroy();
  f.loads[0].resolve(pixels(17, 119));
  f.loads[1].resolve(pixels(32, 248));
  await Promise.resolve();
  assert.equal(f.textures.length, 0);
  assert.equal(f.invalidations(), 0);
  assert.equal(f.cache.get(7), null);
  assert.equal(f.cache.getWindow(474), null);
  assert.doesNotThrow(() => f.cache.destroy());
  assert.equal(f.loads.length, 2);
});
