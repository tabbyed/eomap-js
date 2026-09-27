import { Tool } from "./tool";
import {
  lampAt,
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
import {
  lightGroundRadius,
  projectLight,
} from "../lighting/model/light-geometry.js";
import { emissionAppearance } from "../lighting/appearance/lamp-emission.js";
import { windowGlassSprites } from "../lighting/model/windows.js";
import { Layer } from "../data/layer.js";
import { LightKind } from "../lighting/model/light-kind.js";

const sameParts = (parts, previous) =>
  previous !== null &&
  parts.length === previous.length &&
  parts.every((part, index) => part === previous[index]);

const LAMP_GUIDE = 0xf6c777;
const WINDOW_GUIDE = 0x98ddff;
const INVALID_GUIDE = 0xff8585;

export class LightingTool extends Tool {
  constructor(scene) {
    super();
    this.scene = scene;
    // Guides for everything in view, and for the light under the pointer
    // while one is placed or moved. Each redraws only when its inputs change.
    this.viewGuides = scene.add.graphics().setDepth(2);
    this.cursorGuide = scene.add.graphics().setDepth(2);
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
    // Ghosts and texture references for a lamp's other sprites (its parts).
    this.partGhosts = [];
    this.partEntries = [];
    this.previewLight = null;
    this.cacheEntry = null;
    this.viewSignature = null;
    this.cursorSignature = null;
    scene.events.once("shutdown", () => this.dispose());
  }

  // Translucent ghosts of a lamp's other sprites, such as a fireplace's
  // right-hand half, beside the main ghost.
  drawPartGhosts(light, valid) {
    const scene = this.scene;
    const parts = lampTiles(light, light.x, light.y).slice(1);
    // A lamp with fewer parts than the last one no longer needs the rest.
    for (const entry of this.partEntries.splice(parts.length)) entry?.decRef();
    parts.forEach((part, i) => {
      const entry = scene.textureCache.getResource(4, part.graphic + 100);
      if (entry !== this.partEntries[i]) {
        this.partEntries[i]?.decRef();
        this.partEntries[i] = entry;
        entry?.incRef();
      }
      if (!entry || entry.loadingComplete) return;
      this.partGhosts[i] ??= scene.add
        .image(0, 0, "__DEFAULT")
        .setDepth(2)
        .setVisible(false);
      const frame = entry.asset.getFrame(0);
      const pos = this.worldToScreen(
        part.x * 32 - part.y * 32 + 30 + (frame.width % 2) / 2,
        part.x * 16 + part.y * 16 + 30,
      );
      this.partGhosts[i]
        .setTexture(frame.texture.key, frame.name)
        .setOrigin(0.5, 1)
        .setPosition(pos.x, pos.y)
        .setScale(scene.map.zoom)
        .setAlpha(valid ? 0.7 : 0.4)
        .setTint(valid ? 0xffffff : 0xff7070)
        .setVisible(true);
    });
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

  worldToScreen(x, y) {
    const camera = this.scene.map.camera;
    const dirty = camera.dirty;
    camera.preRender();
    camera.dirty = dirty;
    return camera.matrix.transformPoint(x - camera.scrollX, y - camera.scrollY);
  }

  drawGlassOutline(guides, graphic, texture, width, alpha) {
    const map = this.scene.map;
    const origin = this.worldToScreen(graphic.x, graphic.y);
    guides.lineStyle(width, WINDOW_GUIDE, alpha);
    for (const [x1, y1, x2, y2] of texture.outline) {
      guides.lineBetween(
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
        this.drawGlassOutline(this.viewGuides, graphic, texture, 2, 1);
    }
  }

  // With guides on, every visible lamp and recognised window shows faintly,
  // so the toggle is useful before anything is selected. The selection is
  // drawn over this at full strength. Visits only visible graphics: O(V).
  drawOverview(settings) {
    const map = this.scene.map;
    for (const graphic of map.renderList) {
      if (graphic.layer === Layer.Objects) {
        const light = lampAt(map.emf, settings, graphic.tileX, graphic.tileY);
        if (light)
          this.drawSourceGuide(
            this.viewGuides,
            light,
            LAMP_GUIDE,
            light.enabled ? 0.6 : 0.3,
          );
        continue;
      }
      for (const { spec } of map.lighting.windowGlass(graphic)) {
        const texture = map.lighting.textures.getWindow(spec);
        if (texture)
          this.drawGlassOutline(this.viewGuides, graphic, texture, 1.5, 0.6);
      }
    }
  }

  // Ground reach ring, a stem to the source and brackets around the bulb.
  drawSourceGuide(guides, light, color, alpha) {
    const map = this.scene.map;
    const projected = projectLight(light);
    const point = this.worldToScreen(projected.x, projected.groundY);
    const source = this.worldToScreen(projected.x, projected.sourceY);
    const groundRadius = lightGroundRadius(light);
    guides.lineStyle(1.5, color, 0.75 * alpha);
    if (groundRadius > 0) {
      // Ground cross-section of the light's reach, before wall occlusion.
      guides.strokeEllipse(
        point.x,
        point.y,
        groundRadius * 64 * Math.SQRT2 * map.zoom,
        groundRadius * 32 * Math.SQRT2 * map.zoom,
      );
    }
    guides.strokeCircle(point.x, point.y, 3);
    if (source.y !== point.y) {
      guides.lineStyle(1, color, 0.35 * alpha);
      guides.lineBetween(source.x, source.y, point.x, point.y);
    }
    // Brackets leave the bulb visible instead of drawing a cross over it.
    guides.lineStyle(1.5, color, alpha);
    for (const dx of [-1, 1]) {
      for (const dy of [-1, 1]) {
        guides.lineBetween(
          source.x + dx * 6,
          source.y + dy * 9,
          source.x + dx * 9,
          source.y + dy * 9,
        );
        guides.lineBetween(
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
        this.drawSourceGuide(
          this.viewGuides,
          light,
          LAMP_GUIDE,
          light.enabled ? 0.6 : 0.3,
        );
        // Free lights have no graphic: the marker is what the user clicks.
        const p = this.worldToScreen(
          x * 32 - y * 32 + 32,
          x * 16 + y * 16 + 16,
        );
        this.viewGuides.lineStyle(2, WINDOW_GUIDE, 1);
        this.viewGuides.strokeRect(p.x - 4, p.y - 4, 8, 8);
      }
  }

  update() {
    const scene = this.scene,
      state = this.state;
    if (!state) return false;
    const active = scene.selectedTool === "lighting";
    const map = scene.map;
    const settings = map.lighting.settings || scene.mapState.lighting;
    const placing = active && state.mode !== "select";
    // References are compared too, so inspector edits invalidate the guides.
    const view = [
      active,
      state,
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
    ];
    // The pointer matters only while a light is placed or moved, so moving
    // it otherwise redraws nothing, and while placing it redraws one guide
    // rather than every guide in view.
    const cursor = placing
      ? [
          scene.currentPos.x,
          scene.currentPos.y,
          scene.currentPos.valid,
          this.cacheEntry?.loadingComplete === null,
          this.partEntries.every((entry) => entry?.loadingComplete === null),
        ]
      : [];
    const viewChanged = !sameParts(view, this.viewSignature);
    if (!viewChanged && sameParts(cursor, this.cursorSignature)) return false;
    if (viewChanged) {
      this.viewSignature = view;
      this.drawView(state, settings, active);
    }
    this.cursorSignature = cursor;
    this.drawCursor(state, settings, placing);
    return true;
  }

  // Faint guides for every lamp, window and free light in view, and the
  // selected light at full strength. Visits the visible graphics: O(V).
  drawView(state, settings, active) {
    this.viewGuides.clear();
    if (!active || !state.guides) return;
    this.drawOverview(settings);
    this.drawFreeLightMarkers(settings);
    if (state.mode !== "select") return;
    const light = selectedLight(this.scene.emf, settings, state.selection);
    if (light?.kind === LightKind.Window) this.drawWindowGuide(light);
    else if (light) this.drawSourceGuide(this.viewGuides, light, LAMP_GUIDE, 1);
  }

  // The light a click would place: a ghost of its graphic, its guide, and
  // its light previewed in the field.
  drawCursor(state, settings, placing) {
    const scene = this.scene,
      map = scene.map;
    this.clearPreview();
    this.cursorGuide.clear();
    this.ghost.setVisible(false);
    this.ghostHalo.setVisible(false);
    this.ghostBulb.setVisible(false);
    for (const ghost of this.partGhosts) ghost.setVisible(false);
    if (!placing) return;
    let light = selectedLight(scene.emf, settings, state.selection);
    const movedLight = state.mode === "move" ? light : null;
    let valid = false;
    if (scene.currentPos.valid) {
      const preset = state.mode === "move" ? light : presetById(state.preset);
      if (preset) {
        light = {
          enabled: true,
          ...preset,
          ...state.duplicate,
          x: scene.currentPos.x,
          y: scene.currentPos.y,
        };
        valid =
          light.kind === LightKind.Free
            ? !freeLightAt(scene.emf, settings, light.x, light.y)
            : lampFitsAt(scene.emf, light, light.x, light.y, movedLight);
        const entry =
          light.kind === LightKind.Free
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
          this.drawPartGhosts(light, valid);
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
        // The field exists only once lighting has been shown.
        if (valid && state.preview && map.lighting.field) {
          this.previewLight = light;
          this.previewField = map.lighting.field;
          map.lighting.displacedLampKey =
            movedLight?.kind === LightKind.Lamp ? movedLight.key : null;
          // A move previews the same source at its destination, not two lamps.
          map.lighting.field.setPreview({ light: light, replaces: movedLight });
          map.invalidateCachedFrame();
        }
      }
    }
    if (light)
      this.drawSourceGuide(
        this.cursorGuide,
        light,
        valid ? LAMP_GUIDE : INVALID_GUIDE,
        1,
      );
  }

  dispose() {
    this.cacheEntry?.decRef();
    this.cacheEntry = null;
    for (const entry of this.partEntries) entry?.decRef();
    this.partEntries = [];
    this.previewLight = null;
  }
}
