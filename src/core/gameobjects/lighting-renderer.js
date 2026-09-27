import { LightField } from "../lighting/field/light-field.js";
import { lampAt, lampOwning, lampPreset } from "../lighting/model/lamps.js";
import { projectLight } from "../lighting/model/light-geometry.js";
import { emissionAppearance } from "../lighting/appearance/lamp-emission.js";
import {
  FLAMES,
  flameFlicker,
  flameFrame,
  flameStep,
} from "../lighting/appearance/flame-animation.js";
import { EmissionTextures } from "./emission-textures.js";
import { windowGlassAt } from "../lighting/model/windows.js";
import { windowAppearance } from "../lighting/appearance/window-emission.js";
import { pixelHit } from "../gfx/pixel-hit-mask.js";
import { surfaceTints } from "../lighting/field/surface-tints.js";
import { Layer, isWallLayer, FIRST_EDITOR_LAYER } from "../data/layer.js";

const NO_GLASS = Object.freeze([]);

// A lamp's halo reaches past its sprite, so its section bounds grow by this.
const HALO_PADDING = 32;

// Lighting for an EOMap: the light field, lamp and window emission, lit
// tinting and window picking. EOMap owns tiles, culling and the frame, and
// calls the hooks below; nothing here changes which graphics are drawn.
//
// Committed settings change only through `setLighting`. `previewLighting`
// shows settings without committing them, and every `setLighting` drops it.
export class LightingRenderer {
  constructor(map, scene, gfxLoader) {
    this.map = map;
    this.textures = new EmissionTextures(scene, gfxLoader, () =>
      map.invalidateCachedFrame(),
    );
    this.field = null;
    this.settings = null;
    this.committed = null;
    this.enabled = false;
    // A lamp being moved: its preview replaces it, so it must not glow.
    this.displacedLampKey = null;
    this.flameStep = flameStep(performance.now());
  }

  get emf() {
    return this.map.emf;
  }

  setLighting(settings) {
    this.committed = settings;
    this.show(settings);
  }

  previewLighting(settings) {
    this.show(settings);
  }

  clearPreview() {
    if (this.committed) this.show(this.committed);
  }

  // The field is built the first time lighting is shown, so a map that is
  // never lit costs neither its memory nor its build. Once built it stays
  // current through tile edits, and hiding lighting keeps it.
  show(settings) {
    if (this.settings === settings && (this.field || !this.enabled)) return;
    this.settings = settings;
    if (this.field) this.field.setSettings(settings);
    else if (this.enabled) this.field = new LightField(this.emf, settings);
    else return;
    this.map.invalidateCachedFrame();
  }

