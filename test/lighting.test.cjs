const assert = require("node:assert/strict");
const { test } = require("node:test");
// Load the existing extensionless ESM source with the project's Babel toolchain.
require("../scripts/register-core.cjs");
const { EMF } = require("../src/core/data/emf");
const {
  defaultLighting,
  lampAt,
  freeLightAt,
  selectedLight,
  withLight,
  FREE_LIGHT_PRESET,
  lightSettings,
  serializeLighting,
  parseLighting,
  LAMP_PRESETS,
} = require("../src/core/lighting/lamps");
const {
  lightSource,
  projectLight,
  lightGroundRadius,
} = require("../src/core/lighting/light-geometry");
const { LightField } = require("../src/core/lighting/light-field");
const { WallGrid } = require("../src/core/lighting/walls");
const { LightingCommand } = require("../src/core/command/lighting-command");
const { MapState } = require("../src/core/state/map-state");
const { saveMapWithLighting } = require("../src/core/lighting/save");

function fixture() {
  const emf = EMF.new(24, 18, "Lamp test");
  emf.getTile(8, 6).gfx[1] = 7;
  const lighting = {
    ...defaultLighting(),
    ambient: { color: "#ffffff", brightness: 0.2 },
  };
  return { emf, lighting, field: new LightField(emf, lighting) };
}

test("only catalogued native objects emit; light is bounded and additive", () => {
  const { emf, lighting, field } = fixture();
  emf.getTile(5, 5).gfx[1] = 545; // Unlit brazier.
  field.updateTile(5, 5);
  assert.equal(lampAt(emf, lighting, 5, 5), null);
  assert.equal(field.sources.size, 1);
  assert.equal(field.tint(23, 17), 0x333333);
  assert.ok(field.tint(8, 6) > field.tint(8, 10));
  const a = field.values[(6 * emf.width + 8) * 3];
  emf.getTile(9, 6).gfx[1] = 7;
  field.updateTile(9, 6);
  assert.ok(field.values[(6 * emf.width + 8) * 3] > a);
  emf.getTile(9, 6).gfx[1] = null;
  field.updateTile(9, 6);
  assert.ok(Math.abs(field.values[(6 * emf.width + 8) * 3] - a) < 1e-6);
});

test("ambient changes reuse contributions; disabling and re-enabling leave no stale pool", () => {
  const { emf, lighting, field } = fixture();
  const before = field.values.slice();
  field.setSettings({
    ...lighting,
    ambient: { color: "#8899ff", brightness: 0.5 },
  });
  assert.deepEqual(field.values, before);
  const lamp = lampAt(emf, lighting, 8, 6);
  field.setSettings({
    ...lighting,
    lamps: { [lamp.key]: { ...lightSettings(lamp), enabled: false } },
  });
  assert.ok(field.values.every((value) => Math.abs(value) < 1e-6));
  field.setSettings(lighting);
  assert.deepEqual(field.values, before);
});

test("glow-only edits reuse surface lighting and round-trip through the sidecar", () => {
  const { emf, lighting, field } = fixture();
  const before = field.values.slice();
  const lamp = lampAt(emf, lighting, 8, 6);
  field.accumulate = () => assert.fail("Glow must not rebake surface lighting");
  const changed = withLight(lighting, lamp, { ...lamp, glow: 0 });
  field.setSettings(changed);
  assert.deepEqual(field.values, before);
  assert.deepEqual(
    parseLighting(serializeLighting(emf, changed), emf),
    changed,
  );
  const invalid = JSON.parse(serializeLighting(emf, changed));
  invalid.lamps[lamp.key].glow = 5;
  assert.throws(() => parseLighting(JSON.stringify(invalid), emf), /Bulb glow/);
});

test("sidecar round-trip validates the matching map and rejects invalid data", () => {
  const { emf, lighting } = fixture();
  const text = serializeLighting(emf, lighting);
  assert.deepEqual(parseLighting(text, emf), lighting);
  const invalid = JSON.parse(text);
  invalid.ambient.brightness = -1;
  assert.throws(
    () => parseLighting(JSON.stringify(invalid), emf),
    /Ambient brightness/,
  );
  emf.getTile(1, 1).gfx[1] = 6;
  assert.throws(() => parseLighting(text, emf), /different map layout/);
});

