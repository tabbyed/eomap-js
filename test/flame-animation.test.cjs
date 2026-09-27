const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");
global.Phaser = {
  Math: { Pow2: { IsSize: () => false } },
  Textures: { Texture: class {}, TextureSource: class {}, LINEAR: 1 },
  Utils: { Array: { Remove: () => {} } },
  Display: { Canvas: { CanvasPool: {} } },
  Class: { mixin() {} },
  BlendModes: { ADD: 1 },
  GameObjects: {
    GameObject: class {
      destroy() {}
    },
    Components: {},
    GameObjectFactory: { register() {} },
  },
};
const {
  FLAMES,
  createFlameAnimation,
  flameFlicker,
  flameFrame,
  flameStep,
} = require("../src/core/lighting/appearance/flame-animation");
const { flamePalette } = require("../src/core/lighting/packs/eo-native");
const { lampAt, lampPreset } = require("../src/core/lighting/model/lamps");
const {
  emissionAppearance,
} = require("../src/core/lighting/appearance/lamp-emission");
const { partOf } = require("../src/core/lighting/model/parts");
const { Layer } = require("../src/core/data/layer");
const { EOMap } = require("../src/core/gameobjects/eomap");
const {
  LightingRenderer,
} = require("../src/core/gameobjects/lighting-renderer");
const { EMF } = require("../src/core/data/emf");
const {
  defaultLighting,
  withLight,
} = require("../src/core/lighting/model/settings");

function sprite(width, height, fill = [90, 60, 30, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(fill, i);
  return { width, height, data };
}

const alpha = (pixels, x, y) => pixels.data[(y * pixels.width + x) * 4 + 3];
const colour = (pixels, x, y) => {
  const i = (y * pixels.width + x) * 4;
  return [...pixels.data.slice(i, i + 3)];
};

test("every moving flame belongs to a lamp and uses only its palette", () => {
  for (const [graphic, spec] of FLAMES) {
    // A part's flame belongs to the lamp that lists it as a part.
    const lamp =
      lampPreset(graphic) ?? lampPreset(partOf(Layer.Objects, graphic)?.owner);
    assert.ok(lamp, `Graphic ${graphic} belongs to no lamp`);
    if (spec.empty || spec.fire) continue;
    assert.ok(spec.frames.length >= 2);
    const width = spec.frames[0][0].length,
      height = spec.frames[0].length;
    for (const rows of spec.frames) {
      assert.equal(rows.length, height);
      for (const row of rows) {
        assert.equal(row.length, width);
        for (const key of row) assert.ok(key === "." || flamePalette[key]);
      }
    }
  }
});

test("a candle's native flame is cleared and replaced by frames that glow only where hot", () => {
  const pixels = sprite(36, 64);
  const { base, frames } = createFlameAnimation(pixels, 587);
  const [left, top, right, bottom] = FLAMES.get(587).clear;
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 36; x++) {
      const inside = x >= left && x <= right && y >= top && y <= bottom;
      assert.equal(alpha(base, x, y), inside ? 0 : 255);
    }
  assert.deepEqual(pixels.data, sprite(36, 64).data);
  assert.equal(frames.length, 4);
  const rows = FLAMES.get(587).frames[1];
  const frame = frames[1];
  assert.deepEqual([frame.x, frame.y], [14, -5]);
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[0].length; x++) {
      const key = rows[y][x];
      assert.equal(alpha(frame.flame, x, y), key === "." ? 0 : 255);
      if (key !== ".")
        assert.deepEqual(colour(frame.flame, x, y), flamePalette[key]);
      // Cream and white-hot pixels glow; wick and amber stay unlit.
      assert.equal(
        alpha(frame.core, x, y),
        key === "B" || key === "D" ? 255 : 0,
      );
    }
});

test("a mirror-image candle's flames are its partner's, flipped", () => {
  const own = createFlameAnimation(sprite(36, 64), 587).frames;
  const mirror = createFlameAnimation(sprite(36, 64), 595).frames;
  for (let f = 0; f < own.length; f++) {
    const { width, height } = own[f].flame;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        assert.deepEqual(
          colour(mirror[f].flame, x, y),
          colour(own[f].flame, width - 1 - x, y),
        );
  }
});

