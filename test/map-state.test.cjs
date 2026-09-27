const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");

const { MapState } = require("../src/core/state/map-state");
const { EMF } = require("../src/core/data/emf");

// A command that counts how often the undo stack asks whether it is a
// lighting-only edit.
function command(affectsMap, counter) {
  return {
    execute() {},
    undo() {},
    get affectsMap() {
      counter.reads++;
      return affectsMap;
    },
  };
}

function naiveMapCommand(state) {
  const stack = state.commandInvoker.undoStack;
  for (let i = stack.length - 1; i >= 0; i--)
    if (stack[i].affectsMap !== false) return stack[i];
  return null;
}

test("the newest map command survives any mix of edits, undo and redo", () => {
  const state = MapState.fromEMF(EMF.new(4, 4, "History"));
  const counter = { reads: 0 };
  const invoker = state.commandInvoker;
  let seed = 11;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let step = 0; step < 3000; step++) {
    const roll = random();
    if (roll < 0.15) invoker.add(command(true, counter));
    else if (roll < 0.65) invoker.add(command(false, counter));
    else if (roll < 0.85) invoker.undo();
    else invoker.redo();
    const expected = naiveMapCommand(state);
    assert.equal(state.currentMapCommand, expected, `step ${step}`);
  }
});

test("dirty stays cheap across a long run of lighting edits", () => {
  const state = MapState.fromEMF(EMF.new(4, 4, "History"));
  const counter = { reads: 0 };
  const map = command(true, counter);
  state.commandInvoker.add(map);
  state.saved();
  const edits = 2000;
  for (let i = 0; i < edits; i++) {
    state.commandInvoker.add(command(false, counter));
    // Each edit is followed by a dirty check, as in the editor.
    assert.equal(state.currentMapCommand, map);
  }
  // A scan past every lighting edit would read about edits^2 / 2 = 2,000,000
  // times; remembering the map command beneath each keeps it linear.
  assert.ok(counter.reads < edits * 3, `${counter.reads} reads`);
});
