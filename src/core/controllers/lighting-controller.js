import { LightingCommand } from "../command/lighting-command";
import { LightingAction } from "./lighting-actions.js";
import { saveLighting } from "../state/lighting-save.js";
import {
  ambientSettings,
  lightEntry,
  selectedLight,
  withLight,
} from "../lighting/model/settings.js";
import { lightSettings, placedLampTiles } from "../lighting/model/lamps.js";
import { readLightingFile } from "../lighting/file/lighting-file.js";
import { LightKind } from "../lighting/model/light-kind.js";

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
    const light = selectedLight(state.emf, state.lighting, selection);
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
        case LightingAction.TogglePreview:
          updateTool({ preview: value });
          return;
        case LightingAction.ToggleGuides:
          updateTool({ guides: value });
          return;
        case LightingAction.ChoosePreset:
          updateTool({ preset: value, mode: "place", duplicate: null });
          return;
        case LightingAction.Place:
          updateTool({ mode: "place", duplicate: null });
          return;
        case LightingAction.Select:
          updateTool({ mode: "select", duplicate: null });
          return;
        case LightingAction.ResetWindow:
          if (light?.kind !== LightKind.Window) return;
          this.commit(state, withLight(state.lighting, light, null));
          updateTool({
            notice: `${light.name} reset. Undo restores your settings.`,
          });
          return;
        case LightingAction.Move:
          if (light && light.kind !== LightKind.Window)
            updateTool({ mode: "move" });
          return;
        case LightingAction.Duplicate:
          if (light && light.kind !== LightKind.Window)
            updateTool({
              mode: "place",
              preset: light.id,
              duplicate: lightSettings(light),
            });
          return;
        case LightingAction.Delete:
          if (!light || light.kind === LightKind.Window) return;
          this.commit(
            state,
            withLight(state.lighting, light, null),
            light.kind === LightKind.Free
              ? []
              : placedLampTiles(state.emf, light).map((tile) => ({
                  ...tile,
                  graphic: null,
                })),
          );
          updateTool({
            selection: null,
            mode: "select",
            notice:
              light.kind === LightKind.Free
                ? "Free light deleted. Undo restores it."
                : "Lamp deleted. Undo restores the lamp and its light.",
          });
          return;
        case LightingAction.EditLight:
        case LightingAction.PreviewLight:
        case LightingAction.EditAmbient:
        case LightingAction.PreviewAmbient:
          this.edit(state, type, light, value);
          return;
        case LightingAction.Load:
          await this.load(state, updateTool);
          return;
        case LightingAction.Save:
          await this.save(state, updateTool);
          return;
      }
    } catch (error) {
      if (error.name !== "AbortError") updateTool({ notice: error.message });
    }
  }

  edit(state, type, light, value) {
    const ambient =
      type === LightingAction.EditAmbient ||
      type === LightingAction.PreviewAmbient;
    const preview =
      type === LightingAction.PreviewLight ||
      type === LightingAction.PreviewAmbient;
    if (!ambient && !light) return;
    const next = ambient
      ? {
          ...state.lighting,
          ambient: ambientSettings({ ...state.lighting.ambient, ...value }),
        }
      : withLight(state.lighting, light, { ...light, ...value });
    const scene = this.host.editor?.game?.scene.getScene("editor");
    scene?.tools?.get("lighting")?.clearPreview();
    // Move straight from the displayed preview to the next one; the light
    // field only recomputes the lights that differ.
    if (preview) state.gameObject.previewLighting(next);
    else if (
      // An edit replaces the ambient light or one light's entry and keeps
      // every other key in place, so comparing that part is O(1) rather
      // than serializing all the lighting twice.
      ambient
        ? JSON.stringify(next.ambient) !==
          JSON.stringify(state.lighting.ambient)
        : JSON.stringify(lightEntry(next, light)) !==
          JSON.stringify(lightEntry(state.lighting, light))
    )
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