  setEnabled(enabled) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled && !this.field && this.settings)
      this.field = new LightField(this.emf, this.settings);
    this.map.invalidateCachedFrame();
  }

  // Map hooks.

  // A map rebuild restores every tile; build the field once afterwards.
  reset() {
    this.field = null;
  }

  rebuild() {
    if (this.settings && this.enabled)
      this.field = new LightField(this.emf, this.settings);
  }

  tileChanged(x, y, layer) {
    if (!this.field) return;
    if (layer === Layer.Objects) this.field.updateTile(x, y);
    else if (isWallLayer(layer)) this.field.queueWall(x, y);
  }

  update() {
    this.field?.flushWalls();
  }

  sectionPadding(graphic) {
    return graphic.layer === Layer.Objects &&
      lampPreset(graphic.cacheEntry.resourceID - 100)
      ? HALO_PADDING
      : 0;
  }

  // Whether `graphic` is drawn with lit vertex tints (WebGL only).
  shades(graphic) {
    return (
      this.enabled && this.field !== null && graphic.layer < FIRST_EDITOR_LAYER
    );
  }

  // Flames step on a shared clock. Whether the step changed; the map
  // redraws for it only if its last frame showed a flame.
  updateFlames(time) {
    const step = flameStep(time);
    if (step === this.flameStep) return false;
    this.flameStep = step;
    return true;
  }

  // What lighting adds to one graphic, in the same shape for every kind of
  // fixture, or null when it adds nothing:
  // - art: a frame drawn in place of the graphic's own art (a candle without
  //   its native flame), or null for its own art;
  // - halo: an additive glow drawn behind it, at its light source;
  // - overlays: frames drawn over it in order, each offset (dx, dy) from its
  //   top-left: a flame, the flame's or bulb's hot core, lit window glass;
  // - flickers: whether it changes with the flame clock.
  // Alphas exclude the graphic's own, which drawing applies.
  prepare(renderTexture, graphic) {
    // Window masks load even while lighting is hidden, so panes can be
    // picked on the first click.
    const glass = this.windowGlass(graphic);
    for (const item of glass) item.texture = this.textures.getWindow(item.spec);
    if (!this.enabled || !renderTexture.renderTarget) return null;
    const lamp = this.lampShown(graphic);
    // Most graphics show neither; they cost no allocation per redraw.
    if (!lamp && !glass.length) return null;
    const glow = { art: null, halo: null, overlays: [], flickers: false };
    if (lamp) this.addLampGlow(glow, graphic, lamp);
    for (const { light, texture } of glass) addPaneGlow(glow, light, texture);
    return glow.halo || glow.overlays.length ? glow : null;
  }

  // The lamp an object graphic shows, as its owner or as one of its parts
  // with a flame, or null. A replacement still decoding shows the previous
  // art, and a lamp being moved shows only at its preview.
  lampShown(graphic) {
    if (graphic.layer !== Layer.Objects) return null;
    const entry = graphic.cacheEntry;
    const graphicId = entry.resourceID - 100;
    const x = graphic.tileX,
      y = graphic.tileY;
    const own = lampAt(this.emf, this.settings, x, y);
    const lamp =
      own ??
      (FLAMES.has(graphicId)
        ? lampOwning(this.emf, this.settings, x, y)
        : null);
    if (!lamp || entry.loadingComplete || lamp.key === this.displacedLampKey)
      return null;
    return own && graphicId !== lamp.graphic ? null : lamp;
  }

  // A lamp's halo, and its glowing glass or moving flame. A part of a lamp
  // drawn across tiles, such as a fireplace's right-hand half, draws its
  // share of its owner's flame in step with it; the owner alone has a halo.
  addLampGlow(glow, graphic, lamp) {
    const graphicId = graphic.cacheEntry.resourceID - 100;
    const own = graphicId === lamp.graphic;
    const appearance = emissionAppearance(lamp);
    // A switched-off light keeps the game's still flame.
    const flame =
      lamp.enabled !== false && FLAMES.has(graphicId)
        ? this.textures.getFlame(graphicId)
        : null;
    const step = this.flameStep;
    const flicker = flame ? flameFlicker(lamp.key, step) : 1;
    const emission =
      own && appearance.enabled ? this.textures.get(lamp.graphic) : null;
    if (emission) {
      const source = projectLight(lamp);
      glow.halo = {
        frame: emission.halo,
        x: source.x - emission.halo.width / 2,
        y: source.sourceY - emission.halo.height / 2,
        alpha: appearance.haloAlpha * flicker,
        tint: appearance.haloColor,
      };
    }
    const core = Math.min(1, appearance.coreAlpha * flicker);
    if (flame) {
      const frame =
        flame.frames[flameFrame(lamp.key, step, flame.frames.length)];
      if (own) glow.art = flame.base;
      glow.flickers = true;
      // A flame is its own light, so scene shading never dims it.
      glow.overlays.push({
        frame: frame.flame,
        dx: frame.x,
        dy: frame.y,
        alpha: 1,
        tint: 0xffffff,
      });
      if (appearance.enabled)
        glow.overlays.push({
          frame: frame.core,
          dx: frame.x,
          dy: frame.y,
          alpha: core,
          tint: appearance.coreColor,
        });
    } else if (emission)
      glow.overlays.push({
        frame: emission.mask,
        dx: 0,
        dy: 0,
        alpha: core,
        tint: appearance.coreColor,
      });
  }

  drawBehind(renderTexture, graphic, glow, offsetX, offsetY) {
    const { halo } = glow;
    if (!halo) return;
    const renderer = renderTexture.renderer;
    const previousBlend = renderer.currentBlendMode;
    renderer.setBlendMode(Phaser.BlendModes.ADD);
    try {
      this.map.batchDrawFrame(
        renderTexture,
        halo.frame,
        halo.x - offsetX,
        halo.y - offsetY,
        halo.alpha * graphic.alpha,
        null,
        halo.tint,
      );
    } finally {
      renderer.setBlendMode(previousBlend);
    }
  }

  drawOnTop(renderTexture, graphic, glow, offsetX, offsetY) {
    const x = graphic.x - offsetX,
      y = graphic.y - offsetY;
    for (const { frame, dx, dy, alpha, tint } of glow.overlays)
      this.map.batchDrawFrame(
        renderTexture,
        frame,
        x + dx,
        y + dy,
        alpha * graphic.alpha,
        null,
        tint,
      );
  }

  batchLitFrame(renderTexture, frame, matrix, alpha, graphic) {
    const pipeline = renderTexture.pipeline;
    pipeline.manager.set(pipeline);
    const unit = pipeline.renderer.setTextureSource(frame.source);
    const { rows, tints } = surfaceTints(this.field, this.emf, graphic, frame);
    // MultiPipeline's fragment shader already swizzles the vertex tint.
    const pack = Phaser.Renderer.WebGL.Utils.getTintAppendFloatAlpha;
    if (!rows) {
      batchQuad(
        pipeline,
        matrix,
        frame,
        unit,
        0,
        frame.height,
        frame.v0,
        frame.v1,
        pack(tints[0], alpha),
        pack(tints[1], alpha),
        pack(tints[2], alpha),
        pack(tints[3], alpha),
      );
      return;
    }
    // A solid wall: one strip per pair of rows, sharing each row's tints.
    const { v0, height } = frame,
      vRange = frame.v1 - v0;
    let top = rows[0],
      topV = v0 + (vRange * top) / height,
      topLeft = pack(tints[0], alpha),
      topRight = pack(tints[1], alpha);
    for (let i = 1; i < rows.length; i++) {
      const bottom = rows[i],
        bottomV = v0 + (vRange * bottom) / height,
        bottomLeft = pack(tints[i * 2], alpha),
        bottomRight = pack(tints[i * 2 + 1], alpha);
      batchQuad(
        pipeline,
        matrix,
        frame,
        unit,
        top,
        bottom,
        topV,
        bottomV,
        topLeft,
        topRight,
        bottomLeft,
        bottomRight,
      );
      top = bottom;
      topV = bottomV;
      topLeft = bottomLeft;
      topRight = bottomRight;
    }
  }

  // Glass shown by a loaded wall graphic, with the light each part belongs
  // to. A replacement still decoding shows the previous artwork, so no glass.
  windowGlass(graphic) {
    const entry = graphic.cacheEntry;
    if (!isWallLayer(graphic.layer) || entry.loadingComplete) return NO_GLASS;
    const glass = windowGlassAt(
      this.emf,
      this.settings,
      graphic.tileX,
      graphic.tileY,
      graphic.layer,
    );
    return glass.length
      ? glass.filter(({ spec }) => entry.resourceID === spec.graphic + 100)
      : NO_GLASS;
  }

  pickWindow(screenX, screenY) {
    const map = this.map;
    const dirty = map.camera.dirty;
    map.camera.preRender();
    map.camera.dirty = dirty;
    const point = map.camera.getWorldPoint(screenX, screenY);
    // Depth order and native alpha prevent selecting glass hidden behind
    // a foreground wall or prop. O(visible graphics), only on a click.
    for (let i = map.renderList.length - 1; i >= 0; i--) {
      const graphic = map.renderList[i];
      if (
        graphic.layer === Layer.Ground ||
        graphic.layer === Layer.Shadow ||
        graphic.layer >= FIRST_EDITOR_LAYER ||
        graphic.alpha < 0.5
      )
        continue;
      const entry = graphic.cacheEntry;
      if (entry.loadingComplete) continue;
      const frame = entry.asset.getFrame(map.animationFrame);
      const x = Math.floor(point.x - graphic.x),
        y = Math.floor(point.y - graphic.y);
      if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;
      // A partner sprite's glass selects the window that owns it.
      for (const { light, spec } of this.windowGlass(graphic))
        if (pixelHit(this.textures.getWindow(spec)?.hitMask, x, y))
          return light;
      const base = entry.asset.textureFrame;
      // An already-loaded floor asset can acquire a hit mask when first used
      // on the Top layer. Until that decode finishes, avoid picking through it.
      if (!entry.hitMask) return null;
      if (
        pixelHit(
          entry.hitMask,
          x + frame.cutX - base.cutX,
          y + frame.cutY - base.cutY,
        )
      )
        return null;
    }
    return null;
  }

  destroy() {
    this.textures.destroy();
  }
}

// One textured quad across bitmap rows `top` to `bottom` of `frame`, with
// texture rows v0 to v1 and a packed tint at each corner.
function batchQuad(
  pipeline,
  matrix,
  frame,
  unit,
  top,
  bottom,
  v0,
  v1,
  tl,
  tr,
  bl,
  br,
) {
  pipeline.batchQuad(
    null,
    matrix.getX(0, top),
    matrix.getY(0, top),
    matrix.getX(0, bottom),
    matrix.getY(0, bottom),
    matrix.getX(frame.width, bottom),
    matrix.getY(frame.width, bottom),
    matrix.getX(frame.width, top),
    matrix.getY(frame.width, top),
    frame.u0,
    v0,
    frame.u1,
    v1,
    tl,
    tr,
    bl,
    br,
    0,
    frame.source.glTexture,
    unit,
  );
}

// A window pane's glow: its lit glass over the wall art.
function addPaneGlow(glow, light, texture) {
  const pane = windowAppearance(light);
  if (texture && pane.enabled)
    glow.overlays.push({
      frame: texture.mask,
      dx: 0,
      dy: 0,
      alpha: pane.alpha,
      tint: pane.color,
    });
}
