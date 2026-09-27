const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");
const {
  WINDOW_DEFINITIONS,
  WINDOW_PARTS,
  WINDOW_DEFAULTS,
  windowKey,
  windowAt,
  windowSource,
  windowGlassAt,
  windowGlassSprites,
  createWindowMask,
  windowSettings,
} = require("../src/core/lighting/model/windows");
const { EMF } = require("../src/core/data/emf");
const { defaultLighting } = require("../src/core/lighting/model/settings");
const { LightField } = require("../src/core/lighting/field/light-field");
const audited = require("../docs/window-assets.json");

function fixture(definition) {
  const tiles = Array.from({ length: 100 }, () => ({
    gfx: Array(9).fill(null),
  }));
  const emf = { width: 10, height: 10, getTile: (x, y) => tiles[y * 10 + x] };
  emf.getTile(4, 5).gfx[definition.layer] = definition.graphic;
  return emf;
}

// Top-left of a wall bitmap on screen, from EOMap's wall placement.
const spriteOrigin = (layer, x, y, height) => ({
  x: (x - y) * 32 + (layer === 4 ? 32 : 0),
  y: (x + y) * 16 + 31 - height,
});

test("window catalogue matches the decoded native pane audit", () => {
  assert.equal(WINDOW_DEFINITIONS.size + WINDOW_PARTS.size, audited.length);
  for (const asset of audited) {
    const spec = (asset.part ? WINDOW_PARTS : WINDOW_DEFINITIONS).get(
      asset.graphic,
    );
    assert.ok(spec, `Graphic ${asset.graphic} is catalogued`);
    assert.equal(spec.width, asset.width);
    assert.equal(spec.height, asset.height);
    assert.deepEqual(spec.bounds, asset.glassBoundsExclusive);
    assert.deepEqual(spec.glass, asset.glass);
    assert.ok(asset.glassPixels > 0);
    assert.ok(asset.occurrences.every(({ layer }) => layer === spec.layer));
    if (asset.part) {
      assert.deepEqual(asset.part, {
        owner: spec.owner,
        dx: spec.dx,
        dy: spec.dy,
      });
      // Every native placement of a partner half has its owner beside it.
      assert.deepEqual(asset.unpaired, []);
    }
  }
});

// Approximate opening height from the wall projection, in pixels. Variants of
// one family share an opening, whichever face or bitmap height they use.
const OPENING_HEIGHTS = {
  ...Object.fromEntries(
    [474, 477, 464, 465, 1555, 1568, 1569, 1576, 1582].map((g) => [g, 49]),
  ),
  ...Object.fromEntries(
    [351, 354, 356, 1586, 1587, 1588].map((g) => [g, 67.5]),
  ),
  ...Object.fromEntries([355, 431, 1583].map((g) => [g, 57.5])),
  ...Object.fromEntries([96, 99, 116].map((g) => [g, 50.5])),
  93: 51.5,
  438: 62.5,
  ...Object.fromEntries([46, 53, 62].map((g) => [g, 45.75])),
  // Church windows are measured across both halves of the split glass.
  3: 61.5,
  5: 61.5,
  9: 46.75,
  13: 43,
  12: 48.5, // Wall lantern.
};

test("every catalogued window has a pinned opening height", () => {
  assert.deepEqual(
    Object.keys(OPENING_HEIGHTS).map(Number).sort(),
    [...WINDOW_DEFINITIONS.keys()].sort(),
  );
});

