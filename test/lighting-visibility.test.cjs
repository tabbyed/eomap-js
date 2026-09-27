const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");

// Load the real scene and renderer without a browser/GPU; only the Phaser
// base classes they extend are stubbed.
global.Phaser = {
  Math: { Pow2: { IsSize: () => false } },
  Textures: { Texture: class {}, TextureSource: class {}, LINEAR: 1 },
  Utils: { Array: { Remove: () => {} } },
  Display: { Canvas: { CanvasPool: {} } },
  Class: { mixin() {} },
  Scene: class {},
  GameObjects: {
    GameObject: class {
      destroy() {}
    },
    Components: { TransformMatrix: class {} },
    GameObjectFactory: { register() {} },
  },
};
const { EditorScene } = require("../src/core/scenes/editor-scene");
const {
  LightingRenderer,
} = require("../src/core/gameobjects/lighting-renderer");
const { LightField } = require("../src/core/lighting/field/light-field");
const { EMF } = require("../src/core/data/emf");
const { defaultLighting } = require("../src/core/lighting/model/settings");

function scene(selectedTool, lightingToolState) {
  const shown = [];
  const data = new Map([
    ["selectedTool", selectedTool],
    ["lightingToolState", lightingToolState],
  ]);
  const instance = Object.create(EditorScene.prototype);
  Object.assign(instance, {
    data: { get: (key) => data.get(key) },
    map: { setLightingPreview: (enabled) => shown.push(enabled) },
  });
  instance.updateLightingPreview();
  return shown[0];
}

test("lighting shows only while the Lighting tool is selected", () => {
  for (const tool of ["draw", "erase", "move", "fill", "entity"])
    assert.equal(scene(tool, { preview: true }), false, tool);
  assert.equal(scene("lighting", { preview: true }), true);
  assert.equal(scene("lighting", { preview: false }), false);
  assert.equal(scene("lighting", undefined), true);
});

function litMap() {
  const emf = EMF.new(16, 16, "Visibility");
  emf.getTile(5, 5).gfx[1] = 7; // A street lamp.
  let invalidations = 0;
  const map = {
    emf,
    invalidateCachedFrame: () => invalidations++,
    get invalidations() {
      return invalidations;
    },
  };
  map.lighting = new LightingRenderer(map, {}, null);
  return map;
}

// Incremental updates subtract and re-add contributions, leaving float residue.
function assertMatchesFreshField(field, emf, settings) {
  const fresh = new LightField(emf, settings);
  assert.deepEqual(field.ambient, fresh.ambient);
  for (let i = 0; i < fresh.values.length; i++)
    assert.ok(Math.abs(field.values[i] - fresh.values[i]) < 1e-6, `value ${i}`);
}

test("hidden lighting builds no field until it is first shown", () => {
  const map = litMap();
  const lighting = map.lighting;
  const settings = defaultLighting();
  lighting.setLighting(settings);
  assert.equal(lighting.field, null);
  assert.equal(map.invalidations, 0, "nothing lit, nothing to redraw");

  // Edits and new settings while hidden need no field.
  map.emf.getTile(6, 6).gfx[3] = 3;
  lighting.tileChanged(6, 6, 3);
  lighting.update();
  const night = { ...settings, ambient: { brightness: 0.3, color: "#97b5ed" } };
  lighting.setLighting(night);
  assert.equal(lighting.field, null);

  lighting.setEnabled(true);
  assert.ok(lighting.field instanceof LightField);
  assertMatchesFreshField(lighting.field, map.emf, night);
  assert.equal(lighting.shades({ layer: 0 }), true);
});

test("hiding lighting keeps its field current for the next time it is shown", () => {
  const map = litMap();
  const lighting = map.lighting;
  const settings = defaultLighting();
  lighting.setLighting(settings);
  lighting.setEnabled(true);
  const field = lighting.field;
  lighting.setEnabled(false);
  assert.equal(lighting.shades({ layer: 0 }), false);

  map.emf.getTile(5, 6).gfx[3] = 3;
  lighting.tileChanged(5, 6, 3);
  lighting.update();
  const dimmer = {
    ...settings,
    lamps: {
      "5,5,7": {
        radius: 3,
        brightness: 0.5,
        glow: 1,
        color: "#ffffff",
        enabled: true,
        height: 0,
        shadows: true,
      },
    },
  };
  lighting.setLighting(dimmer);

  lighting.setEnabled(true);
  assert.equal(lighting.field, field, "shown again without a rebuild");
  assertMatchesFreshField(field, map.emf, dimmer);
});

test("a map rebuild builds the field only while lighting is shown", () => {
  const map = litMap();
  const lighting = map.lighting;
  lighting.setLighting(defaultLighting());
  lighting.reset();
  lighting.rebuild();
  assert.equal(lighting.field, null);
  lighting.setEnabled(true);
  lighting.reset();
  lighting.rebuild();
  assert.ok(lighting.field instanceof LightField);
});
