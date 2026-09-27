const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const babel = require("@babel/core");
require("../scripts/register-core.cjs");

const model = require("../src/core/lighting/lamps");
const { LightField } = require("../src/core/lighting/light-field");
const { LightingCommand } = require("../src/core/command/lighting-command");
const {
  saveMapWithLighting,
  saveLighting,
} = require("../src/core/lighting/save");
const { MapState } = require("../src/core/state/map-state");
const {
  LightingController,
} = require("../src/core/controllers/lighting-controller");
const { EMF } = require("../src/core/data/emf");

// Load the real application methods without booting Lit, Spectrum or a GPU.
// Parsing method boundaries avoids a second implementation of UI orchestration.
const source = fs.readFileSync(
  path.resolve(__dirname, "../src/core/components/application.js"),
  "utf8",
);
const ast = babel.parseSync(source, {
  parserOpts: { plugins: ["decorators-legacy"] },
});
const application = ast.program.body.find(
  (node) =>
    node.type === "ExportNamedDeclaration" &&
    node.declaration?.id?.name === "Application",
).declaration;
const names = new Set(["save", "saveAs"]);
const methods = application.body.body
  .filter((node) => names.has(node.key?.name))
  .map((node) => source.slice(node.start, node.end))
  .join("\n");
const dependencies = {
  ...model,
  LightingCommand,
  saveLighting,
  saveMapWithLighting,
};
const ApplicationMethods = new Function(
  ...Object.keys(dependencies),
  `return class { ${methods} };`,
)(...Object.values(dependencies));

function fixture() {
  const emf = EMF.new(16, 16, "Integration");
  emf.getTile(5, 5).gfx[1] = 7;
  const state = MapState.fromEMF(emf);
  const field = new LightField(emf, state.lighting);
  state.gameObject = {
    committed: state.lighting,
    setLighting(value) {
      this.committed = value;
      field.setSettings(value);
    },
    previewLighting: (value) => field.setSettings(value),
    clearLightingPreview() {
      field.setSettings(this.committed);
    },
  };
  const app = Object.assign(new ApplicationMethods(), {
    mapState: state,
    lightingToolState: {
      mode: "select",
      selection: { kind: "lamp", x: 5, y: 5 },
    },
    commandInvoker: state.commandInvoker,
    onMapStateChange() {},
    emfPickerOptions: () => ({ kind: "emf" }),
  });
  app.lightingController = new LightingController(app);
  return { app, state, field, emf };
}

test("slider previews replace one contribution directly; committing the visible value does not rebake", async () => {
  const { app, state, field } = fixture();
  let bakes = 0;
  const accumulate = field.accumulate.bind(field);
  field.accumulate = (...args) => {
    bakes++;
    accumulate(...args);
  };
  await app.lightingController.handle({
    type: "preview-lamp",
    value: { brightness: 1.7 },
  });
  assert.equal(bakes, 2);
  bakes = 0;
  await app.lightingController.handle({
    type: "preview-lamp",
    value: { brightness: 1.8 },
  });
  assert.equal(
    bakes,
    2,
    "the baseline must not be restored between input events",
  );
  assert.equal(
    state.commandInvoker.undoStack.length,
    0,
    "previews are not history entries",
  );
  bakes = 0;
  await app.lightingController.handle({
    type: "lamp",
    value: { brightness: 1.8 },
  });
  assert.equal(bakes, 0);
  assert.equal(state.commandInvoker.undoStack.length, 1);
  state.commandInvoker.undo();
  assert.equal(model.lampAt(state.emf, state.lighting, 5, 5).brightness, 1.6);
});

test("cancelling the companion Save As picker retains both original destinations", async () => {
  const { app, state } = fixture();
  state.lighting = {
    ...state.lighting,
    ambient: { brightness: 0.3, color: "#ffffff" },
  };
  const originalMap = (state.fileHandle = { name: "old.emf" });
  const originalLighting = (state.lightingFileHandle = {
    name: "old.lighting.json",
  });
  let picks = 0,
    saves = 0;
  app.fileSystemProvider = {
    async showSaveFilePicker(options) {
      if (++picks === 1) return { name: "new.emf" };
      assert.equal(options.suggestedName, "new.lighting.json");
      const error = new Error("Cancelled");
      error.name = "AbortError";
      throw error;
    },
  };
  app.save = async () => saves++;
  await app.saveAs();
  assert.equal(picks, 2);
  assert.equal(saves, 0);
  assert.equal(state.fileHandle, originalMap);
  assert.equal(state.lightingFileHandle, originalLighting);
});

test("Save As cannot attach a delayed destination to a newly opened map", async () => {
  const { app, state } = fixture();
  const replacement = MapState.fromEMF(EMF.new(8, 8, "Other"));
  let saves = 0;
  app.fileSystemProvider = {
    async showSaveFilePicker() {
      app.mapState = replacement;
      return { name: "wrong.emf" };
    },
  };
  app.save = async () => saves++;
  await app.saveAs();
  assert.equal(replacement.fileHandle, null);
  assert.equal(state.fileHandle, null);
  assert.equal(saves, 0);
});

