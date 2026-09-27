import { Tool } from "./tool";
import {
  lampKey,
  lampFitsAt,
  lampOwning,
  lampTiles,
  placedLampTiles,
  freeLightAt,
  lightSettings,
  presetById,
} from "../lighting/model/lamps.js";
import { selectedLight, withLight } from "../lighting/model/settings.js";
import { LightingCommand } from "../command/lighting-command";
import { LightKind } from "../lighting/model/light-kind.js";
import { LightingGuides } from "./lighting-guides.js";

// What the Lighting tool's clicks do: select a light, place one, or move
// one. What it draws over the map is LightingGuides' business.
export class LightingTool extends Tool {
  constructor(scene) {
    super();
    this.scene = scene;
    this.guides = new LightingGuides(scene);
    scene.events.once("shutdown", () => this.dispose());
  }

  get state() {
    return this.scene.data.get("lightingToolState");
  }

  notify(patch) {
    this.scene.events.emit("lighting-tool-state", {
      ...this.state,
      notice: "",
      ...patch,
    });
  }

  // Drops the light previewed under the pointer, if any.
  clearPreview() {
    this.guides.clearPreview();
  }

  pointerDown(scene, pointer, updatePosition) {
    // Tall windows can project outside the map's ground footprint. Picking
    // their visible glass must not depend on the tile underneath the cursor.
    if (pointer.button === 0 && this.state.mode === "select") {
      const window = scene.map.lighting.pickWindow(pointer.x, pointer.y);
      if (window) {
        this.clearPreview();
        this.notify({
          selection: {
            x: window.x,
            y: window.y,
            layer: window.layer,
            kind: LightKind.Window,
          },
        });
        return;
      }
    }
    super.pointerDown(scene, pointer, updatePosition);
  }

  handleLeftPointerDown(scene) {
    const state = this.state;
    const { x, y } = scene.currentPos;
    const current = scene.mapState.lighting;
    // Either half of a lamp drawn across tiles selects the lamp itself.
    const existing =
      (state.preset === "free"
        ? freeLightAt(scene.emf, current, x, y)
        : lampOwning(scene.emf, current, x, y)) ||
      freeLightAt(scene.emf, current, x, y) ||
      lampOwning(scene.emf, current, x, y);
    this.clearPreview();
    if (state.mode === "select") {
      this.notify({
        selection: existing
          ? { x: existing.x, y: existing.y, kind: existing.kind }
          : null,
        notice: existing
          ? ""
          : "Select a lamp base, a window’s glass or a free-light marker.",
      });
      return;
    }
    const origin =
      state.mode === "move"
        ? selectedLight(scene.emf, current, state.selection)
        : null;
    if (origin && origin.x === x && origin.y === y) {
      this.notify({ mode: "select" });
      return;
    }
    const preset = origin || presetById(state.preset);
    if (preset?.kind === LightKind.Free) {
      if (freeLightAt(scene.emf, current, x, y)) {
        this.notify({
          notice:
            "This tile already has a free light. Select it to adjust it, or choose another tile.",
        });
        return;
      }
      let lighting = origin ? withLight(current, origin, null) : current;
      lighting = withLight(
        lighting,
        { kind: LightKind.Free, key: `${x},${y}` },
        origin || state.duplicate || preset,
      );
      scene.commandInvoker.finalizeAggregate();
      scene.commandInvoker.add(new LightingCommand(scene.mapState, lighting));
      this.notify({
        mode: "select",
        selection: { x, y, kind: LightKind.Free },
        duplicate: null,
        notice: origin
          ? "Free light moved."
          : "Free light placed. No graphic was added to the map.",
      });
      return;
    }
    if (preset && !lampFitsAt(scene.emf, preset, x, y, origin)) {
      this.notify({
        notice: preset.parts?.length
          ? "This lamp covers more than one tile. Choose a spot where they are all empty."
          : "This tile already has an object. Choose an empty tile.",
      });
      return;
    }
    if (
      !preset ||
      !lampTiles(preset, x, y).every(({ graphic }) =>
        scene.gfxLoader.resourceInfo(4, graphic + 100),
      )
    ) {
      this.notify({
        mode: "select",
        notice: "This lamp is not available in the loaded graphics.",
      });
      return;
    }
    const settings = lightSettings(
      origin || state.duplicate || { ...preset, enabled: true },
    );
    const lighting = {
      ...current,
      lamps: { ...current.lamps, [lampKey(x, y, preset.graphic)]: settings },
    };
    // Vacate the old tiles before filling the new ones; they may overlap.
    const tiles = lampTiles(preset, x, y);
    if (origin) {
      delete lighting.lamps[origin.key];
      tiles.unshift(
        ...placedLampTiles(scene.emf, origin).map((tile) => ({
          ...tile,
          graphic: null,
        })),
      );
    }
    scene.commandInvoker.finalizeAggregate();
    scene.commandInvoker.add(
      new LightingCommand(scene.mapState, lighting, tiles),
    );
    this.notify({
      mode: "select",
      selection: { x, y, kind: LightKind.Lamp },
      duplicate: null,
      notice: origin
        ? "Lamp moved. Undo restores its previous position."
        : "Lamp placed. Adjust its light below, or place another.",
    });
  }

  handleRightPointerDown() {
    this.cancel();
  }

  cancel() {
    this.clearPreview();
    this.notify({ mode: "select", duplicate: null });
  }

  // Whether the guides were redrawn.
  update() {
    return this.guides.update(this.state);
  }

  dispose() {
    this.guides.dispose();
  }
}