test("move is one undoable command preserving both graphics and tuned settings", () => {
  const { emf, lighting } = fixture();
  const state = MapState.fromEMF(emf);
  state.lighting = {
    ...lighting,
    lamps: {
      "8,6,7": { radius: 7, brightness: 1.5, color: "#ff9933", enabled: true },
    },
  };
  let field = new LightField(emf, state.lighting);
  state.gameObject = {
    setLighting: (settings) => field.setSettings(settings),
    setGraphic: (x, y, graphic) => {
      emf.getTile(x, y).gfx[1] = graphic;
      field.updateTile(x, y);
    },
  };
  state.saved();
  const next = {
    ...lighting,
    lamps: { "12,8,7": state.lighting.lamps["8,6,7"] },
  };
  state.commandInvoker.add(
    new LightingCommand(state, next, [
      { x: 8, y: 6, graphic: null },
      { x: 12, y: 8, graphic: 7 },
    ]),
  );
  assert.equal(emf.getTile(8, 6).gfx[1], null);
  assert.equal(lampAt(emf, state.lighting, 12, 8).radius, 7);
  assert.equal(state.dirty, true);
  state.commandInvoker.undo();
  assert.equal(emf.getTile(12, 8).gfx[1], null);
  assert.equal(lampAt(emf, state.lighting, 8, 6).brightness, 1.5);
  assert.equal(field.sources.size, 1);
  assert.equal(state.dirty, false);
  state.commandInvoker.redo();
  assert.equal(lampAt(emf, state.lighting, 12, 8).radius, 7);
});

test("saving lighting alone clears lighting-only edits without hiding map edits", () => {
  const { emf, lighting } = fixture();
  const state = MapState.fromEMF(emf);
  state.gameObject = {
    setLighting() {},
    setGraphic(x, y, graphic) {
      emf.getTile(x, y).gfx[1] = graphic;
    },
  };
  state.commandInvoker.add(new LightingCommand(state, lighting));
  assert.equal(state.dirty, true);
  state.savedLighting = JSON.stringify(state.lighting);
  assert.equal(state.dirty, false);
  state.commandInvoker.add(
    new LightingCommand(state, lighting, [{ x: 1, y: 1, graphic: 7 }]),
  );
  state.savedLighting = JSON.stringify(state.lighting);
  assert.equal(state.dirty, true);
  assert.equal(state.hasLightingMetadata, true);
});

test("partial pair-save failure keeps changes dirty", async () => {
  const { emf, lighting } = fixture();
  const state = MapState.fromEMF(emf);
  state.lighting = lighting;
  let mapWrites = 0;
  state.fileHandle = {
    async write() {
      mapWrites++;
    },
  };
  state.lightingFileHandle = {
    async write() {
      throw new Error("Disk full");
    },
  };
  await assert.rejects(saveMapWithLighting(state), /Disk full/);
  assert.equal(mapWrites, 1);
  assert.equal(state.dirty, true);
});

test("edits made during save remain dirty", async () => {
  const { emf, lighting } = fixture();
  const state = MapState.fromEMF(emf);
  state.lighting = lighting;
  let written;
  state.fileHandle = {
    async write() {
      state.lighting = {
        ...lighting,
        ambient: { color: "#ffffff", brightness: 0.8 },
      };
    },
  };
  state.lightingFileHandle = {
    async write(text) {
      written = JSON.parse(text);
    },
  };
  await saveMapWithLighting(state);
  assert.equal(written.ambient.brightness, 0.2);
  assert.equal(state.lighting.ambient.brightness, 0.8);
  assert.equal(state.dirty, true);
});

