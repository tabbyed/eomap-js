import { EOBuilder } from "../../data/eo-builder";
import { serializeLighting } from "./lighting-file.js";

const pendingSaves = new WeakMap();

// A map and its companion form one write operation. Failed writes reject their
// caller, but the settled queue tail lets the next requested save run normally.
function enqueueSave(state, write) {
  const result = (pendingSaves.get(state) ?? Promise.resolve()).then(write);
  const release = () => {
    if (pendingSaves.get(state) === tail) pendingSaves.delete(state);
  };
  const tail = result.then(release, release);
  pendingSaves.set(state, tail);
  return result;
}

// Capture both files and the history checkpoint before the first asynchronous
// write. Edits made while saving remain dirty. A partial failure marks neither
// file clean, so the user can retry the pair safely.
//
// Without a companion file only the map is written. Lighting that needs one
// stays unsaved rather than blocking the map, until a lighting file is chosen.
export async function saveMapWithLighting(state) {
  // A drawing aggregate is mutable until finalized. Further brush edits during
  // the asynchronous write must form a new command, not extend this checkpoint.
  state.commandInvoker.finalizeAggregate();
  const builder = new EOBuilder();
  state.emf.write(builder);
  const data = builder.build();
  const mapHandle = state.fileHandle;
  const lightingHandle = state.lightingFileHandle;
  const lighting = lightingHandle
    ? serializeLighting(state.emf, state.lighting)
    : null;
  const savedLighting = state.lightingJson;
  // Default lighting needs no file, so a map-only save covers it too.
  const lightingSaved = Boolean(lightingHandle) || !state.hasLightingMetadata;
  const savedCommand = state.currentMapCommand;
  return enqueueSave(state, async () => {
    await mapHandle.write(data);
    if (lightingHandle) await lightingHandle.write(lighting);
    if (
      state.fileHandle === mapHandle &&
      state.lightingFileHandle === lightingHandle
    ) {
      state.lastSavedCommand = savedCommand;
      if (lightingSaved) state.savedLighting = savedLighting;
    }
  });
}

// Snapshot before joining the same queue as pair saves, so edits made while
// waiting remain dirty. A delayed export cannot replace a newer destination.
export async function saveLighting(state, handle) {
  const mapHandle = state.fileHandle;
  const lightingHandle = state.lightingFileHandle;
  const lighting = serializeLighting(state.emf, state.lighting);
  const savedLighting = state.lightingJson;
  return enqueueSave(state, async () => {
    await handle.write(lighting);
    if (
      state.fileHandle !== mapHandle ||
      state.lightingFileHandle !== lightingHandle
    )
      return false;
    state.lightingFileHandle = handle;
    state.savedLighting = savedLighting;
    return true;
  });
}
