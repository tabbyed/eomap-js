import { LightingCommand } from "../command/lighting-command";
import { saveLighting } from "../lighting/save.js";
import {
  ambientSettings,
  lightSettings,
  readLightingFile,
  selectedLight,
  withLight,
} from "../lighting/lamps.js";

const MAX_LIGHTING_FILE_SIZE = 4 * 1024 * 1024;

// Handles the lighting panel's actions for the application.
//
// Committed lighting lives in `mapState.lighting` and changes only through
// LightingCommand, so undo covers it. Anything shown without being committed
// (an inspector slider being dragged, or the tool's placement preview) is a
// preview: `clearPreview` drops all of it, and every commit drops it too.
export class LightingController {
  constructor(host) {
    // The Application: its mapState, commandInvoker, fileSystemProvider,
    // editor and lightingToolState.
    this.host = host;
  }

  clearPreview() {
    const scene = this.host.editor?.game?.scene.getScene("editor");
    scene?.tools?.get("lighting")?.clearPreview();
    this.host.mapState.gameObject?.clearLightingPreview();
  }

  pickerOptions() {
    return {
      suggestedName:
        this.host.mapState.filename.replace(/\.emf$/i, "") + ".lighting.json",
      types: [
        {
          description: "Map lighting",
          accept: { "application/json": [".json"] },
        },
      ],
    };
  }

  commit(state, lighting, tiles) {
    const commandInvoker = this.host.commandInvoker;
    commandInvoker.finalizeAggregate();
    commandInvoker.add(new LightingCommand(state, lighting, tiles));
  }

  // `target` is the selection an inspector control was editing. A colour
  // picker can still be open when another light is selected on the map, and
  // its final value belongs to the light it was opened for.
  async handle({ type, value, target }) {
    const host = this.host;
    const state = host.mapState;
    if (!state.loaded) return;
    const selection = target ?? host.lightingToolState.selection;
    const lamp = selectedLight(state.emf, state.lighting, selection);
    const updateTool = (patch) => {
      if (host.mapState !== state) return;
      this.clearPreview();
      host.lightingToolState = {
        ...host.lightingToolState,
        notice: "",
        ...patch,
      };
    };
    try {
      switch (type) {
        case "preview":
          updateTool({ preview: value });
          return;
        case "guides":
          updateTool({ guides: value });
          return;
        case "preset":
          updateTool({ preset: value, mode: "place", duplicate: null });
          return;
        case "place":
          updateTool({ mode: "place", duplicate: null });
          return;
        case "select":
          updateTool({ mode: "select", duplicate: null });
          return;
        case "window-default":
          if (lamp?.kind !== "window") return;
          this.commit(state, withLight(state.lighting, lamp, null));
          updateTool({
            notice: `${lamp.name} reset. Undo restores your settings.`,
          });
          return;
        case "move":
          if (lamp && lamp.kind !== "window") updateTool({ mode: "move" });
          return;
        case "duplicate":
          if (lamp && lamp.kind !== "window")
            updateTool({
              mode: "place",
              preset: lamp.id,
              duplicate: lightSettings(lamp),
            });
          return;
        case "delete":
          if (!lamp || lamp.kind === "window") return;
          this.commit(
            state,
            withLight(state.lighting, lamp, null),
            lamp.kind === "free"
              ? []
              : [{ x: lamp.x, y: lamp.y, graphic: null }],
          );
          updateTool({
            selection: null,
            mode: "select",
            notice:
              lamp.kind === "free"
                ? "Free light deleted. Undo restores it."
                : "Lamp deleted. Undo restores the lamp and its light.",
          });
          return;
        case "lamp":
        case "preview-lamp":
        case "ambient":
        case "preview-ambient":
          this.edit(state, type, lamp, value);
          return;
        case "load":
          await this.load(state, updateTool);
          return;
        case "save":
          await this.save(state, updateTool);
          return;
      }
    } catch (error) {
      if (error.name !== "AbortError") updateTool({ notice: error.message });
    }
  }

  edit(state, type, lamp, value) {
    if (type.endsWith("lamp") && !lamp) return;
    const next = type.endsWith("ambient")
      ? {
          ...state.lighting,
          ambient: ambientSettings({ ...state.lighting.ambient, ...value }),
        }
      : withLight(state.lighting, lamp, { ...lamp, ...value });
    const scene = this.host.editor?.game?.scene.getScene("editor");
    scene?.tools?.get("lighting")?.clearPreview();
    // Move straight from the displayed preview to the next one; the light
    // field only recomputes the lights that differ.
    if (type.startsWith("preview-")) state.gameObject.previewLighting(next);
    else if (JSON.stringify(next) !== JSON.stringify(state.lighting))
      this.commit(state, next);
    else state.gameObject.clearLightingPreview();
  }

  async load(state, updateTool) {
    const host = this.host;
    const [handle] = await host.fileSystemProvider.showOpenFilePicker(
      this.pickerOptions(),
    );
    const file = await handle.getFile();
    if (file.size > MAX_LIGHTING_FILE_SIZE)
      throw new Error("Lighting files must be smaller than 4 MB.");
    const { lighting, mapChanged, dropped } = readLightingFile(
      await file.text(),
      state.emf,
    );
    if (host.mapState !== state) return;
    this.commit(state, lighting);
    state.lightingFileHandle = handle;
    let notice = "Lighting loaded.";
    if (dropped)
      notice = `The map changed since this lighting was saved. Skipped ${dropped} ${dropped === 1 ? "light that no longer matches" : "lights that no longer match"}.`;
    else if (mapChanged)
      notice =
        "Lighting loaded. The map changed since it was saved, but every light still matches.";
    updateTool({ notice: `${notice} Undo restores your previous lighting.` });
  }

  async save(state, updateTool) {
    const host = this.host;
    const handle = await host.fileSystemProvider.showSaveFilePicker(
      this.pickerOptions(),
    );
    if (host.mapState !== state) return;
    if (!(await saveLighting(state, handle)) || host.mapState !== state) return;
    host.onMapStateChange();
    updateTool({
      notice: "Lighting saved. Save the EMF too if you placed or moved lamps.",
    });
  }
}