test("removed or cropped lamps are excluded from an exported sidecar", () => {
  const { emf, lighting } = fixture();
  lighting.lamps["8,6,7"] = lightSettings(lampAt(emf, lighting, 8, 6));
  emf.getTile(8, 6).gfx[1] = null;
  const exported = serializeLighting(emf, lighting);
  assert.deepEqual(parseLighting(exported, emf).lamps, {});
});

test("free lights coexist with objects, move and undo without changing EMF graphics", () => {
  const { emf, lighting } = fixture();
  const state = MapState.fromEMF(emf);
  state.lighting = lighting;
  const before = emf.tiles.map((tile) => [...tile.gfx]);
  const field = new LightField(emf, lighting);
  state.gameObject = {
    setLighting(settings) {
      field.setSettings(settings);
    },
    setGraphic() {
      assert.fail("Free lights must not change EMF graphics");
    },
  };
  state.saved();
  const placed = withLight(
    lighting,
    { kind: "free", key: "8,6" },
    FREE_LIGHT_PRESET,
  );
  state.commandInvoker.add(new LightingCommand(state, placed));
  const selection = { kind: "free", x: 8, y: 6 };
  assert.equal(
    selectedLight(emf, state.lighting, selection).name,
    "Free light",
  );
  assert.equal(field.sources.size, 2);
  const moved = withLight(
    withLight(placed, freeLightAt(emf, placed, 8, 6), null),
    { kind: "free", key: "20,14" },
    FREE_LIGHT_PRESET,
  );
  state.commandInvoker.add(new LightingCommand(state, moved));
  assert.equal(freeLightAt(emf, state.lighting, 8, 6), null);
  assert.ok(field.tint(20, 14) > 0x333333);
  state.commandInvoker.undo();
  assert.equal(field.tint(20, 14), 0x333333);
  state.commandInvoker.undo();
  assert.equal(field.sources.size, 1);
  assert.equal(state.dirty, false);
  assert.deepEqual(
    emf.tiles.map((tile) => [...tile.gfx]),
    before,
  );
});

test("free-light sidecars validate bounds and preserve colour, radius and off state", () => {
  const { emf, lighting } = fixture();
  const settings = {
    ...FREE_LIGHT_PRESET,
    color: "#aabbff",
    radius: 1,
    enabled: false,
  };
  const next = withLight(lighting, { kind: "free", key: "4,5" }, settings);
  const text = serializeLighting(emf, next);
  assert.deepEqual(parseLighting(text, emf), next);
  const invalid = JSON.parse(text);
  invalid.lights["999,999"] = lightSettings(settings);
  assert.throws(
    () => parseLighting(JSON.stringify(invalid), emf),
    /outside the map/,
  );
  delete invalid.lights;
  assert.deepEqual(parseLighting(JSON.stringify(invalid), emf).lights, {});
});

test("shrinking a live light removes its former outer footprint", () => {
  const { emf, lighting, field } = fixture();
  const lamp = lampAt(emf, lighting, 8, 6);
  assert.ok(field.tint(8, 9) > 0x333333);
  field.setSettings(
    withLight(lighting, lamp, { ...lamp, radius: 1, height: 0 }),
  );
  assert.equal(field.tint(8, 9), 0x333333);
  assert.ok(field.tint(8, 6) > 0x333333);
});

test("source height changes wall-height illumination without moving its ground anchor", () => {
  const emf = EMF.new(14, 14, "Height test");
  const base = {
    ...defaultLighting(),
    ambient: { color: "#ffffff", brightness: 0.2 },
  };
  const low = withLight(
    base,
    { kind: "free", key: "5,5" },
    { ...FREE_LIGHT_PRESET, radius: 3, height: 0 },
  );
  const field = new LightField(emf, low);
  const groundBefore = field.tint(5, 5, 0),
    highBefore = field.tint(5, 5, 96);
  const raised = withLight(
    low,
    { kind: "free", key: "5,5" },
    { ...FREE_LIGHT_PRESET, radius: 3, height: 96 },
  );
  field.setSettings(raised);
  assert.ok(field.tint(5, 5, 96) > highBefore);
  assert.ok(field.tint(5, 5, 0) < groundBefore);
  assert.equal(freeLightAt(emf, raised, 5, 5).height, 96);
  assert.equal(field.sources.size, 1);
  assert.deepEqual(parseLighting(serializeLighting(emf, raised), emf), raised);
});