test("native windows retain their identity, fixed source height and opaque wall behavior", () => {
  for (const definition of WINDOW_DEFINITIONS.values()) {
    const emf = fixture(definition);
    const key = windowKey(4, 5, definition.layer, definition.graphic);
    const settings = {
      windows: {
        [key]: {
          brightness: 1.2,
          enabled: false,
          height: 999,
          shadows: false,
          kind: "free",
          x: 99,
        },
      },
    };
    const light = windowAt(emf, settings, 4, 5, definition.layer);
    assert.equal(light.key, key);
    assert.equal(light.kind, "window");
    assert.equal(light.x, 4);
    assert.equal(light.enabled, false);
    assert.equal(light.brightness, 1.2);
    assert.equal(light.glow, definition.defaults.glow);
    assert.equal(light.shadows, true);
    assert.equal(light.height, OPENING_HEIGHTS[definition.graphic]);
    assert.equal(light.name, definition.name);
    assert.equal(light.fixture, definition.fixture);
    const wrongLayer = definition.layer === 3 ? 4 : 3;
    emf.getTile(4, 5).gfx[wrongLayer] = definition.graphic;
    assert.equal(windowAt(emf, settings, 4, 5, wrongLayer), null);
    assert.equal(windowAt(emf, settings, -1, 5, definition.layer), null);
    assert.equal(windowAt(emf, settings, 4.5, 5, definition.layer), null);
    emf.getTile(4, 5).gfx[definition.layer] = 68;
    assert.equal(windowAt(emf, settings, 4, 5, definition.layer), null);
  }
});

test("sources reproject onto the actual glass and start just outside both wall faces", () => {
  for (const definition of WINDOW_DEFINITIONS.values()) {
    const light = windowAt(fixture(definition), {}, 4, 5, definition.layer);
    const source = windowSource(light);
    const screenX = (source.x - source.y) * 32 + 32;
    const screenY = (source.x + source.y) * 16 + 16 - source.height;
    // Centre of all the window's glass on screen, including a partner half
    // placed beside its owner.
    const rects = [
      [spriteOrigin(definition.layer, 4, 5, definition.height), definition],
      ...[...WINDOW_PARTS.values()]
        .filter((part) => part.owner === definition.graphic)
        .map((part) => [
          spriteOrigin(part.layer, 4 + part.dx, 5 + part.dy, part.height),
          part,
        ]),
    ].map(([origin, { bounds }]) => [
      origin.x + bounds[0],
      origin.y + bounds[1],
      origin.x + bounds[2],
      origin.y + bounds[3],
    ]);
    const expectedX =
      (Math.min(...rects.map((r) => r[0])) +
        Math.max(...rects.map((r) => r[2]))) /
      2;
    const expectedY =
      (Math.min(...rects.map((r) => r[1])) +
        Math.max(...rects.map((r) => r[3]))) /
      2;
    assert.ok(Math.abs(screenX - expectedX) < 0.04);
    assert.ok(Math.abs(screenY - expectedY) < 0.02);
    assert.equal(source.height, light.height);
    if (definition.layer === 3) {
      assert.deepEqual([source.normalX, source.normalY], [0, 1]);
      assert.ok(source.y > 5.5 && source.y < 5.51);
      assert.equal(Math.round(source.y), 6);
    } else {
      assert.deepEqual([source.normalX, source.normalY], [1, 0]);
      assert.ok(source.x > 4.5 && source.x < 4.51);
      assert.equal(Math.round(source.x), 5);
    }
  }
});

