import { Tool } from "./tool";
import {
  LAMP_PRESETS,
  FREE_LIGHT_PRESET,
  lampAt,
  lampKey,
  freeLightAt,
  lightSettings,
} from "../lighting/model/lamps.js";
import { selectedLight, withLight } from "../lighting/model/settings.js";
import { LightingCommand } from "../command/lighting-command";
import {
  lightGroundRadius,
  projectLight,
} from "../lighting/model/light-geometry.js";
import { emissionAppearance } from "../lighting/appearance/lamp-emission.js";
import { windowGlassSprites } from "../lighting/model/windows.js";

const LAMP_GUIDE = 0xf6c777;
const WINDOW_GUIDE = 0x98ddff;
const INVALID_GUIDE = 0xff8585;

export class LightingTool extends Tool {
  constructor(scene) {
    super();
    this.scene = scene;
    this.guide = scene.add.graphics().setDepth(2);
    this.ghost = scene.add
      .image(0, 0, "__DEFAULT")
      .setDepth(2)
      .setVisible(false);
    this.ghostHalo = scene.add
      .image(0, 0, "__DEFAULT")
      .setDepth(1.9)
      .setVisible(false);
    this.ghostBulb = scene.add
      .image(0, 0, "__DEFAULT")
      .setDepth(2.1)
      .setVisible(false);
    this.previewLight = null;
    this.cacheEntry = null;
    this.signature = "";
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

  clearPreview() {
    if (this.previewLight) {
      this.previewField.setPreview(null);
      this.previewLight = null;
      this.scene.map.lighting.displacedLampKey = null;
      this.scene.map.invalidateCachedFrame();
    }
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
            kind: "window",
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
    const existing =
      (state.preset === "free"
        ? freeLightAt(scene.emf, current, x, y)
        : lampAt(scene.emf, current, x, y)) ||
      freeLightAt(scene.emf, current, x, y) ||
      lampAt(scene.emf, current, x, y);
    this.clearPreview();
    if (state.mode === "select") {
      this.notify({
        selection: existing ? { x, y, kind: existing.kind } : null,
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
    const preset =
      origin ||
      (state.preset === "free"
        ? FREE_LIGHT_PRESET
        : LAMP_PRESETS.find((item) => item.id === state.preset));
    if (preset?.kind === "free") {
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
        { kind: "free", key: `${x},${y}` },
        origin || state.duplicate || preset,
      );
      scene.commandInvoker.finalizeAggregate();
      scene.commandInvoker.add(new LightingCommand(scene.mapState, lighting));
      this.notify({
        mode: "select",
        selection: { x, y, kind: "free" },
        duplicate: null,
        notice: origin
          ? "Free light moved."
          : "Free light placed. No graphic was added to the map.",
      });
      return;
    }
    if (scene.emf.getTile(x, y).gfx[1]) {
      this.notify({
        notice: "This tile already has an object. Choose an empty tile.",
      });
      return;
    }
    if (!preset || !scene.gfxLoader.resourceInfo(4, preset.graphic + 100)) {
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
    const tiles = [{ x, y, graphic: preset.graphic }];
    if (origin) {
      delete lighting.lamps[origin.key];
      tiles.unshift({ x: origin.x, y: origin.y, graphic: null });
    }
    scene.commandInvoker.finalizeAggregate();
    scene.commandInvoker.add(
      new LightingCommand(scene.mapState, lighting, tiles),
    );
    this.notify({
      mode: "select",
      selection: { x, y, kind: "lamp" },
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

  worldToScreen(x, y) {
    const camera = this.scene.map.camera;
    const dirty = camera.dirty;
    camera.preRender();
    camera.dirty = dirty;
    return camera.matrix.transformPoint(x - camera.scrollX, y - camera.scrollY);
  }

  drawGlassOutline(graphic, texture, width, alpha) {
    const map = this.scene.map;
    const origin = this.worldToScreen(graphic.x, graphic.y);
    this.guide.lineStyle(width, WINDOW_GUIDE, alpha);
    for (const [x1, y1, x2, y2] of texture.outline) {
      this.guide.lineBetween(
        origin.x + x1 * map.zoom,
        origin.y + y1 * map.zoom,
        origin.x + x2 * map.zoom,
        origin.y + y2 * map.zoom,
      );
    }
  }

  // Outline every visible sprite showing the window's glass, including the
  // partner half of a window split across two wall bitmaps.
  drawWindowGuide(window) {
    const map = this.scene.map;
    for (const { x, y, spec } of windowGlassSprites(map.emf, window)) {
      const graphic =
        map.tileGraphics[map.getTileGraphicIndex(x, y, window.layer)];
      const texture = map.lighting.textures.getWindow(spec);
      if (graphic && texture && map.renderList.includes(graphic))
        this.drawGlassOutline(graphic, texture, 2, 1);
    }
  }

  // With guides on, every visible lamp and recognised window shows faintly,
  // so the toggle is useful before anything is selected. The selection is
  // drawn over this at full strength. Visits only visible graphics: O(V).
  drawOverview(settings) {
    const map = this.scene.map;
    for (const graphic of map.renderList) {
      if (graphic.layer === 1) {
        const light = lampAt(map.emf, settings, graphic.tileX, graphic.tileY);
        if (light)
          this.drawSourceGuide(light, LAMP_GUIDE, light.enabled ? 0.6 : 0.3);
        continue;
      }
      for (const { spec } of map.lighting.windowGlass(graphic)) {
        const texture = map.lighting.textures.getWindow(spec);
        if (texture) this.drawGlassOutline(graphic, texture, 1.5, 0.6);
      }
    }
  }

  // Ground reach ring, a stem to the source and brackets around the bulb.
  drawSourceGuide(light, color, alpha) {
    const map = this.scene.map;
    const projected = projectLight(light);
    const point = this.worldToScreen(projected.x, projected.groundY);
    const source = this.worldToScreen(projected.x, projected.sourceY);
    const groundRadius = lightGroundRadius(light);
    this.guide.lineStyle(1.5, color, 0.75 * alpha);
    if (groundRadius > 0) {
      // Ground cross-section of the light's reach, before wall occlusion.
      this.guide.strokeEllipse(
        point.x,
        point.y,
        groundRadius * 64 * Math.SQRT2 * map.zoom,
        groundRadius * 32 * Math.SQRT2 * map.zoom,
      );
    }
    this.guide.strokeCircle(point.x, point.y, 3);
    if (source.y !== point.y) {
      this.guide.lineStyle(1, color, 0.35 * alpha);
      this.guide.lineBetween(source.x, source.y, point.x, point.y);
    }
    // Brackets leave the bulb visible instead of drawing a cross over it.
    this.guide.lineStyle(1.5, color, alpha);
    for (const dx of [-1, 1]) {
      for (const dy of [-1, 1]) {
        this.guide.lineBetween(
          source.x + dx * 6,
          source.y + dy * 9,
          source.x + dx * 9,
          source.y + dy * 9,
        );
        this.guide.lineBetween(
          source.x + dx * 9,
          source.y + dy * 6,
          source.x + dx * 9,
          source.y + dy * 9,
        );
      }
    }
  }

  drawFreeLightMarkers(settings) {
    const map = this.scene.map;
    this.worldToScreen(0, 0); // Refresh the camera matrix after panning/zooming.
    // Query only tiles intersecting the viewport, rather than all map lights.
    const corners = [
      [0, 0],
      [map.width, 0],
      [0, map.height],
      [map.width, map.height],
    ].map(([x, y]) => {
      const p = map.camera.getWorldPoint(x, y);
      return { x: p.x / 64 + p.y / 32, y: p.y / 32 - p.x / 64 };
    });
    const minX = Math.max(
      0,
      Math.floor(Math.min(...corners.map((p) => p.x))) - 1,
    );
    const maxX = Math.min(
      map.emf.width - 1,
      Math.ceil(Math.max(...corners.map((p) => p.x))),
    );
    const minY = Math.max(
      0,
      Math.floor(Math.min(...corners.map((p) => p.y))) - 1,
    );
    const maxY = Math.min(
      map.emf.height - 1,
      Math.ceil(Math.max(...corners.map((p) => p.y))),
    );
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const light = freeLightAt(map.emf, settings, x, y);
        if (!light) continue;
        this.drawSourceGuide(light, LAMP_GUIDE, light.enabled ? 0.6 : 0.3);
        // Free lights have no graphic: the marker is what the user clicks.
        const p = this.worldToScreen(
          x * 32 - y * 32 + 32,
          x * 16 + y * 16 + 16,
        );
        this.guide.lineStyle(2, WINDOW_GUIDE, 1);
        this.guide.strokeRect(p.x - 4, p.y - 4, 8, 8);
      }
  }

  update() {
    const scene = this.scene,
      state = this.state;
    if (!state) return false;
    const active = scene.selectedTool === "lighting";
    const map = scene.map;
    const settings = map.lighting.settings || scene.mapState.lighting;
    const signature = [
      active,
      state,
      scene.currentPos.x,
      scene.currentPos.y,
      scene.currentPos.valid,
      map.scrollX,
      map.scrollY,
      map.zoom,
      map.width,
      map.height,
      settings,
      map.lighting.field,
      map.layerVisibility,
      map.renderList,
      map.lighting.textures?.revision,
      this.cacheEntry?.loadingComplete === null,
    ];
    // References are compared too, so inspector edits invalidate the guide.
    if (
      this.signature &&
      signature.every((part, index) => part === this.signature[index])
    )
      return false;
    this.signature = signature;
    this.clearPreview();
    this.guide.clear();
    this.ghost.setVisible(false);
    this.ghostHalo.setVisible(false);
    this.ghostBulb.setVisible(false);
    if (!active) return true;
    if (state.guides) {
      this.drawOverview(settings);
      this.drawFreeLightMarkers(settings);
    }

    let light = selectedLight(scene.emf, settings, state.selection);
    if (light?.kind === "window" && state.mode === "select") {
      if (state.guides) this.drawWindowGuide(light);
      return true;
    }
    const movedLight = state.mode === "move" ? light : null;
    const placing = state.mode !== "select";
    let valid = false;
    if (placing && scene.currentPos.valid) {
      const preset =
        state.mode === "move"
          ? light
          : state.preset === "free"
            ? FREE_LIGHT_PRESET
            : LAMP_PRESETS.find((item) => item.id === state.preset);
      if (preset) {
        light = {
          enabled: true,
          ...preset,
          ...state.duplicate,
          x: scene.currentPos.x,
          y: scene.currentPos.y,
        };
        valid =
          light.kind === "free"
            ? !freeLightAt(scene.emf, settings, light.x, light.y)
            : !scene.emf.getTile(light.x, light.y).gfx[1];
        const entry =
          light.kind === "free"
            ? null
            : scene.textureCache.getResource(4, light.graphic + 100);
        if (entry !== this.cacheEntry) {
          this.cacheEntry?.decRef();
          this.cacheEntry = entry;
          entry?.incRef();
        }
        if (entry && !entry.loadingComplete) {
          const frame = entry.asset.getFrame(0);
          const pos = this.worldToScreen(
            light.x * 32 - light.y * 32 + 30 + (frame.width % 2) / 2,
            light.x * 16 + light.y * 16 + 30,
          );
          this.ghost
            .setTexture(frame.texture.key, frame.name)
            .setOrigin(0.5, 1)
            .setPosition(pos.x, pos.y)
            .setScale(map.zoom)
            .setAlpha(valid ? 0.7 : 0.4)
            .setTint(valid ? 0xffffff : 0xff7070)
            .setVisible(true);
          const appearance = emissionAppearance(light);
          const emission =
            valid && state.preview && appearance.enabled
              ? map.lighting.textures?.get(light.graphic)
              : null;
          if (emission) {
            const projected = projectLight(light);
            const source = this.worldToScreen(projected.x, projected.sourceY);
            this.ghostHalo
              .setTexture(emission.halo.texture.key, emission.halo.name)
              .setOrigin(0.5, 0.5)
              .setPosition(source.x, source.y)
              .setScale(map.zoom)
              .setBlendMode(Phaser.BlendModes.ADD)
              .setTint(appearance.haloColor)
              .setAlpha(appearance.haloAlpha * 0.7)
              .setVisible(true);
            this.ghostBulb
              .setTexture(emission.mask.texture.key, emission.mask.name)
              .setOrigin(0.5, 1)
              .setPosition(pos.x, pos.y)
              .setScale(map.zoom)
              .setTint(appearance.coreColor)
              .setAlpha(appearance.coreAlpha * 0.7)
              .setVisible(true);
          }
        }
        if (valid && state.preview) {
          this.previewLight = light;
          this.previewField = map.lighting.field;
          map.lighting.displacedLampKey =
            movedLight?.kind === "lamp" ? movedLight.key : null;
          // A move previews the same source at its destination, not two lamps.
          map.lighting.field.setPreview({ light: light, replaces: movedLight });
          map.invalidateCachedFrame();
        }
      }
    }
    if (!light || (!state.guides && !placing)) return true;
    this.drawSourceGuide(
      light,
      placing && !valid ? INVALID_GUIDE : LAMP_GUIDE,
      1,
    );
    return true;
  }

  dispose() {
    this.cacheEntry?.decRef();
    this.cacheEntry = null;
    this.previewLight = null;
  }
}
