const assert = require("node:assert/strict");
const { test } = require("node:test");

require("../scripts/register-core.cjs");
const { EMF } = require("../src/core/data/emf");
const { defaultLighting } = require("../src/core/lighting/model/settings");
const {
  FREE_LIGHT_PRESET,
  lightSettings,
} = require("../src/core/lighting/model/lamps");
const { LightField } = require("../src/core/lighting/field/light-field");
const { lightSource } = require("../src/core/lighting/model/light-geometry");
const { windowAt } = require("../src/core/lighting/model/windows");

const owner = { x: 8, y: 8 };
const graphics = { 3: 477, 4: 474 };

function fixture(layer) {
  const emf = EMF.new(20, 20, "Window field");
  emf.getTile(owner.x, owner.y).gfx[layer] = graphics[layer];
  const settings = {
    ...defaultLighting(),
    windows: {},
    ambient: { color: "#ffffff", brightness: 0.2 },
  };
  const light = windowAt(emf, settings, owner.x, owner.y, layer);
  assert.ok(light, "Fixture window must be in the native catalogue");
  return { emf, settings, light, field: new LightField(emf, settings) };
}

function outward(layer, distance) {
  return {
    x: owner.x + (layer === 4 ? distance : 0),
    y: owner.y + (layer === 3 ? distance : 0),
  };
}

function assertFresh(field) {
  const fresh = new LightField(field.emf, field.settings);
  assert.deepEqual(
    [...field.sources.keys()].sort(),
    [...fresh.sources.keys()].sort(),
  );
  let error = 0;
  for (let i = 0; i < field.values.length; i++)
    error = Math.max(error, Math.abs(field.values[i] - fresh.values[i]));
  assert.ok(error < 2e-6, `Incremental field differs from rebuild by ${error}`);
}

test("native windows spill outside their own opaque wall, never into the inward hemisphere", () => {
  for (const layer of [3, 4]) {
    const { emf, settings, light, field } = fixture(layer);
    const outside = outward(layer, 2);
    assert.equal(field.sources.size, 1);
    assert.ok(
      field.walls.edge(
        owner.x,
        owner.y,
        layer === 4 ? 1 : 0,
        layer === 3 ? 1 : 0,
      ),
    );
    assert.ok(field.tint(outside.x, outside.y) > 0x333333);
    assert.equal(field.tint(owner.x, owner.y), 0x333333);
    assert.equal(lightSource(light).normalX, layer === 4 ? 1 : 0);
    assert.equal(lightSource(light).normalY, layer === 3 ? 1 : 0);

    // Directionality is an emitter property, not an accidental own-wall shadow.
    const openField = new LightField(
      EMF.new(emf.width, emf.height, "No blockers"),
      settings,
    );
    openField.accumulate({ ...light, shadows: false }, 1);
    assert.ok(openField.tint(outside.x, outside.y) > 0x333333);
    assert.equal(openField.tint(owner.x, owner.y), 0x333333);
  }
});

test("other walls stop window spill and removing the blocker restores it", () => {
  for (const layer of [3, 4]) {
    const { emf, field } = fixture(layer);
    const outside = outward(layer, 2);
    const before = field.tint(outside.x, outside.y);
    for (let i = 0; i < 20; i++) {
      const x = layer === 4 ? owner.x + 1 : i;
      const y = layer === 3 ? owner.y + 1 : i;
      emf.getTile(x, y).gfx[layer] = 7;
      field.queueWall(x, y);
    }
    field.flushWalls();
    assert.equal(field.tint(outside.x, outside.y), 0x333333);
    assertFresh(field);
    for (let i = 0; i < 20; i++) {
      const x = layer === 4 ? owner.x + 1 : i;
      const y = layer === 3 ? owner.y + 1 : i;
      emf.getTile(x, y).gfx[layer] = null;
      field.queueWall(x, y);
    }
    field.flushWalls();
    assert.equal(field.tint(outside.x, outside.y), before);
    assertFresh(field);
  }
});

test("window glow edits reuse the field; disabling and enabling replace its spill", () => {
  for (const layer of [3, 4]) {
    const { settings, light, field } = fixture(layer);
    const before = field.values.slice();
    const accumulate = field.accumulate;
    let calls = 0;
    field.accumulate = function (...args) {
      calls++;
      return accumulate.apply(this, args);
    };
    const dimGlass = { ...settings, windows: { [light.key]: { glow: 0 } } };
    field.setSettings(dimGlass);
    assert.equal(
      calls,
      0,
      "Glass-only edits must not rebuild source visibility",
    );
    assert.deepEqual(field.values, before);
    field.setSettings({
      ...settings,
      windows: { [light.key]: { enabled: false } },
    });
    assert.ok(field.values.every((value) => Math.abs(value) < 1e-6));
    field.setSettings(settings);
    assert.deepEqual(field.values, before);
  }
});

test("batched window removal, replacement and undo agree with a fresh field", () => {
  for (const layer of [3, 4]) {
    const { emf, settings, field } = fixture(layer);
    // Include another source whose shadows change when the window wall vanishes.
    const nearby = {
      ...settings,
      lights: { "7,7": lightSettings({ ...FREE_LIGHT_PRESET, radius: 6 }) },
    };
    field.setSettings(nearby);
    const tile = emf.getTile(owner.x, owner.y);
    const originalValues = field.values.slice();
    for (const graphic of [null, 3, layer === 3 ? 351 : 354, graphics[layer]]) {
      tile.gfx[layer] = graphic;
      field.queueWall(owner.x, owner.y);
      field.flushWalls();
      assertFresh(field);
    }
    for (let i = 0; i < originalValues.length; i++)
      assert.ok(Math.abs(field.values[i] - originalValues[i]) < 2e-6);

    // Reorient both wall layers in one batch, then undo both together.
    const otherLayer = layer === 3 ? 4 : 3;
    tile.gfx[layer] = null;
    tile.gfx[otherLayer] = graphics[otherLayer];
    field.queueWall(owner.x, owner.y);
    field.flushWalls();
    assertFresh(field);
    tile.gfx[otherLayer] = null;
    tile.gfx[layer] = graphics[layer];
    field.queueWall(owner.x, owner.y);
    field.flushWalls();
    assertFresh(field);

    // A settings event can arrive before the queued wall edit gets a frame tick.
    tile.gfx[layer] = null;
    field.queueWall(owner.x, owner.y);
    field.setSettings({
      ...nearby,
      ambient: { color: "#aabbcc", brightness: 0.3 },
    });
    assert.equal(field.dirtyWalls.size, 0);
    assertFresh(field);
  }
});