test("tapers keep their wick and whole sprite, with the flame drawn above", () => {
  const pixels = sprite(78, 98);
  const { base, frames } = createFlameAnimation(pixels, 742);
  assert.deepEqual(base.data, pixels.data);
  assert.ok(frames.every((frame) => frame.y < 0));
});

test("the bent brazier fire moves but never covers bowl it left showing", () => {
  // A 12 x 20 lit sprite over a 12 x 10 empty bowl, bottom-aligned. Fire fills
  // the top rows and the bowl's middle; the bowl's rims stay uncovered.
  const empty = sprite(12, 10, [0, 0, 0, 0]);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 12; x++)
      empty.data.set(
        x < 2 || x > 9 ? [120, 120, 120, 255] : [40, 40, 40, 255],
        (y * 12 + x) * 4,
      );
  const lit = sprite(12, 20, [0, 0, 0, 0]);
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 12; x++) {
      const i = (y * 12 + x) * 4;
      if (y >= 10)
        lit.data.set(
          empty.data.subarray(
            ((y - 10) * 12 + x) * 4,
            ((y - 10) * 12 + x) * 4 + 4,
          ),
          i,
        );
      if (y < 16 && x >= 2 && x <= 9)
        lit.data.set(x % 3 ? [158, 189, 226, 255] : [255, 255, 255, 255], i);
    }
  const { base, frames } = createFlameAnimation(lit, 546, { empty });
  const spec = FLAMES.get(546);
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 12; x++) {
      const expected = y >= 10 ? colour(empty, x, y - 10) : null;
      assert.equal(alpha(base, x, y), expected ? 255 : 0);
      if (expected) assert.deepEqual(colour(base, x, y), expected);
    }
  assert.equal(frames.length, spec.count);
  const fire = new Set(["158,189,226", "255,255,255"]);
  let moved = false;
  for (const frame of frames) {
    assert.deepEqual([frame.x, frame.y], [0, -spec.margin]);
    for (let row = 0; row < frame.flame.height; row++)
      for (let x = 0; x < 12; x++) {
        if (!alpha(frame.flame, x, row)) continue;
        const y = row - spec.margin;
        assert.ok(fire.has(colour(frame.flame, x, row).join()));
        // Rims (grey) never gain fire; only native fire positions or air do.
        assert.ok(
          !(y >= 10 && (x < 2 || x > 9)),
          `Fire covered rim at ${x},${y}`,
        );
        assert.equal(
          alpha(frame.core, x, row) > 0,
          colour(frame.flame, x, row).join() === "255,255,255",
        );
        if (y < 0) moved = true;
      }
  }
  assert.ok(moved, "No frame lifted the fire above the sprite");
});

test("a fireplace borrows fire that shows only through its dark firebox", () => {
  // A 32 x 67 hearth: light stone everywhere, a dark firebox inside the
  // window, and light logs across its foot.
  const hearth = sprite(32, 67, [150, 150, 150, 255]);
  const [left, top, right, bottom] = FLAMES.get(77).window;
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++)
      hearth.data.set(
        y > 50 ? [140, 90, 40, 255] : [40, 40, 40, 255],
        (y * 32 + x) * 4,
      );
  // Four 61-px campfire frames: bright flame everywhere except a dark log.
  const campfire = sprite(244, 57, [255, 160, 40, 255]);
  for (let x = 0; x < 244; x++)
    campfire.data.set([60, 30, 10, 255], (5 * 244 + x) * 4);
  const { base, frames } = createFlameAnimation(hearth, 77, { fire: campfire });
  assert.equal(base, null, "the hearth has no native flame to hide");
  assert.equal(frames.length, 4);
  const spec = FLAMES.get(77);
  for (const frame of frames) {
    assert.deepEqual([frame.x, frame.y], [left, top]);
    let fire = 0;
    for (let y = 0; y < frame.flame.height; y++)
      for (let x = 0; x < frame.flame.width; x++) {
        if (!alpha(frame.flame, x, y)) continue;
        fire++;
        const sy = top + y - spec.y;
        // Only firebox pixels within the borrowed rows, never stone or logs,
        // and never the campfire's own log colour.
        assert.ok(top + y <= 50, "fire covered the logs");
        assert.ok(sy >= 0 && sy < spec.fire.rows && sy !== 5);
        assert.deepEqual(colour(frame.flame, x, y), [255, 160, 40]);
        assert.equal(alpha(frame.core, x, y), 0, "amber fire is not white-hot");
      }
    assert.ok(fire > 0);
  }
});

