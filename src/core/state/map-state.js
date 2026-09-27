import { CommandInvoker } from "../command/command";
import { defaultLighting } from "../lighting/model/settings.js";

export class MapState {
  constructor() {
    this.fileHandle = null;
    this.pending = false;
    this.emf = null;
    this.error = null;
    this.gameObject = null;
    this.commandInvoker = new CommandInvoker();
    this.lastSavedCommand = null;
    this.scrollX = null;
    this.scrollY = null;
    this.zoom = null;
    this.lighting = defaultLighting();
    this.lightingFileHandle = null;
    this.savedLighting = JSON.stringify(this.lighting);
    // The user cancelled choosing a lighting file; saves write only the map.
    this.lightingFileDeclined = false;
  }

  static fromFileHandle(fileHandle) {
    return new MapState().withFileHandle(fileHandle);
  }

  static fromEMF(emf) {
    return new MapState().withEMF(emf);
  }

  copy() {
    let copy = new MapState();
    copy.fileHandle = this.fileHandle;
    copy.pending = this.pending;
    copy.emf = this.emf;
    copy.error = this.error;
    copy.gameObject = this.gameObject;
    copy.scrollX = this.scrollX;
    copy.scrollY = this.scrollY;
    copy.zoom = this.zoom;
    copy.lighting = this.lighting;
    copy.lightingFileHandle = this.lightingFileHandle;
    copy.savedLighting = this.savedLighting;
    copy.lightingFileDeclined = this.lightingFileDeclined;
    copy.lastSavedCommand = null;
    return copy;
  }

  withFileHandle(fileHandle) {
    let copy = this.copy();
    copy.fileHandle = fileHandle;
    return copy;
  }

  withPending(pending) {
    let copy = this.copy();
    copy.pending = pending;
    return copy;
  }

  withEMF(emf) {
    let copy = this.copy();
    copy.emf = emf;
    return copy;
  }

  withError(error) {
    let copy = this.copy();
    copy.error = error;
    return copy;
  }

  withGameObject(gameObject) {
    let copy = this.copy();
    copy.gameObject = gameObject;
    return copy;
  }

  get loading() {
    return this.fileHandle !== null && !this.pending && !this.loaded;
  }

  get loaded() {
    return this.emf !== null;
  }

  get dirty() {
    return (
      this.lastSavedCommand !== this.currentMapCommand || this.lightingDirty
    );
  }

  get lightingDirty() {
    return this.savedLighting !== this.lightingJson;
  }

  // Lighting settings are immutable, so each object is serialized at most
  // once. `dirty` is read after every edit; map edits no longer cost O(U).
  get lightingJson() {
    if (this.serializedLighting !== this.lighting) {
      this.serializedLighting = this.lighting;
      this.cachedLightingJson = JSON.stringify(this.lighting);
    }
    return this.cachedLightingJson;
  }

  get currentMapCommand() {
    for (let i = this.commandInvoker.undoStack.length - 1; i >= 0; i--) {
      const command = this.commandInvoker.undoStack[i];
      if (command.affectsMap !== false) return command;
    }
    return null;
  }

  get hasLightingMetadata() {
    return this.lightingJson !== JSON.stringify(defaultLighting());
  }

  // Lighting other than the default is kept in a companion file.
  get needsLightingFile() {
    return this.hasLightingMetadata && !this.lightingFileHandle;
  }

  get filename() {
    if (this.fileHandle) {
      return this.fileHandle.name;
    }
    return "untitled";
  }

  saved() {
    this.lastSavedCommand = this.currentMapCommand;
    this.savedLighting = this.lightingJson;
  }
}
