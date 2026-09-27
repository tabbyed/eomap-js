const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");

require("../scripts/register-core.cjs");
const { EMF } = require("../src/core/data/emf");
const { MapState } = require("../src/core/state/map-state");
const { LightField } = require("../src/core/lighting/field/light-field");
const { defaultLighting } = require("../src/core/lighting/model/settings");
const { lightSettings } = require("../src/core/lighting/model/lamps");
const { LightingTool } = require("../src/core/tools/lighting-tool");

const origin = { x: 5, y: 5 };
const destination = { x: 14, y: 6 };

function lightMap(kind, position) {
  const emf = EMF.new(24, 18, "Move preview");
  const lighting = defaultLighting();
  lighting.ambient = { color: "#ffffff", brightness: 0.2 };
  const settings = lightSettings({
    enabled: true,
    color: "#ffaa66",
    brightness: 0.9,
    radius: 3,
    height: 32,
  });
  // A second source ensures preview cleanup preserves unrelated lighting.
  lighting.lights["19,14"] = { ...settings, color: "#6677ff", height: 0 };
  if (kind === "lamp") {
    emf.getTile(position.x, position.y).gfx[1] = 7;
    lighting.lamps[`${position.x},${position.y},7`] = settings;
  } else lighting.lights[`${position.x},${position.y}`] = settings;
  return { emf, lighting };
}

function drawingStub() {
  const stub = {};
  for (const method of [
    "setDepth",
    "setVisible",
    "clear",
    "lineStyle",
    "strokeRect",
    "strokeCircle",
    "strokeEllipse",
    "lineBetween",
    "setTexture",
    "setOrigin",
    "setPosition",
    "setScale",
    "setAlpha",
    "setTint",
  ])
    stub[method] = () => stub;
  return stub;
}

function fixture(kind) {
  const { emf, lighting } = lightMap(kind, origin);
  const mapState = MapState.fromEMF(emf);
  mapState.lighting = lighting;
  const field = new LightField(emf, lighting);
  const map = {
    emf,
    lighting: { field, settings: lighting, displacedLampKey: null },
    scrollX: 0,
    scrollY: 0,
    zoom: 1,
    width: 800,
    height: 600,
    camera: {
      dirty: false,
      scrollX: 0,
      scrollY: 0,
      preRender() {},
      matrix: { transformPoint: (x, y) => ({ x, y }) },
    },
    invalidateCachedFrame() {},
    setLighting(settings) {
      this.lighting.settings = settings;
      this.lighting.field.setSettings(settings);
    },
    setGraphic(x, y, graphic) {
      emf.getTile(x, y).gfx[1] = graphic;
      field.updateTile(x, y);
    },
  };
  mapState.gameObject = map;
  mapState.saved();
  let toolState = {
    mode: "move",
    preset: kind === "free" ? "free" : "street",
    selection: { ...origin, kind },
    preview: true,
    guides: false,
  };
  const events = new EventEmitter();
  events.on("lighting-tool-state", (next) => {
    toolState = next;
  });
  const entry = {
    loadingComplete: null,
    incRef() {},
    decRef() {},
    asset: {
      getFrame: () => ({
        width: 24,
        height: 128,
        name: "lamp",
        texture: { key: "test" },
      }),
    },
  };
  const scene = {
    emf,
    mapState,
    map,
    events,
    commandInvoker: mapState.commandInvoker,
    data: { get: () => toolState },
    selectedTool: "lighting",
    currentPos: { ...destination, valid: true },
    add: { graphics: drawingStub, image: drawingStub },
    textureCache: { getResource: () => entry },
    gfxLoader: { resourceInfo: () => true },
  };
  return { scene, tool: new LightingTool(scene), field, mapState };
}

function assertFieldAt(field, kind, position) {
  const { emf, lighting } = lightMap(kind, position);
  const expected = new LightField(emf, lighting);
  let maxError = 0;
  for (let i = 0; i < field.values.length; i++)
    maxError = Math.max(
      maxError,
      Math.abs(field.values[i] - expected.values[i]),
    );
  assert.ok(
    maxError < 1e-6,
    `Light field differs from a fresh field by ${maxError}`,
  );
}

for (const kind of ["free", "lamp"]) {
  test(`${kind}: rebuilding the map field refreshes an active move preview`, () => {
    const { scene, tool } = fixture(kind);
    tool.update();
    scene.map.lighting.field = new LightField(
      scene.emf,
      scene.mapState.lighting,
    );
    tool.update();
    assertFieldAt(scene.map.lighting.field, kind, destination);
    tool.cancel();
    assertFieldAt(scene.map.lighting.field, kind, origin);
    assert.equal(scene.map.lighting.displacedLampKey, null);
  });

  test(`${kind}: move preview replaces the origin; cancelling restores all contributions`, () => {
    const { scene, tool, field, mapState } = fixture(kind);
    const savedSettings = JSON.stringify(mapState.lighting);
    tool.update();
    assertFieldAt(field, kind, destination);
    assert.equal(JSON.stringify(mapState.lighting), savedSettings);
    assert.equal(mapState.commandInvoker.undoStack.length, 0);

    // Moving the pointer must remove the previous ghost, not accumulate copies.
    scene.currentPos = { x: 11, y: 11, valid: true };
    tool.update();
    assertFieldAt(field, kind, scene.currentPos);
    tool.cancel();
    tool.update();
    assertFieldAt(field, kind, origin);
    assert.equal(mapState.dirty, false);
  });

  test(`${kind}: committing an active preview then undoing/redoing leaves no light residue`, () => {
    const { scene, tool, field, mapState } = fixture(kind);
    tool.update();
    tool.handleLeftPointerDown(scene);
    tool.update();
    assertFieldAt(field, kind, destination);
    assert.equal(mapState.commandInvoker.undoStack.length, 1);
    assert.equal(field.sources.size, 2);
    assert.equal(mapState.dirty, true);

    mapState.commandInvoker.undo();
    tool.update();
    assertFieldAt(field, kind, origin);
    assert.equal(field.sources.size, 2);
    assert.equal(mapState.dirty, false);
    mapState.commandInvoker.redo();
    tool.update();
    assertFieldAt(field, kind, destination);
    assert.equal(field.sources.size, 2);
  });
}

