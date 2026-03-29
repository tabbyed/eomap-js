const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");

// Exercise EOMap's actual ownership, render-list and picking code without a
// browser/GPU. No renderer constructor is called; only external services are
// stubbed, while the production methods under test remain unchanged.
global.Phaser = {
  Math: { Pow2: { IsSize: () => false } },
  Textures: { Texture: class {}, TextureSource: class {}, LINEAR: 1 },
  Utils: { Array: { Remove: () => {} } },
  Display: { Canvas: { CanvasPool: {} } },
  Class: { mixin() {} },
  GameObjects: {
    GameObject: class {
      destroy() {}
    },
    Components: {},
    GameObjectFactory: { register() {} },
  },
};
const { EOMap } = require("../src/core/gameobjects/eomap");
const { EMF } = require("../src/core/data/emf");
const { defaultLighting } = require("../src/core/lighting/lamps");
const {
  WINDOW_DEFINITIONS,
  WINDOW_PARTS,
  createWindowMask,
} = require("../src/core/lighting/windows");
const { createPixelHitMask } = require("../src/core/gfx/pixel-hit-mask");

function entryFor(graphic, glassX, glassY) {
  const definition =
    WINDOW_DEFINITIONS.get(graphic) ?? WINDOW_PARTS.get(graphic);
  const { width, height } = definition;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([70, 70, 70, 255], i);
  data.set([...definition.glass[0], 255], (glassY * width + glassX) * 4);
  const pixels = { width, height, data };
  const frame = { width, height, cutX: 100, cutY: 40 };
  const entry = {
    resourceID: graphic + 100,
    loadingComplete: null,
    asset: { width, height, textureFrame: frame, getFrame: () => frame },
    hitMask: createPixelHitMask(pixels),
    refCount: 0,
    incRef() {
      this.refCount++;
    },
    decRef() {
      assert.ok(this.refCount > 0, "Texture reference released twice");
      this.refCount--;
    },
  };
  return {
    entry,
    mask: {
      mask: { windowGraphic: graphic },
      hitMask: createPixelHitMask(createWindowMask(pixels, definition)),
    },
  };
}

function makeMap() {
  const map = Object.create(EOMap.prototype);
  const section = new Set();
  Object.assign(map, {
    emf: EMF.new(20, 20, "Window regression"),
    tileGraphics: {},
    renderList: [],
    sections: [section],
    visibleSections: [section],
    sectionWidth: 1,
    sectionHeight: 1,
    dirtyRenderList: false,
    renderListChangesSinceLastTick: 0,
    selectedLayer: 3,
    animationFrame: 0,
    lightingSettings: defaultLighting(),
    lightingPreview: true,
    layerVisibility: { isLayerVisible: () => true },
    camera: {
      dirty: false,
      zoom: 1,
      scrollX: 0,
      scrollY: 0,
      width: 500,
      height: 400,
      preRender() {},
      destroy() {},
      getWorldPoint(x, y) {
        return {
          x: x / this.zoom + this.scrollX,
          y: y / this.zoom + this.scrollY,
        };
      },
    },
  });
  return map;
}

async function install(map, graphic, entry) {
  map.emf.getTile(3, 4).gfx[3] = graphic;
  map.setTileGraphic(3, 4, 3, entry);
  await Promise.resolve();
  map.rebuildRenderList();
  return map.tileGraphics[map.getTileGraphicIndex(3, 4, 3)];
}

test("render-list rebuild retains wall ownership while replacement artwork is pending", async () => {
  const map = makeMap();
  const old = entryFor(351, 20, 125);
  await install(map, 351, old.entry);
  const replacement = entryFor(477, 20, 200);
  let finish;
  replacement.entry.loadingComplete = new Promise((resolve) => {
    finish = resolve;
  });
  map.emf.getTile(3, 4).gfx[3] = 477;
  map.setTileGraphic(3, 4, 3, replacement.entry);
  map.rebuildRenderList();
  const retained = map.renderList[0];
  assert.deepEqual([retained.tileX, retained.tileY, retained.layer], [3, 4, 3]);
  assert.equal(retained.cacheEntry, old.entry);
  assert.equal(
    map.emf.getTile(retained.tileX, retained.tileY).gfx[retained.layer],
    477,
  );
  finish();
  replacement.entry.loadingComplete = null;
  await Promise.resolve();
  assert.equal(map.renderList[0].cacheEntry, replacement.entry);
  assert.deepEqual([map.renderList[0].tileX, map.renderList[0].tileY], [3, 4]);
});

function defer(entry) {
  let complete;
  entry.loadingComplete = {
    then(callback) {
      complete = callback;
    },
  };
  return () => {
    entry.loadingComplete = null;
    complete();
  };
}

test("rapid replacements release superseded assets once and keep only the newest draw", async () => {
  const map = makeMap();
  const a = entryFor(351, 20, 125).entry;
  await install(map, 351, a);
  const b = entryFor(477, 20, 200).entry;
  const c = entryFor(477, 20, 200).entry;
  const finishB = defer(b),
    finishC = defer(c);
  map.setTileGraphic(3, 4, 3, b);
  map.setTileGraphic(3, 4, 3, c);
  map.rebuildRenderList();
  assert.doesNotThrow(() => {
    finishC();
    finishB();
  });
  assert.equal(map.renderList.length, 1);
  assert.equal(map.renderList[0].cacheEntry, c);
  assert.deepEqual([a.refCount, b.refCount, c.refCount], [0, 0, 1]);
});

