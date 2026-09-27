const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");
const { EMF } = require("../src/core/data/emf");
const {
  defaultLighting,
  selectedLight,
  withLight,
} = require("../src/core/lighting/model/settings");
const {
  serializeLighting,
  parseLighting,
} = require("../src/core/lighting/file/lighting-file");
const { windowAt, windowKey } = require("../src/core/lighting/model/windows");
const { LightingCommand } = require("../src/core/command/lighting-command");
const { MapState } = require("../src/core/state/map-state");

function fixture() {
  const emf = EMF.new(12, 10, "Window state test");
  emf.getTile(4, 4).gfx[3] = 477;
  emf.getTile(4, 4).gfx[4] = 474;
  emf.getTile(6, 4).gfx[3] = 477;
  return { emf, lighting: defaultLighting() };
}

test("window overrides belong to one placed instance and one wall face", () => {
  const { emf, lighting } = fixture();
  const down = selectedLight(emf, lighting, {
    kind: "window",
    x: 4,
    y: 4,
    layer: 3,
  });
  const right = selectedLight(emf, lighting, {
    kind: "window",
    x: 4,
    y: 4,
    layer: 4,
  });
  assert.equal(down.graphic, 477);
  assert.equal(right.graphic, 474);
  assert.notEqual(down.key, right.key);
  const edited = withLight(lighting, down, {
    ...down,
    enabled: false,
    color: "#abcdef",
    brightness: 0.4,
    glow: 0.2,
  });
  assert.equal(windowAt(emf, edited, 4, 4, 3).enabled, false);
  assert.equal(windowAt(emf, edited, 4, 4, 4).enabled, true);
  assert.equal(windowAt(emf, edited, 6, 4, 3).enabled, true);
  assert.equal(windowAt(emf, lighting, 4, 4, 3).enabled, true);
  assert.deepEqual(Object.keys(edited.windows[down.key]).sort(), [
    "brightness",
    "color",
    "enabled",
    "glow",
    "radius",
  ]);
  const reset = withLight(edited, down, null);
  assert.deepEqual(reset.windows, {});
  assert.equal(windowAt(emf, reset, 4, 4, 3).enabled, true);
  assert.equal(emf.getTile(4, 4).gfx[3], 477);
});

test("window state round-trips and old sidecars without windows remain valid", () => {
  const { emf, lighting } = fixture();
  const down = windowAt(emf, lighting, 4, 4, 3);
  const edited = withLight(lighting, down, {
    ...down,
    color: "#bada55",
    glow: 0.3,
  });
  const serialized = serializeLighting(emf, edited);
  assert.deepEqual(parseLighting(serialized, emf), edited);
  const legacy = JSON.parse(serialized);
  delete legacy.windows;
  assert.deepEqual(parseLighting(JSON.stringify(legacy), emf).windows, {});
});

test("export omits replaced and cropped windows, preserving other faces", () => {
  const { emf, lighting } = fixture();
  const down = windowAt(emf, lighting, 4, 4, 3);
  const right = windowAt(emf, lighting, 4, 4, 4);
  let edited = withLight(lighting, down, { ...down, enabled: false });
  edited = withLight(edited, right, { ...right, glow: 0.25 });
  edited.windows[windowKey(12, 4, 3, 477)] = edited.windows[down.key];
  emf.getTile(4, 4).gfx[3] = 7;
  const result = JSON.parse(serializeLighting(emf, edited));
  assert.deepEqual(Object.keys(result.windows), [right.key]);
});

test("import rejects invalid positions, faces, stale graphics and glow values", () => {
  const { emf, lighting } = fixture();
  const window = windowAt(emf, lighting, 4, 4, 3);
  const settings = withLight(lighting, window, window).windows[window.key];
  const source = JSON.parse(serializeLighting(emf, lighting));
  const importWindows = (windows) =>
    parseLighting(JSON.stringify({ ...source, windows }), emf);
  for (const key of [
    "04,4,3,477",
    "-1,4,3,477",
    "12,4,3,477",
    "4,10,3,477",
    "4,4,2,477",
    "4,4,4,477",
    "4,4,3,351",
    "3,3,3,477",
  ]) {
    assert.throws(() => importWindows({ [key]: settings }), /window/i, key);
  }
  for (const glow of [-0.1, 2.1, "1", null])
    assert.throws(
      () => importWindows({ [window.key]: { ...settings, glow } }),
      /glow/i,
    );
  for (const windows of [null, [], "windows"])
    assert.throws(() => importWindows(windows), /window/i);
});

test("undoing a window setting restores lighting without changing EMF graphics", () => {
  const { emf, lighting } = fixture();
  const state = new MapState();
  state.emf = emf;
  state.lighting = lighting;
  const beforeGraphics = emf.tiles.map((tile) => [...tile.gfx]);
  const window = windowAt(emf, lighting, 4, 4, 3);
  const after = withLight(lighting, window, { ...window, enabled: false });
  const command = new LightingCommand(state, after);
  state.gameObject = {
    setLighting: () => {},
    setGraphic: () =>
      assert.fail("A window setting must not edit EMF graphics."),
  };
  assert.equal(command.affectsMap, false);
  command.execute();
  assert.equal(windowAt(emf, state.lighting, 4, 4, 3).enabled, false);
  command.undo();
  assert.equal(windowAt(emf, state.lighting, 4, 4, 3).enabled, true);
  assert.deepEqual(
    emf.tiles.map((tile) => [...tile.gfx]),
    beforeGraphics,
  );
});
