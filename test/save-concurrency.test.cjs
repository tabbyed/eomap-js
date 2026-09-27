const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");
const { EMF } = require("../src/core/data/emf");
const { EOReader } = require("../src/core/data/eo-reader");
const { MapState } = require("../src/core/state/map-state");
const {
  saveMapWithLighting,
  saveLighting,
} = require("../src/core/state/lighting-save");
const { mapFingerprint } = require("../src/core/lighting/file/lighting-file");

const nextTurn = () => new Promise(setImmediate);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const state = MapState.fromEMF(EMF.new(8, 8, "Save concurrency"));
  state.fileHandle = { name: "map.emf", async write() {} };
  state.lightingFileHandle = { name: "map.lighting.json", async write() {} };
  return state;
}

function ambient(state, brightness) {
  state.lighting = {
    ...state.lighting,
    ambient: { color: "#ffffff", brightness },
  };
}

function draw(state, graphic) {
  const previous = state.emf.getTile(2, 2).gfx[1];
  state.commandInvoker.add(
    {
      execute() {
        state.emf.getTile(2, 2).gfx[1] = graphic;
      },
      undo() {
        state.emf.getTile(2, 2).gfx[1] = previous;
      },
    },
    true,
  );
  return state.currentMapCommand;
}

function readMap(data) {
  return EMF.read(
    new EOReader(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    ),
  );
}

test("overlapping pair saves retain request snapshots and cannot extend brush checkpoints", async () => {
  const state = fixture();
  const writes = [],
    gates = [],
    maps = [],
    companions = [];
  state.fileHandle.write = (data) => {
    const map = readMap(data);
    maps.push(map);
    writes.push(`map:${map.getTile(2, 2).gfx[1]}`);
    const gate = deferred();
    gates.push(gate);
    return gate.promise;
  };
  state.lightingFileHandle.write = async (text) => {
    const lighting = JSON.parse(text);
    companions.push(lighting);
    writes.push(`lighting:${lighting.ambient.brightness}`);
  };

  const firstCommand = draw(state, 7);
  ambient(state, 0.3);
  const first = saveMapWithLighting(state);
  const secondCommand = draw(state, 6);
  ambient(state, 0.4);
  const second = saveMapWithLighting(state);
  const latestCommand = draw(state, 400);
  ambient(state, 0.5);
  await nextTurn();
  assert.deepEqual(writes, ["map:7"]);
  assert.notEqual(firstCommand, secondCommand);
  assert.notEqual(secondCommand, latestCommand);

  gates[0].resolve();
  await first;
  await nextTurn();
  assert.deepEqual(writes, ["map:7", "lighting:0.3", "map:6"]);
  assert.equal(state.lastSavedCommand, firstCommand);
  assert.equal(state.dirty, true);
  gates[1].resolve();
  await second;
  assert.deepEqual(writes, ["map:7", "lighting:0.3", "map:6", "lighting:0.4"]);
  assert.equal(state.lastSavedCommand, secondCommand);
  assert.equal(JSON.parse(state.savedLighting).ambient.brightness, 0.4);
  assert.equal(state.currentMapCommand, latestCommand);
  assert.equal(state.dirty, true);
  companions.forEach((lighting, i) =>
    assert.equal(lighting.map.fingerprint, mapFingerprint(maps[i])),
  );
});

test("an old destination finishing cannot mark a failed newer Save As clean", async () => {
  const state = fixture();
  const gate = deferred();
  state.fileHandle.write = () => gate.promise;
  const originalSavedLighting = state.savedLighting;
  ambient(state, 0.3);
  const originalSave = saveMapWithLighting(state);
  await nextTurn();
  let newWrites = 0;
  state.fileHandle = {
    name: "new.emf",
    async write() {
      newWrites++;
      throw new Error("Disk full");
    },
  };
  state.lightingFileHandle = { name: "new.lighting.json", async write() {} };
  state.lastSavedCommand = undefined;
  const failedSave = assert.rejects(saveMapWithLighting(state), /Disk full/);
  assert.equal(newWrites, 0);
  gate.resolve();
  await originalSave;
  await failedSave;
  assert.equal(newWrites, 1);
  assert.equal(state.lastSavedCommand, undefined);
  assert.equal(state.savedLighting, originalSavedLighting);
  assert.equal(state.dirty, true);
});