test("erase during replacement cancels both ownerships and prevents stale resurrection", async () => {
  const map = makeMap();
  const a = entryFor(351, 20, 125).entry;
  await install(map, 351, a);
  const b = entryFor(477, 20, 200).entry;
  const finishB = defer(b);
  map.setTileGraphic(3, 4, 3, b);
  map.setTileGraphic(3, 4, 3, null);
  assert.doesNotThrow(finishB);
  assert.equal(map.renderList.length, 0);
  assert.deepEqual([a.refCount, b.refCount], [0, 0]);
});

test("map destruction during decode releases pending assets without accessing the dead map", async () => {
  const map = makeMap();
  const a = entryFor(351, 20, 125).entry;
  await install(map, 351, a);
  const b = entryFor(477, 20, 200).entry;
  const finishB = defer(b);
  map.setTileGraphic(3, 4, 3, b);
  map.lampTextures = { destroy() {} };
  map.destroy();
  assert.doesNotThrow(finishB);
  assert.deepEqual([a.refCount, b.refCount], [0, 0]);
});

test("map reset during decode releases old ownerships without injecting a stale tile", async () => {
  const map = makeMap();
  const a = entryFor(351, 20, 125).entry;
  await install(map, 351, a);
  const b = entryFor(477, 20, 200).entry;
  const finishB = defer(b);
  map.setTileGraphic(3, 4, 3, b);
  map.initTileGraphics = () => {};
  map.cull = () => {};
  map.init();
  assert.doesNotThrow(finishB);
  assert.equal(Object.keys(map.tileGraphics).length, 0);
  assert.deepEqual([a.refCount, b.refCount], [0, 0]);
});

test("reverting a pending replacement to the displayed asset cancels redundant work", async () => {
  const map = makeMap();
  const a = entryFor(351, 20, 125).entry;
  await install(map, 351, a);
  const b = entryFor(477, 20, 200).entry;
  const finishB = defer(b);
  map.setTileGraphic(3, 4, 3, b);
  map.setTileGraphic(3, 4, 3, a);
  assert.doesNotThrow(finishB);
  assert.equal(map.renderList.length, 1);
  assert.equal(map.renderList[0].cacheEntry, a);
  assert.deepEqual([a.refCount, b.refCount], [1, 0]);
});

test("static visible maps retain their cached frame across animation ticks", async () => {
  const map = makeMap();
  const resource = entryFor(477, 20, 200);
  await install(map, 477, resource.entry);
  map.cachedFrame = { dirty: false };
  map.animationFrame = -1;
  map.updateAnimationFrame();
  assert.equal(map.cachedFrame.dirty, false);
  resource.entry.asset.animationFrames = [{}];
  map.animationFrame = -1;
  map.updateAnimationFrame();
  assert.equal(map.cachedFrame.dirty, true);
});

test("unchanged lighting and preview selection retain the map render cache", () => {
  const map = makeMap();
  let updates = 0;
  map.lightField = {
    setSettings() {
      updates++;
    },
  };
  map.cachedFrame = { dirty: false };
  map.setLighting(map.lightingSettings);
  map.setLightingPreview(true);
  assert.equal(updates, 0);
  assert.equal(map.cachedFrame.dirty, false);
  map.setLighting({ ...map.lightingSettings });
  assert.equal(updates, 1);
  assert.equal(map.cachedFrame.dirty, true);
});

test("a replacement window mask is not painted or picked over retained old artwork", async () => {
  const map = makeMap();
  const old = entryFor(351, 20, 125);
  const graphic = await install(map, 351, old.entry);
  map.emf.getTile(3, 4).gfx[3] = 477;
  let requested = 0;
  map.lampTextures = {
    getWindow() {
      requested++;
      throw new Error("Wrong mask requested before asset replacement");
    },
  };
  assert.equal(map.pickWindow(graphic.x + 20, graphic.y + 125), null);
  const target = {
    renderTarget: {},
    texture: { setFilter() {} },
    camera: { getWorldPoint: () => ({ x: 0, y: 0 }) },
    setSize() {
      return this;
    },
    clear() {
      return this;
    },
    beginDraw() {},
    endDraw() {},
  };
  map.cachedFrame = { dirty: true, renderTexture: target };
  map.drawScale = 1;
  const drawn = [];
  map.batchDrawFrame = (_target, frame) => drawn.push(frame);
  map.drawFrame();
  assert.equal(requested, 0);
  assert.deepEqual(drawn, [old.entry.asset.textureFrame]);
});