test("a fireplace's two halves resolve to one lamp and place together", () => {
  const {
    lampAt,
    lampOwning,
    lampTiles,
  } = require("../src/core/lighting/model/lamps");
  const emf = EMF.new(10, 10, "Hearth");
  emf.getTile(4, 3).gfx[1] = 77;
  emf.getTile(5, 3).gfx[1] = 78;
  const lighting = defaultLighting();
  assert.equal(
    lampAt(emf, lighting, 5, 3),
    null,
    "a part is never its own light",
  );
  assert.equal(lampOwning(emf, lighting, 5, 3).key, "4,3,77");
  assert.equal(lampOwning(emf, lighting, 4, 3).key, "4,3,77");
  emf.getTile(4, 3).gfx[1] = 0;
  assert.equal(lampOwning(emf, lighting, 5, 3), null, "orphaned half");
  assert.deepEqual(lampTiles(lampPreset(77), 7, 2), [
    { x: 7, y: 2, graphic: 77 },
    { x: 8, y: 2, graphic: 78 },
  ]);
});

test("the flicker clock steps unevenly and flames never hold a shape for two steps", () => {
  const lengths = new Set();
  let start = 0;
  for (let t = 1; t < 5000; t++)
    if (flameStep(t) !== flameStep(t - 1)) {
      assert.equal(flameStep(t), flameStep(t - 1) + 1);
      if (start) lengths.add(t - start);
      start = t;
    }
  assert.ok(lengths.size > 3);
  assert.ok(Math.min(...lengths) >= 120 && Math.max(...lengths) <= 190);
  for (const key of ["4,5,587", "4,6,587", "12,1,546"])
    for (const count of [4, 6])
      for (let step = 1; step < 400; step++) {
        const frame = flameFrame(key, step, count);
        assert.ok(frame >= 0 && frame < count);
        assert.notEqual(frame, flameFrame(key, step - 1, count));
        const flicker = flameFlicker(key, step);
        assert.ok(flicker >= 0.78 && flicker <= 1.12);
      }
  const a = [],
    b = [];
  for (let step = 0; step < 50; step++) {
    a.push(flameFrame("4,5,587", step, 4));
    b.push(flameFrame("4,6,587", step, 4));
  }
  assert.notDeepEqual(a, b);
});

function makeMap() {
  const map = Object.create(EOMap.prototype);
  Object.assign(map, {
    emf: EMF.new(10, 10, "Flames"),
    renderList: [],
    animationFrame: 0,
    cachedFrame: { dirty: false },
  });
  map.lighting = new LightingRenderer(map, {}, null);
  map.lighting.settings = defaultLighting();
  const flame = {
    base: "base",
    frames: [0, 1, 2, 3].map((i) => ({
      x: 14,
      y: -3,
      flame: `flame${i}`,
      core: `core${i}`,
    })),
  };
  map.lighting.textures = {
    get: () => ({ mask: "mask", halo: "halo" }),
    getFlame: () => flame,
    getWindow: () => null,
  };
  return map;
}

function candle(map, graphic = 587) {
  map.emf.getTile(4, 5).gfx[1] = graphic;
  const tileGraphic = {
    layer: 1,
    tileX: 4,
    tileY: 5,
    alpha: 1,
    cacheEntry: {
      resourceID: graphic + 100,
      loadingComplete: null,
      asset: { getFrame: () => "art" },
    },
  };
  map.renderList.push(tileGraphic);
  return tileGraphic;
}