test("a failed Save As remains dirty even when the original files were already saved", async () => {
  const { app, state } = fixture();
  assert.equal(state.dirty, false);
  app.fileSystemProvider = {
    async showSaveFilePicker() {
      return {
        name: "new.emf",
        async write() {
          throw new Error("Disk full");
        },
      };
    },
  };
  app.save = () => saveMapWithLighting(state);
  await assert.rejects(app.saveAs(), /Disk full/);
  assert.equal(state.dirty, true);
});

test("saving cannot silently discard lighting when no companion destination exists", async () => {
  const { state } = fixture();
  state.lighting = {
    ...state.lighting,
    ambient: { color: "#ffffff", brightness: 0.3 },
  };
  let writes = 0;
  state.fileHandle = {
    async write() {
      writes++;
    },
  };
  await assert.rejects(saveMapWithLighting(state), /companion/);
  assert.equal(writes, 0);
  assert.equal(state.dirty, true);
});

test("a delayed save failure cannot show a retry prompt for another map", async () => {
  const { app, state } = fixture();
  const replacement = MapState.fromEMF(EMF.new(8, 8, "Other"));
  let prompts = 0;
  app.showPrompt = () => prompts++;
  state.fileHandle = {
    name: "old.emf",
    async write() {
      app.mapState = replacement;
      throw new Error("Disconnected");
    },
  };
  await app.save();
  assert.equal(prompts, 0);
  assert.equal(app.mapState, replacement);
});

test("brush edits arriving during save cannot extend the saved history checkpoint", async () => {
  const { state, emf } = fixture();
  const draw = (x, graphic) => ({
    execute() {
      emf.getTile(x, 2).gfx[0] = graphic;
    },
    undo() {},
  });
  state.commandInvoker.add(draw(2, 10), true);
  state.fileHandle = {
    async write() {
      state.commandInvoker.add(draw(3, 11), true);
    },
  };
  await saveMapWithLighting(state);
  assert.equal(state.commandInvoker.undoStack.length, 2);
  assert.equal(state.dirty, true);
  assert.notEqual(state.lastSavedCommand, state.currentMapCommand);
});

test("a delayed lighting save cannot restore another map's tool selection or preview", async () => {
  const { app, state } = fixture();
  const replacement = MapState.fromEMF(EMF.new(8, 8, "Other"));
  const replacementTool = { mode: "place", preset: "free", selection: null };
  let previewResets = 0;
  replacement.gameObject = {
    clearLightingPreview() {
      previewResets++;
    },
  };
  const handle = {
    async write() {
      app.mapState = replacement;
      app.lightingToolState = replacementTool;
    },
  };
  app.fileSystemProvider = {
    async showSaveFilePicker() {
      return handle;
    },
  };
  await app.lightingController.handle({ type: "save" });
  assert.equal(state.lightingFileHandle, handle);
  assert.equal(app.lightingToolState, replacementTool);
  assert.equal(previewResets, 0);
});

test("sidecars reject ambiguous or stale lamp identities and export only the schema", () => {
  const { emf, state } = fixture();
  const saved = JSON.parse(model.serializeLighting(emf, state.lighting));
  const lamp = model.lightSettings(model.lampAt(emf, state.lighting, 5, 5));
  for (const key of ["05,5,7", "5,5,6", "0,0,7", "16,5,7"])
    assert.throws(() =>
      model.parseLighting(
        JSON.stringify({ ...saved, lamps: { [key]: lamp } }),
        emf,
      ),
    );
  assert.throws(() => model.parseLighting("null", emf), /Unsupported/);
  assert.throws(
    () => model.parseLighting(JSON.stringify({ ...saved, lights: null }), emf),
    /Invalid free/,
  );
  const exported = JSON.parse(
    model.serializeLighting(emf, {
      ...state.lighting,
      version: 999,
      debug: "editor-only",
    }),
  );
  assert.equal(exported.version, 1);
  assert.equal(exported.debug, undefined);
});

test("an edit lands on the light it was opened for after the selection moves", async () => {
  const { app, state } = fixture();
  const target = { kind: "lamp", x: 5, y: 5 };
  await app.lightingController.handle({
    type: "preview-lamp",
    value: { color: "#ff0000" },
    target,
  });
  // The map selection moves before the colour picker reports its value.
  app.lightingToolState = { ...app.lightingToolState, selection: null };
  await app.lightingController.handle({
    type: "lamp",
    value: { color: "#ff0000" },
    target,
  });
  assert.equal(model.lampAt(state.emf, state.lighting, 5, 5).color, "#ff0000");
});

test("committing one setting drops a preview of another", async () => {
  const { app, state, field } = fixture();
  await app.lightingController.handle({
    type: "preview-lamp",
    value: { brightness: 0.2 },
  });
  await app.lightingController.handle({
    type: "ambient",
    value: { brightness: 0.4 },
  });
  assert.equal(model.lampAt(state.emf, state.lighting, 5, 5).brightness, 1.6);
  const committed = new LightField(state.emf, state.lighting);
  for (let i = 0; i < field.values.length; i++)
    assert.ok(Math.abs(field.values[i] - committed.values[i]) < 1e-6);
});