test("moving the pointer redraws only the placement guide, and nothing while selecting", () => {
  const { scene } = fixture("lamp");
  scene.map.renderList = [];
  scene.map.camera.getWorldPoint = (x, y) => ({ x, y });
  // Count how often each guide layer is cleared, in creation order: the
  // view guides, then the cursor guide.
  const layers = [];
  scene.add.graphics = () => {
    const layer = drawingStub();
    layer.clears = 0;
    layer.clear = () => {
      layer.clears++;
      return layer;
    };
    layers.push(layer);
    return layer;
  };
  const tool = new LightingTool(scene);
  const [view, cursor] = layers;
  let state = {
    mode: "select",
    preset: "street",
    selection: { ...origin, kind: "lamp" },
    preview: true,
    guides: true,
  };
  scene.data = { get: () => state };
  const move = (x, y) => {
    scene.currentPos = { x, y, valid: true };
    return tool.update();
  };

  assert.equal(move(1, 1), true);
  assert.deepEqual([view.clears, cursor.clears], [1, 1]);
  assert.equal(move(2, 1), false, "selecting ignores the pointer");
  assert.equal(move(3, 2), false);
  assert.deepEqual([view.clears, cursor.clears], [1, 1]);

  state = { ...state, mode: "place", preset: "free" };
  assert.equal(move(4, 4), true);
  assert.deepEqual([view.clears, cursor.clears], [2, 2]);
  assert.equal(move(5, 4), true);
  assert.equal(move(6, 4), true);
  assert.deepEqual(
    [view.clears, cursor.clears],
    [2, 4],
    "placing redraws the cursor guide alone",
  );

  // Panning still redraws everything in view.
  scene.map.scrollX += 10;
  assert.equal(tool.update(), true);
  assert.deepEqual([view.clears, cursor.clears], [3, 5]);
});

test("a lamp's part ghosts release their graphics when a one-tile lamp is chosen", () => {
  const { scene } = fixture("lamp");
  // One counted texture reference per graphic.
  const entries = new Map();
  scene.textureCache.getResource = (_file, resource) => {
    if (!entries.has(resource))
      entries.set(resource, {
        loadingComplete: null,
        refCount: 0,
        incRef() {
          this.refCount++;
        },
        decRef() {
          assert.ok(this.refCount > 0, "released twice");
          this.refCount--;
        },
        asset: {
          getFrame: () => ({ width: 32, height: 64, name: "art", texture: {} }),
        },
      });
    return entries.get(resource);
  };
  let state = {
    mode: "place",
    preset: "fireplace",
    selection: null,
    preview: false,
    guides: false,
  };
  scene.data = { get: () => state };
  scene.currentPos = { x: 2, y: 2, valid: true };
  const tool = new LightingTool(scene);
  tool.update();
  assert.equal(entries.get(178)?.refCount, 1, "the right-hand half's ghost");

  state = { ...state, preset: "street" };
  tool.update();
  assert.equal(entries.get(178).refCount, 0);
  tool.dispose();
  assert.ok([...entries.values()].every(({ refCount }) => refCount === 0));
});

test("switching from a fireplace to a free light releases every ghost texture", () => {
  const { scene } = fixture("lamp");
  const refs = new Map();
  scene.textureCache.getResource = (_file, resource) => {
    if (!refs.has(resource))
      refs.set(resource, {
        loadingComplete: null,
        refCount: 0,
        incRef() {
          this.refCount++;
        },
        decRef() {
          this.refCount--;
        },
        asset: {
          getFrame: () => ({ width: 32, height: 64, name: "art", texture: {} }),
        },
      });
    return refs.get(resource);
  };
  let state = {
    mode: "place",
    preset: "fireplace",
    selection: null,
    preview: false,
    guides: false,
  };
  scene.data = { get: () => state };
  scene.currentPos = { x: 2, y: 2, valid: true };
  const tool = new LightingTool(scene);
  tool.update();
  assert.deepEqual(
    [refs.get(177).refCount, refs.get(178).refCount],
    [1, 1],
    "the hearth and its half are shown",
  );
  // A free light has no ghost, so it holds neither.
  state = { ...state, preset: "free" };
  tool.update();
  assert.deepEqual([refs.get(177).refCount, refs.get(178).refCount], [0, 0]);
});