test("both wall orientations block light, with an opening and explicit ignore-walls option", () => {
  for (const layer of [3, 4]) {
    const emf = EMF.new(20, 20, "Wall test");
    for (let i = 0; i < 20; i++)
      emf.getTile(layer === 3 ? i : 8, layer === 3 ? 8 : i).gfx[layer] = 7;
    const base = {
      ...defaultLighting(),
      ambient: { color: "#ffffff", brightness: 0.2 },
    };
    const source = layer === 3 ? { x: 8, y: 6 } : { x: 6, y: 8 };
    const target = layer === 3 ? { x: 8, y: 10 } : { x: 10, y: 8 };
    const key = `${source.x},${source.y}`;
    const lighting = withLight(
      base,
      { kind: "free", key },
      { ...FREE_LIGHT_PRESET, radius: 7 },
    );
    const field = new LightField(emf, lighting);
    assert.equal(field.tint(target.x, target.y), 0x333333);
    assert.ok(field.tint(source.x, source.y) > 0x333333);
    field.setSettings(
      withLight(
        lighting,
        { kind: "free", key },
        { ...FREE_LIGHT_PRESET, radius: 7, shadows: false },
      ),
    );
    assert.ok(field.tint(target.x, target.y) > 0x333333);
    field.setSettings(lighting);
    emf.getTile(8, 8).gfx[layer] = null;
    field.queueWall(8, 8);
    field.flushWalls();
    assert.ok(field.tint(target.x, target.y) > 0x333333);
    emf.getTile(8, 8).gfx[layer] = 7;
    field.queueWall(8, 8);
    field.flushWalls();
    assert.equal(field.tint(target.x, target.y), 0x333333);
  }
});

test("fences and walkability specs do not become solid optical walls", () => {
  const emf = EMF.new(12, 12, "Fence test");
  emf.getTile(5, 5).gfx[3] = 68;
  emf.getTile(5, 5).spec = 0;
  const grid = new WallGrid(emf);
  assert.equal(grid.edge(5, 5, 0, 1), false);
  emf.getTile(5, 5).gfx[3] = 7;
  grid.update(5, 5);
  assert.equal(grid.edge(5, 5, 0, 1), true);
  assert.equal(grid.edge(5, 6, 0, -1), true);
  assert.ok(grid.ray(5, 5, Math.SQRT1_2, Math.SQRT1_2, 4) < 1);
});

test("a source shadow does not erase another light on the far side", () => {
  const emf = EMF.new(20, 20, "Two rooms");
  for (let y = 0; y < 20; y++) emf.getTile(8, y).gfx[4] = 7;
  const base = {
    ...defaultLighting(),
    ambient: { color: "#ffffff", brightness: 0.2 },
  };
  let lighting = withLight(
    base,
    { kind: "free", key: "6,8" },
    { ...FREE_LIGHT_PRESET, radius: 7 },
  );
  lighting = withLight(
    lighting,
    { kind: "free", key: "10,8" },
    { ...FREE_LIGHT_PRESET, radius: 3 },
  );
  const field = new LightField(emf, lighting);
  const before = field.tint(10, 8);
  field.setSettings(withLight(lighting, { kind: "free", key: "6,8" }, null));
  assert.equal(field.tint(10, 8), before);
  assert.equal(field.groundCornerTint(9, 8, -1, 0), field.tint(9, 8));
});