test("emissive masks select opaque glass without repainting mullions, masonry or other matching colors", () => {
  for (const spec of [
    ...WINDOW_DEFINITIONS.values(),
    ...WINDOW_PARTS.values(),
  ]) {
    const { width, height, bounds, glass } = spec;
    const data = new Uint8ClampedArray(width * height * 4);
    const [left, top, right, bottom] = bounds;
    const set = (x, y, rgba) => data.set(rgba, (y * width + x) * 4);
    const read = (mask, x, y) =>
      Array.from(mask.data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
    // Some glass regions are one pixel wide, so vary rows within the bounds.
    set(left, top, [...glass[0], 255]);
    set(left, top + 1, [...glass.at(-1), 128]); // Any colour of textured glass.
    set(left, top + 2, [...glass[0], 0]);
    set(left, top + 3, [160, 160, 160, 255]); // Solid window frame.
    set(left - 1, top, [...glass[0], 255]);
    set(right, top, [...glass[0], 255]);
    set(left, bottom, [...glass[0], 255]);
    const before = data.slice();
    const mask = createWindowMask({ width, height, data }, spec);
    assert.deepEqual(read(mask, left, top), [255, 255, 255, 255]);
    assert.deepEqual(read(mask, left, top + 1), [255, 255, 255, 128]);
    for (const [x, y] of [
      [left, top + 2],
      [left, top + 3],
      [left - 1, top],
      [right, top],
      [left, bottom],
    ])
      assert.deepEqual(read(mask, x, y), [0, 0, 0, 0]);
    assert.deepEqual(data, before);
  }
  assert.throws(
    () => createWindowMask({ width: 32, height: 248, data: [] }, 474),
    TypeError,
  );
  const unknown = createWindowMask(
    { width: 1, height: 1, data: new Uint8ClampedArray([33, 16, 0, 255]) },
    474,
  );
  assert.deepEqual(Array.from(unknown.data), [0, 0, 0, 0]);
});

test("split church windows light as one window and the wall lantern keeps its own settings", () => {
  const emf = EMF.new(10, 10, "Church");
  // Down-face pair: the partner (4) sits one tile along x from its owner (3).
  emf.getTile(4, 5).gfx[3] = 3;
  emf.getTile(5, 5).gfx[3] = 4;
  // Right-face pair 13|12, with the lantern on 12.
  emf.getTile(6, 4).gfx[4] = 13;
  emf.getTile(6, 5).gfx[4] = 12;
  const ownerKey = windowKey(4, 5, 3, 3);
  const settings = {
    ...defaultLighting(),
    windows: { [ownerKey]: { ...WINDOW_DEFAULTS, color: "#3366aa" } },
  };
  const [own] = windowGlassAt(emf, settings, 4, 5, 3);
  const [part] = windowGlassAt(emf, settings, 5, 5, 3);
  assert.equal(own.light.key, ownerKey);
  assert.equal(part.light.key, ownerKey);
  assert.equal(part.light.color, "#3366aa");
  assert.equal(part.spec, WINDOW_PARTS.get(4));
  // The partner half has no light of its own, so no second spill source.
  assert.equal(windowAt(emf, settings, 5, 5, 3), null);
  assert.deepEqual(
    windowGlassSprites(emf, own.light).map(({ x, y }) => [x, y]),
    [
      [4, 5],
      [5, 5],
    ],
  );
  const glass = windowGlassAt(emf, settings, 6, 5, 4);
  assert.deepEqual(
    glass.map(({ light }) => light.name),
    ["Wall lantern", "Arched window"],
  );
  const [lantern, window] = glass.map(({ light }) => light);
  assert.equal(lantern.fixture, "lantern");
  assert.equal(lantern.color, "#ffad46");
  assert.equal(lantern.key, windowKey(6, 5, 4, 12));
  assert.equal(window.key, windowKey(6, 4, 4, 13));
  // Two windows and one lantern: three sources, none for partner halves.
  const field = new LightField(emf, settings);
  assert.deepEqual(
    [...field.sources.values()].map((light) => light.key).sort(),
    [ownerKey, lantern.key, window.key].sort(),
  );
  // Without its owner beside it, a partner half stays dark and unpickable.
  emf.getTile(4, 5).gfx[3] = 7;
  assert.deepEqual(windowGlassAt(emf, settings, 5, 5, 3), []);
});

test("window settings validate editor bounds and omit surface geometry from persistence", () => {
  assert.deepEqual(
    windowSettings({
      ...WINDOW_DEFAULTS,
      color: "#FFD495",
      height: 100,
      layer: 3,
      shadows: false,
    }),
    {
      enabled: true,
      color: "#ffd495",
      brightness: 0.65,
      glow: 0.85,
      radius: 3.5,
    },
  );
  for (const invalid of [
    null,
    {},
    { ...WINDOW_DEFAULTS, enabled: 1 },
    { ...WINDOW_DEFAULTS, color: "amber" },
  ])
    assert.throws(() => windowSettings(invalid), TypeError);
  for (const patch of [
    { brightness: -1 },
    { brightness: Infinity },
    { glow: null },
    { glow: "1" },
    { glow: 3 },
    { radius: 0 },
    { radius: 7 },
  ])
    assert.throws(
      () => windowSettings({ ...WINDOW_DEFAULTS, ...patch }),
      RangeError,
    );
});
