const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");
global.Phaser = {
  Math: { Pow2: { IsSize: () => false } },
  Textures: { Texture: class {}, TextureSource: class {} },
  Utils: { Array: { Remove: () => {} } },
  Display: { Canvas: { CanvasPool: {} } },
};
const {
  TextureCache,
  EvictingTextureCache,
} = require("../src/core/gfx/texture-cache");
const { pixelHit } = require("../src/core/gfx/pixel-hit-mask");

function cacheFixture() {
  const cache = Object.create(TextureCache.prototype);
  let decodes = 0;
  const pixels = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([1, 2, 3, 255, 0, 0, 0, 0]),
  };
  Object.assign(cache, {
    entries: new Map(),
    pending: [],
    scene: { textures: { game: {} } },
    gfxLoader: {
      async loadResource() {
        decodes++;
        return pixels;
      },
    },
    assetFactory: {
      getDefault: () => ({}),
      createResource: () => ({ animationFrames: [] }),
    },
    multiTexture: { key: "test-atlas" },
    handleJumboEntry: () => false,
    findSpace(entry) {
      entry.bin = { x: 0, y: 0 };
      entry.page = { texturePage: { draw() {} } };
      return true;
    },
  });
  return { cache, decodes: () => decodes };
}

test("palette and floor decodes allocate no hit masks; foreground opt-in retains pixel alpha", async () => {
  const { cache } = cacheFixture();
  for (const file of [3, 4, 5, 6, 7]) {
    const palette = cache.getResource(file, 101);
    await cache.loadEntry(palette);
    assert.equal(palette.hitMask, null);
  }
  const foreground = cache.getResource(6, 574, true);
  await cache.loadEntry(foreground);
  assert.equal(pixelHit(foreground.hitMask, 0, 0), true);
  assert.equal(pixelHit(foreground.hitMask, 1, 0), false);
  assert.equal(foreground.hitMask.bits.length, 1);
});

test("a loaded floor reused as Top builds one deduplicated foreground mask", async () => {
  const { cache, decodes } = cacheFixture();
  const floor = cache.getResource(3, 101);
  await cache.loadEntry(floor);
  assert.equal(decodes(), 1);
  assert.equal(floor.hitMask, null);
  assert.equal(cache.getResource(3, 101, true), floor);
  const ready = floor.hitMaskPending;
  assert.ok(ready);
  for (let i = 0; i < 20; i++) cache.getResource(3, 101, true);
  await ready;
  assert.equal(decodes(), 2);
  assert.equal(pixelHit(floor.hitMask, 0, 0), true);
  cache.getResource(3, 101, true);
  assert.equal(decodes(), 2);
});

test("late hit-mask completion does not populate an evicted or destroyed entry", async () => {
  for (const destroy of [false, true]) {
    const { cache } = cacheFixture();
    const entry = cache.getResource(3, 101);
    await cache.loadEntry(entry);
    let complete;
    cache.gfxLoader.loadResource = () =>
      new Promise((resolve) => {
        complete = resolve;
      });
    cache.getResource(3, 101, true);
    const ready = entry.hitMaskPending;
    if (destroy) cache.scene.textures.game = null;
    else cache.entries.delete(entry.key);
    complete({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 255]),
    });
    await ready;
    assert.equal(entry.hitMask, null);
  }
});

test("eviction never destroys the shared default frame of an in-flight decode", () => {
  const cache = Object.create(EvictingTextureCache.prototype);
  const pending = { refCount: 0, loadingComplete: Promise.resolve() };
  const ready = { refCount: 0, loadingComplete: null };
  const referenced = { refCount: 1, loadingComplete: null };
  cache.entries = new Map([
    ["pending", pending],
    ["ready", ready],
    ["referenced", referenced],
  ]);
  cache.jumboEntries = [];
  const removed = [];
  cache.evictEntry = (key) => {
    removed.push(key);
    cache.entries.delete(key);
  };
  cache.evict();
  assert.deepEqual(removed, ["ready"]);
  assert.equal(cache.entries.get("pending"), pending);
});