test("lighting-only writes join the pair queue and preserve later edits", async () => {
  const state = fixture();
  const mapGate = deferred(),
    lightingGate = deferred();
  const writes = [];
  let lightingWrites = 0;
  state.fileHandle.write = () => {
    writes.push("map");
    return mapGate.promise;
  };
  state.lightingFileHandle.write = (text) => {
    writes.push(`lighting:${JSON.parse(text).ambient.brightness}`);
    return ++lightingWrites === 2 ? lightingGate.promise : Promise.resolve();
  };
  ambient(state, 0.3);
  const pair = saveMapWithLighting(state);
  ambient(state, 0.4);
  const metadata = saveLighting(state, state.lightingFileHandle);
  ambient(state, 0.5);
  draw(state, 7);
  await nextTurn();
  assert.deepEqual(writes, ["map"]);
  mapGate.resolve();
  await pair;
  await nextTurn();
  assert.deepEqual(writes, ["map", "lighting:0.3", "lighting:0.4"]);
  assert.equal(JSON.parse(state.savedLighting).ambient.brightness, 0.3);

  // A pair requested while the metadata write is pending must wait for it too.
  const laterPair = saveMapWithLighting(state);
  ambient(state, 0.6);
  await nextTurn();
  assert.equal(writes.length, 3);
  lightingGate.resolve();
  assert.equal(await metadata, true);
  await laterPair;
  assert.deepEqual(writes, [
    "map",
    "lighting:0.3",
    "lighting:0.4",
    "map",
    "lighting:0.5",
  ]);
  assert.equal(JSON.parse(state.savedLighting).ambient.brightness, 0.5);
  assert.equal(state.lightingDirty, true);
});

test("a failed write rejects its caller without preventing the next queued save", async () => {
  const state = fixture();
  const gate = deferred();
  let writes = 0;
  state.fileHandle.write = () =>
    ++writes === 1 ? gate.promise : Promise.resolve();
  ambient(state, 0.3);
  const failed = assert.rejects(saveMapWithLighting(state), /Unavailable/);
  ambient(state, 0.4);
  const retry = saveMapWithLighting(state);
  await nextTurn();
  gate.reject(new Error("Unavailable"));
  await failed;
  await retry;
  assert.equal(writes, 2);
  assert.equal(state.dirty, false);
  await nextTurn(); // Node's test runner also checks for unhandled rejections.
});

test("a lighting export cannot install itself after either destination changes", async () => {
  for (const changedDestination of ["fileHandle", "lightingFileHandle"]) {
    const state = fixture();
    const originalSavedLighting = state.savedLighting;
    const gate = deferred();
    const exportHandle = {
      name: "export.lighting.json",
      write: () => gate.promise,
    };
    ambient(state, 0.3);
    const pending = saveLighting(state, exportHandle);
    await nextTurn();
    const replacement = { name: "replacement", async write() {} };
    state[changedDestination] = replacement;
    gate.resolve();
    assert.equal(await pending, false);
    assert.equal(state[changedDestination], replacement);
    assert.notEqual(state.lightingFileHandle, exportHandle);
    assert.equal(state.savedLighting, originalSavedLighting);
    assert.equal(state.lightingDirty, true);
  }
});

test("installing a lighting export clears only its captured metadata and leaves map edits dirty", async () => {
  const state = fixture();
  const gate = deferred();
  const exportHandle = {
    name: "export.lighting.json",
    write: () => gate.promise,
  };
  draw(state, 7);
  ambient(state, 0.3);
  const pending = saveLighting(state, exportHandle);
  await nextTurn();
  gate.resolve();
  assert.equal(await pending, true);
  assert.equal(state.lightingFileHandle, exportHandle);
  assert.equal(state.lightingDirty, false);
  assert.equal(state.lastSavedCommand, null);
  assert.equal(state.dirty, true);
});

test("separate maps can save independently", async () => {
  const firstState = fixture(),
    secondState = fixture();
  const gate = deferred();
  firstState.fileHandle.write = () => gate.promise;
  const first = saveMapWithLighting(firstState);
  ambient(secondState, 0.3);
  await saveMapWithLighting(secondState);
  assert.equal(secondState.dirty, false);
  gate.resolve();
  await first;
});
