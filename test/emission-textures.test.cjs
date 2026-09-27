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