// Draw one frame through the real drawFrame, with the GPU batch stubbed.
function drawOnce(map) {
  Object.assign(map, {
    drawScale: 1,
    camera: {
      width: 320,
      height: 240,
      zoom: 1,
      scrollX: 0,
      scrollY: 0,
      preRender() {},
      getWorldPoint: () => ({ x: 0, y: 0 }),
    },
    cachedFrame: {
      dirty: true,
      renderTexture: {
        renderTarget: {},
        renderer: { setBlendMode() {} },
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
      },
    },
    batchDrawFrame() {},
  });
  map.drawFrame();
}

test("flames redraw the map only while its last frame showed one, once per step", () => {
  const map = makeMap();
  const step = (n) => {
    let t = 0;
    while (flameStep(t) < n) t += 10;
    return t;
  };
  map.lighting.enabled = true;
  map.lighting.flameStep = flameStep(step(10));
  drawOnce(map);
  map.updateAnimationFrame(step(11));
  assert.equal(map.cachedFrame.dirty, false, "no flame in view");
  candle(map);
  drawOnce(map);
  map.updateAnimationFrame(step(12));
  assert.equal(map.cachedFrame.dirty, true);
  map.cachedFrame.dirty = false;
  map.updateAnimationFrame(step(12) + 1);
  assert.equal(map.cachedFrame.dirty, false, "same step");
  map.lighting.enabled = false;
  drawOnce(map);
  map.updateAnimationFrame(step(13));
  assert.equal(map.cachedFrame.dirty, false, "lighting hidden");
});

test("a lit candle draws its flameless base with the current frame; switched off, the game's art", () => {
  const map = makeMap();
  map.lighting.enabled = true;
  const graphic = candle(map);
  const target = { renderTarget: {} };
  const lit = map.lighting.prepare(target, graphic);
  assert.equal(lit.art, "base");
  assert.equal(lit.flickers, true);
  const [flame, core] = lit.overlays;
  assert.ok(/^flame\d$/.test(flame.frame));
  assert.equal(core.frame, flame.frame.replace("flame", "core"));
  // The halo flickers with the flame.
  const lamp = lampAt(map.emf, map.lighting.settings, 4, 5);
  const flicker = lit.halo.alpha / emissionAppearance(lamp).haloAlpha;
  assert.ok(flicker >= 0.78 && flicker <= 1.12);
  const drawn = [];
  map.batchDrawFrame = (_target, frame, x, y, alpha, _graphic, tint) =>
    drawn.push({ frame, x, y, alpha, tint });
  graphic.x = 100;
  graphic.y = 50;
  map.lighting.drawOnTop(target, graphic, lit, 0, 0);
  assert.deepEqual(drawn[0], {
    frame: flame.frame,
    x: 114,
    y: 47,
    alpha: 1,
    tint: 0xffffff,
  });
  assert.equal(drawn[1].frame, core.frame);
  assert.ok(drawn[1].alpha <= 1);

  map.lighting.settings = withLight(map.lighting.settings, lamp, {
    ...lamp,
    enabled: false,
  });
  assert.equal(map.lighting.prepare(target, graphic), null);
});

test("a fireplace's right-hand half draws its share of the fire in step with its owner", () => {
  const map = makeMap();
  map.lighting.enabled = true;
  const owner = candle(map, 77);
  map.emf.getTile(5, 5).gfx[1] = 78;
  const part = {
    layer: 1,
    tileX: 5,
    tileY: 5,
    alpha: 1,
    cacheEntry: { resourceID: 178, loadingComplete: null, asset: {} },
  };
  const target = { renderTarget: {} };
  for (let step = 0; step < 20; step++) {
    map.lighting.flameStep = step;
    const own = map.lighting.prepare(target, owner);
    const share = map.lighting.prepare(target, part);
    // The same frame, core and flicker: the halves never disagree.
    assert.deepEqual(share.overlays, own.overlays);
    assert.equal(share.flickers, true);
    assert.ok(own.halo);
    assert.equal(share.halo, null, "only the owner draws the halo");
  }
  map.emf.getTile(4, 5).gfx[1] = 0;
  assert.equal(map.lighting.prepare(target, part), null, "orphaned half");
});
