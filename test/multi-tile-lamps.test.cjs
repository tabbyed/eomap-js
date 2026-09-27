const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
require("../scripts/register-core.cjs");

const { EMF } = require("../src/core/data/emf");
const { MapState } = require("../src/core/state/map-state");
const { LightField } = require("../src/core/lighting/field/light-field");
const {
  LightingController,
} = require("../src/core/controllers/lighting-controller");
const { LightingAction } = require("../src/core/controllers/lighting-actions");
const { LightingTool } = require("../src/core/tools/lighting-tool");
const { lampAt } = require("../src/core/lighting/model/lamps");

// The fireplace is drawn across two tiles: the hearth (77) owns the light and
// its right-hand half (78) sits on the next tile. Graphic 1 is an ordinary
// object that is no part of any lamp.
const HEARTH = 77,
  RIGHT_HALF = 78,
  TABLE = 1;

// A map, its undo history and a light field, with the editor stubbed out.
function editor(objects) {
  const emf = EMF.new(12, 8, "Fireplaces");
  for (const [x, y, graphic] of objects) emf.getTile(x, y).gfx[1] = graphic;
  const state = MapState.fromEMF(emf);
  const field = new LightField(emf, state.lighting);
  state.gameObject = {
    setLighting: (settings) => field.setSettings(settings),
    previewLighting: (settings) => field.setSettings(settings),
    clearLightingPreview() {},
    setGraphic(x, y, graphic) {
      emf.getTile(x, y).gfx[1] = graphic;
      field.updateTile(x, y);
    },
  };
  const app = {
    mapState: state,
    commandInvoker: state.commandInvoker,
    lightingToolState: { mode: "select", selection: null },
    onMapStateChange() {},
  };
  app.lightingController = new LightingController(app);
  const objectAt = (x, y) => emf.getTile(x, y).gfx[1];
  return { emf, state, field, app, objectAt };
}

// The lighting tool on a scene that records the tool state it reports.
function tool(env, toolState) {
  const stub = {};
  for (const method of [
    "setDepth",
    "setVisible",
    "clear",
    "lineStyle",
    "lineBetween",
  ])
    stub[method] = () => stub;
  const scene = {
    emf: env.emf,
    mapState: env.state,
    map: env.state.gameObject,
    events: new EventEmitter(),
    commandInvoker: env.state.commandInvoker,
    data: { get: () => toolState },
    selectedTool: "lighting",
    currentPos: { x: 0, y: 0, valid: true },
    add: { graphics: () => stub, image: () => stub },
    textureCache: { getResource: () => null },
    gfxLoader: { resourceInfo: () => true },
  };
  scene.events.on("lighting-tool-state", (next) => {
    toolState = next;
  });
  return {
    scene,
    click(x, y) {
      scene.currentPos = { x, y, valid: true };
      new LightingTool(scene).handleLeftPointerDown(scene);
      return toolState;
    },
  };
}

const select = (x, y) => ({ x, y, kind: "lamp" });

test("deleting a fireplace removes both halves, and undo restores them", async () => {
  const env = editor([
    [4, 3, HEARTH],
    [5, 3, RIGHT_HALF],
  ]);
  env.app.lightingToolState.selection = select(4, 3);
  await env.app.lightingController.handle({ type: LightingAction.Delete });
  assert.deepEqual([env.objectAt(4, 3), env.objectAt(5, 3)], [null, null]);
  assert.equal(env.field.sources.size, 0);
  env.state.commandInvoker.undo();
  assert.deepEqual(
    [env.objectAt(4, 3), env.objectAt(5, 3)],
    [HEARTH, RIGHT_HALF],
  );
  assert.ok(lampAt(env.emf, env.state.lighting, 4, 3));
});

test("deleting a fireplace never removes an object that is not its half", async () => {
  const env = editor([
    [4, 3, HEARTH],
    [5, 3, TABLE],
  ]);
  env.app.lightingToolState.selection = select(4, 3);
  await env.app.lightingController.handle({ type: LightingAction.Delete });
  assert.equal(env.objectAt(4, 3), null);
  assert.equal(env.objectAt(5, 3), TABLE, "the table beside it stays");
});

test("moving a fireplace takes both halves, even over its own old tiles", () => {
  const env = editor([
    [4, 3, HEARTH],
    [5, 3, RIGHT_HALF],
  ]);
  const { click } = tool(env, {
    mode: "move",
    selection: select(4, 3),
    preview: false,
    guides: false,
  });
  const next = click(5, 3);
  assert.equal(next.mode, "select");
  assert.deepEqual(
    [env.objectAt(4, 3), env.objectAt(5, 3), env.objectAt(6, 3)],
    [null, HEARTH, RIGHT_HALF],
  );
  assert.deepEqual(next.selection, select(5, 3));
  env.state.commandInvoker.undo();
  assert.deepEqual(
    [env.objectAt(4, 3), env.objectAt(5, 3), env.objectAt(6, 3)],
    [HEARTH, RIGHT_HALF, null],
  );
});

test("moving a fireplace never removes or covers an object that is not its half", () => {
  const env = editor([
    [4, 3, HEARTH],
    [5, 3, TABLE],
  ]);
  const toolState = {
    mode: "move",
    selection: select(4, 3),
    preview: false,
    guides: false,
  };
  // One tile right would put the hearth on the table: refused.
  let next = tool(env, toolState).click(5, 3);
  assert.match(next.notice, /more than one tile/);
  assert.deepEqual([env.objectAt(4, 3), env.objectAt(5, 3)], [HEARTH, TABLE]);

  next = tool(env, toolState).click(4, 5);
  assert.deepEqual(
    [env.objectAt(4, 3), env.objectAt(5, 3)],
    [null, TABLE],
    "the table beside the old spot stays",
  );
  assert.deepEqual(
    [env.objectAt(4, 5), env.objectAt(5, 5)],
    [HEARTH, RIGHT_HALF],
  );
});