test("window glass picks on the first click after zoom and pan while frame clicks do not", async () => {
  const map = makeMap();
  const resource = entryFor(477, 20, 200);
  const graphic = await install(map, 477, resource.entry);
  map.lampTextures = { getWindow: () => resource.mask };
  map.camera.scrollX = -100;
  map.camera.scrollY = -100;
  for (const zoom of [0.5, 1, 2.5]) {
    map.camera.zoom = zoom;
    const screenX = (graphic.x + 20.5 - map.camera.scrollX) * zoom;
    const screenY = (graphic.y + 200.5 - map.camera.scrollY) * zoom;
    const picked = map.pickWindow(screenX, screenY);
    assert.equal(picked?.graphic, 477);
    assert.equal(picked?.key, "3,4,3,477");
    assert.equal(map.pickWindow(screenX - zoom, screenY), null);
  }
});

test("either half of a split church window selects and lights the one window that owns both", async () => {
  const map = makeMap();
  const owner = entryFor(3, 28, 190);
  const partner = entryFor(4, 8, 230);
  map.emf.getTile(3, 4).gfx[3] = 3;
  map.setTileGraphic(3, 4, 3, owner.entry);
  map.emf.getTile(4, 4).gfx[3] = 4;
  map.setTileGraphic(4, 4, 3, partner.entry);
  await Promise.resolve();
  map.rebuildRenderList();
  const masks = new Map([
    [WINDOW_DEFINITIONS.get(3), owner.mask],
    [WINDOW_PARTS.get(4), partner.mask],
  ]);
  map.lampTextures = { getWindow: (spec) => masks.get(spec) };
  for (const [x, glassX, glassY] of [
    [3, 28, 190],
    [4, 8, 230],
  ]) {
    const graphic = map.tileGraphics[map.getTileGraphicIndex(x, 4, 3)];
    const picked = map.pickWindow(
      graphic.x + glassX + 0.5,
      graphic.y + glassY + 0.5,
    );
    assert.equal(picked?.key, "3,4,3,3");
    assert.equal(picked?.name, "Arched window");
    // Masonry beside the glass selects nothing.
    assert.equal(map.pickWindow(graphic.x + 1.5, graphic.y + 1.5), null);
  }
  // Both halves draw a glow mask tinted by the owner's settings.
  const target = {
    renderTarget: {},
    texture: { setFilter() {} },
    camera: { getWorldPoint: () => ({ x: 0, y: 0 }) },
    setSize() {
      return this;
    },
    clear() {
      return this;
    },
    beginDraw() {},
    endDraw() {},
  };
  map.cachedFrame = { dirty: true, renderTexture: target };
  map.drawScale = 1;
  map.lightingSettings = {
    ...defaultLighting(),
    windows: {
      "3,4,3,3": {
        enabled: true,
        color: "#3366aa",
        brightness: 0.65,
        glow: 1,
        radius: 3,
      },
    },
  };
  const glows = [];
  map.batchDrawFrame = (_target, frame, _x, _y, _alpha, _graphic, tint) => {
    if (tint !== undefined) glows.push([frame.windowGraphic, tint]);
  };
  map.drawFrame();
  assert.deepEqual(glows, [
    [3, 0x3366aa],
    [4, 0x3366aa],
  ]);
});

test("opaque animated foreground pixels block selection but transparent holes reveal the window", async () => {
  const map = makeMap();
  const resource = entryFor(477, 20, 200);
  const graphic = await install(map, 477, resource.entry);
  map.lampTextures = { getWindow: () => resource.mask };
  const foregroundPixels = {
    width: 128,
    height: 64,
    data: new Uint8ClampedArray(128 * 64 * 4),
  };
  foregroundPixels.data[(40 * 128 + 52) * 4 + 3] = 255;
  const base = { width: 128, height: 64, cutX: 100, cutY: 40 };
  const foreground = {
    x: graphic.x,
    y: graphic.y + 160,
    layer: 1,
    alpha: 1,
    cacheEntry: {
      loadingComplete: null,
      hitMask: createPixelHitMask(foregroundPixels),
      asset: {
        textureFrame: base,
        getFrame: (frame) => ({
          width: 32,
          height: 64,
          cutX: 100 + frame * 32,
          cutY: 40,
        }),
      },
    },
  };
  map.renderList.push(foreground);
  map.animationFrame = 1;
  assert.equal(map.pickWindow(graphic.x + 20.5, graphic.y + 200.5), null);
  map.animationFrame = 0;
  assert.equal(
    map.pickWindow(graphic.x + 20.5, graphic.y + 200.5)?.graphic,
    477,
  );
});

test("foreground awaiting its new hit mask cannot select glass behind it", async () => {
  const map = makeMap();
  const resource = entryFor(477, 20, 200);
  const graphic = await install(map, 477, resource.entry);
  map.lampTextures = { getWindow: () => resource.mask };
  const frame = { width: 32, height: 32, cutX: 0, cutY: 0 };
  map.renderList.push({
    x: graphic.x,
    y: graphic.y + 180,
    layer: 6,
    alpha: 1,
    cacheEntry: {
      loadingComplete: null,
      hitMask: null,
      asset: { textureFrame: frame, getFrame: () => frame },
    },
  });
  assert.equal(map.pickWindow(graphic.x + 20, graphic.y + 200), null);
});
