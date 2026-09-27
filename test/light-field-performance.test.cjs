require("../scripts/register-core.cjs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { EMF } = require("../src/core/data/emf");
const {
  LightField,
  HEIGHT_LEVELS,
  HEIGHT_STEP,
} = require("../src/core/lighting/light-field");
const { WallGrid } = require("../src/core/lighting/walls");
const { lightSource } = require("../src/core/lighting/light-geometry");
const {
  defaultLighting,
  FREE_LIGHT_PRESET,
  lampAt,
  freeLightAt,
  lightSettings,
  withLight,
} = require("../src/core/lighting/lamps");
const { windowAt } = require("../src/core/lighting/windows");

// Deliberately exhaustive reference: visit every sample and height band rather
// than using the production source bounds or cached height terms.
function referenceValues(emf, lights) {
  const values = new Float32Array(emf.width * emf.height * 3 * HEIGHT_LEVELS);
  const walls = new WallGrid(emf);
  for (const light of lights) {
    if (!light.enabled) continue;
    const source = lightSource(light);
    const depth =
      light.shadows === false
        ? null
        : walls.depths({ ...source, radius: light.radius });
    const color = parseInt(light.color.slice(1), 16);
    const channels = [color >> 16, (color >> 8) & 255, color & 255].map(
      (value) => value / 255,
    );
    for (let y = 0; y < emf.height; y++) {
      for (let x = 0; x < emf.width; x++) {
        const dx = x - source.x,
          dy = y - source.y;
        const distance = Math.hypot(dx, dy);
        if (
          light.kind === "window" &&
          dx * source.normalX + dy * source.normalY <= 0
        )
          continue;
        if (
          distance >= light.radius ||
          !WallGrid.visible(depth, dx, dy, distance)
        )
          continue;
        for (let z = 0; z < HEIGHT_LEVELS; z++) {
          const dz = (z * HEIGHT_STEP - (light.height ?? 0)) / HEIGHT_STEP;
          const squared = (dx * dx + dy * dy + dz * dz) / light.radius ** 2;
          if (squared >= 1) continue;
          const amount = (1 - squared) ** 2 * light.brightness;
          for (let channel = 0; channel < 3; channel++)
            values[((z * emf.height + y) * emf.width + x) * 3 + channel] +=
              channels[channel] * amount;
        }
      }
    }
  }
  return values;
}

function assertEquivalent(actual, expected) {
  assert.equal(actual.length, expected.length);
  let difference = 0;
  for (let i = 0; i < actual.length; i++)
    difference = Math.max(difference, Math.abs(actual[i] - expected[i]));
  assert.ok(difference < 1e-6, `Maximum field difference: ${difference}`);
}

test("bounded height accumulation matches exhaustive samples at reach/height limits", () => {
  const emf = EMF.new(16, 15, "Field equivalence");
  emf.getTile(3, 4).gfx[1] = 7;
  emf.getTile(7, 6).gfx[3] = 477;
  emf.getTile(6, 5).gfx[4] = 7;
  const base = defaultLighting();
  for (const [radius, height] of [
    [1, 0],
    [1, 192],
    [3.5, 15],
    [6, 103],
    [12, 192],
  ]) {
    const settings = withLight(
      base,
      { kind: "free", key: "1,1" },
      {
        ...FREE_LIGHT_PRESET,
        radius,
        height,
        color: "#b4d790",
        brightness: 1.25,
      },
    );
    const field = new LightField(emf, settings);
    const lights = [
      lampAt(emf, settings, 3, 4),
      windowAt(emf, settings, 7, 6, 3),
      freeLightAt(emf, settings, 1, 1),
    ];
    assert.equal(field.sources.size, lights.length);
    assertEquivalent(field.values, referenceValues(emf, lights));
  }
});

test("zero brightness does no visibility work and later activation restores light", () => {
  const emf = EMF.new(16, 16, "Zero brightness");
  const base = defaultLighting(),
    field = new LightField(emf, base);
  const originalDepths = field.walls.lazyDepths.bind(field.walls);
  let rays = 0;
  field.walls.lazyDepths = (light) => {
    rays++;
    return originalDepths(light);
  };
  const off = withLight(
    base,
    { kind: "free", key: "6,6" },
    { ...FREE_LIGHT_PRESET, brightness: 0 },
  );
  field.setSettings(off);
  assert.equal(rays, 0);
  assert.ok(field.values.every((value) => value === 0));
  const on = withLight(off, freeLightAt(emf, off, 6, 6), {
    ...FREE_LIGHT_PRESET,
    brightness: 1,
  });
  field.setSettings(on);
  assert.equal(rays, 1);
  assert.ok(field.values.some((value) => value > 0));
  field.setSettings(off);
  assert.equal(rays, 2, "Only the formerly active contribution needs removing");
  assert.ok(field.values.every((value) => Math.abs(value) < 1e-6));
});

test("equivalent cloned settings and glow changes reuse all source contributions", () => {
  const emf = EMF.new(12, 12, "Stable overrides");
  emf.getTile(3, 4).gfx[1] = 7;
  emf.getTile(6, 5).gfx[4] = 474;
  let settings = defaultLighting();
  for (const light of [
    lampAt(emf, settings, 3, 4),
    windowAt(emf, settings, 6, 5, 4),
  ])
    settings = withLight(settings, light, light);
  settings = withLight(
    settings,
    { kind: "free", key: "5,5" },
    FREE_LIGHT_PRESET,
  );
  const field = new LightField(emf, settings),
    before = field.values.slice();
  field.accumulate = () => {
    throw new Error("Equivalent settings rebaked a source");
  };
  const copy = structuredClone(settings);
  field.setSettings(copy);
  const light = lampAt(emf, copy, 3, 4);
  field.setSettings(withLight(copy, light, { ...light, glow: 0 }));
  assert.deepEqual(field.values, before);
  assert.equal(field.sources.get(4 * emf.width + 3).glow, 0);
});

test("a crowded wall edit scans the blocker neighbourhood and finds every reaching source", () => {
  // More sources than one neighbourhood holds selects the bounded scan
  // instead of the pass over all sources that small maps use.
  const size = 56;
  const emf = EMF.new(size, size, "Crowded sources");
  const lights = {};
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      lights[`${x},${y}`] = lightSettings({
        ...FREE_LIGHT_PRESET,
        radius: 1 + ((x + 2 * y) % 4) * 3,
      });
  const settings = { ...defaultLighting(), lights };
  const field = new LightField(emf, settings);
  assert.ok(field.sources.size > (2 * 12 + 3) ** 2 * 4);
  const blocker = { x: 28, y: 27 };
  emf.getTile(blocker.x, blocker.y).gfx[3] = 7;
  const expected = [];
  for (const [key, light] of field.sources) {
    const source = lightSource(light);
    const dx = source.x - blocker.x,
      dy = source.y - blocker.y;
    if (dx * dx + dy * dy <= (light.radius + 1) ** 2) expected.push(key);
  }
  const affected = new Set();
  field.collectShadowedSources([blocker.x, blocker.y], affected);
  const sorted = (keys) => [...keys].sort((a, b) => a - b);
  assert.deepEqual(sorted(affected), sorted(expected));
  field.queueWall(blocker.x, blocker.y);
  field.flushWalls();
  // Thousands of overlapping float32 sums: compare within a few ulps.
  const fresh = new LightField(emf, settings).values;
  for (let i = 0; i < fresh.length; i++)
    assert.ok(
      Math.abs(field.values[i] - fresh[i]) <= 1e-6 * Math.max(1, fresh[i]),
      `Field differs at ${i}: ${field.values[i]} vs ${fresh[i]}`,
    );
});

test("opaque wall repaint skips lighting while window replacement updates only its source", () => {
  const emf = EMF.new(20, 20, "Stable wall opacity");
  emf.getTile(8, 8).gfx[3] = 7;
  emf.getTile(7, 8).gfx[1] = 7;
  const settings = defaultLighting(),
    field = new LightField(emf, settings);
  const originalAccumulate = field.accumulate.bind(field);
  const touched = [];
  field.accumulate = (light, sign) => {
    touched.push({ kind: light.kind, sign });
    originalAccumulate(light, sign);
  };
  emf.getTile(8, 8).gfx[3] = 8;
  field.queueWall(8, 8);
  field.flushWalls();
  assert.equal(touched.length, 0);
  assertEquivalent(field.values, new LightField(emf, settings).values);
  emf.getTile(8, 8).gfx[3] = 477;
  field.queueWall(8, 8);
  field.flushWalls();
  assert.deepEqual(touched, [{ kind: "window", sign: 1 }]);
  assertEquivalent(field.values, new LightField(emf, settings).values);
  touched.length = 0;
  emf.getTile(8, 8).gfx[3] = 351;
  field.queueWall(8, 8);
  field.flushWalls();
  assert.deepEqual(touched, [
    { kind: "window", sign: -1 },
    { kind: "window", sign: 1 },
  ]);
  assertEquivalent(field.values, new LightField(emf, settings).values);
});