test("native sources project onto measured bulb centres and retain integer ownership", () => {
  // Native gfx004 pixel centres, measured independently of the light catalogue.
  const artwork = [
    { graphic: 7, width: 17, height: 119, bulbX: 9, bulbY: 15 },
    { graphic: 6, width: 30, height: 140, bulbX: 15, bulbY: 25 },
    { graphic: 400, width: 26, height: 45, bulbX: 13, bulbY: 25 },
    // Garden lantern: 89 and 90 are identical artwork.
    { graphic: 89, width: 35, height: 42, bulbX: 16, bulbY: 19 },
    { graphic: 90, width: 35, height: 42, bulbX: 16, bulbY: 19 },
  ];
  const emf = EMF.new(16, 16, "Bulb calibration");
  for (const art of artwork) {
    emf.getTile(6, 7).gfx[1] = art.graphic;
    const light = lampAt(emf, defaultLighting(), 6, 7);
    const projected = projectLight(light);
    assert.equal(
      projected.x,
      (6 - 7) * 32 + 30 - Math.floor(art.width / 2) + art.bulbX,
    );
    assert.equal(projected.sourceY, (6 + 7) * 16 + 30 - art.height + art.bulbY);
    const source = lightSource(light);
    assert.ok(Math.abs(source.x - 6) < 0.5 && Math.abs(source.y - 7) < 0.5);
    assert.equal(light.key, `6,7,${art.graphic}`);
    const saved = withLight(defaultLighting(), light, light);
    assert.equal(saved.lamps[light.key].anchor, undefined);
    assert.deepEqual(parseLighting(serializeLighting(emf, saved), emf), saved);
  }
});

test("ground guide shrinks with height and disappears above reach without moving the anchor", () => {
  const light = { ...FREE_LIGHT_PRESET, x: 4, y: 5, radius: 5 };
  assert.equal(lightGroundRadius(light), 5);
  assert.equal(lightGroundRadius({ ...light, height: 96 }), 4);
  assert.equal(lightGroundRadius({ ...light, height: 160 }), 0);
  assert.equal(lightGroundRadius({ ...light, height: 192 }), 0);
  const low = projectLight(light),
    high = projectLight({ ...light, height: 96 });
  assert.equal(low.x, high.x);
  assert.equal(low.groundY, high.groundY);
  assert.equal(low.sourceY - high.sourceY, 96);
});

test("fractional sources hit both wall orientations from either side and at corners", () => {
  const emf = EMF.new(10, 10, "Offset rays");
  emf.getTile(4, 4).gfx[4] = 7;
  emf.getTile(4, 4).gfx[3] = 7;
  const walls = new WallGrid(emf);
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
  near(walls.ray(4.4, 4.3, 1, 0, 3), 0.1);
  near(walls.ray(4.8, 4.3, -1, 0, 3), 0.3);
  near(walls.ray(4.3, 4.4, 0, 1, 3), 0.1);
  near(walls.ray(4.3, 4.8, 0, -1, 3), 0.3);
  near(walls.ray(4.25, 4.25, Math.SQRT1_2, Math.SQRT1_2, 3), Math.SQRT2 / 4);
  assert.equal(walls.ray(4.5, 4.3, -1, 0, 3), 0);
  assert.equal(walls.ray(4.5, 4.3, 1, 0, 3), 3);
  assert.equal(walls.ray(0, 0, -1, 0, 3), 3);
});

test("wall edits near offset lamps match a complete field rebuild", () => {
  const emf = EMF.new(30, 30, "Offset wall invalidation");
  const base = defaultLighting();
  for (const preset of LAMP_PRESETS) {
    emf.getTile(8, 8).gfx[1] = preset.graphic;
    const lamp = lampAt(emf, base, 8, 8);
    const lighting = withLight(base, lamp, { ...lamp, radius: 12 });
    const field = new LightField(emf, lighting);
    for (const [x, y, layer] of [
      [8, 8, 3],
      [8, 8, 4],
      [20, 8, 3],
    ]) {
      for (const graphic of [3, null]) {
        emf.getTile(x, y).gfx[layer] = graphic;
        field.queueWall(x, y);
        field.flushWalls();
        const rebuilt = new LightField(emf, lighting);
        for (let i = 0; i < field.values.length; i++)
          assert.ok(Math.abs(field.values[i] - rebuilt.values[i]) < 1e-6);
      }
    }
  }
});
