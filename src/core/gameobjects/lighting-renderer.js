import { LightField } from "../lighting/field/light-field.js";
import { lampAt, lampPreset } from "../lighting/model/lamps.js";
import { projectLight } from "../lighting/model/light-geometry.js";
import { emissionAppearance } from "../lighting/appearance/lamp-emission.js";
import {
  FLAMES,
  flameFlicker,
  flameFrame,
  flameOwner,
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

  // Emission, flame and glass for one graphic, or null when it has none.
  // A moving flame also names the still `frame` to draw in place of the art.
  prepare(renderTexture, graphic) {
    const object =
      this.enabled &&
      renderTexture.renderTarget &&
      graphic.layer === Layer.Objects;
    const lamp = object
      ? lampAt(this.emf, this.settings, graphic.tileX, graphic.tileY)
      : null;
    if (object && !lamp) return this.preparePart(graphic);
    const appearance = lamp && emissionAppearance(lamp);
    const shown =
      lamp &&
      lamp.key !== this.displacedLampKey &&
      graphic.cacheEntry.resourceID === lamp.graphic + 100 &&
      !graphic.cacheEntry.loadingComplete;
    const emission =
      shown && appearance.enabled ? this.textures.get(lamp.graphic) : null;
    // A switched-off light keeps the game's still flame.
    const flame =
      shown && lamp.enabled !== false && FLAMES.has(lamp.graphic)
        ? this.textures.getFlame(lamp.graphic)
        : null;
    // Prepare masks even with the preview off so unlit panes remain pickable.
    const glass = this.windowGlass(graphic);
    for (const item of glass) item.texture = this.textures.getWindow(item.spec);
    if (!emission && !flame && !glass.length) return null;
    if (!flame) return { lamp, appearance, emission, glass };
    const step = this.flameStep;
    return {
      lamp,
      appearance,
      emission,
      glass,
      frame: flame.base,
      flame: flame.frames[flameFrame(lamp.key, step, flame.frames.length)],
      flicker: flameFlicker(lamp.key, step),
    };
  }

  // A partner sprite of a lamp drawn across tiles, such as a fireplace's
  // right-hand half, draws its share of its owner's flame in step with it.
  // The owner alone draws the halo.
  preparePart(graphic) {
    const graphicId = graphic.cacheEntry.resourceID - 100;
    const owner = flameOwner(graphicId);
    if (!owner || graphic.cacheEntry.loadingComplete) return null;
    const lamp = lampAt(
      this.emf,
      this.settings,
      graphic.tileX + owner.dx,
      graphic.tileY + owner.dy,
    );
    if (
      lamp?.graphic !== owner.graphic ||
      lamp.enabled === false ||
      lamp.key === this.displacedLampKey
    )
      return null;
    const flame = this.textures.getFlame(graphicId);
    if (!flame) return null;
    const step = this.flameStep;
    return {
      lamp,
      appearance: emissionAppearance(lamp),
      emission: null,
      glass: NO_GLASS,
      flame: flame.frames[flameFrame(lamp.key, step, flame.frames.length)],
      flicker: flameFlicker(lamp.key, step),
    };
  }

  drawBehind(renderTexture, graphic, extras, offsetX, offsetY) {
    const { lamp, appearance, emission, flicker = 1 } = extras;
    if (!emission) return;
    const source = projectLight(lamp);
    const renderer = renderTexture.renderer;
    const previousBlend = renderer.currentBlendMode;
    renderer.setBlendMode(Phaser.BlendModes.ADD);
    try {
      this.map.batchDrawFrame(
        renderTexture,
        emission.halo,
        source.x - emission.halo.width / 2 - offsetX,
        source.sourceY - emission.halo.height / 2 - offsetY,
        appearance.haloAlpha * flicker * graphic.alpha,
        null,
        appearance.haloColor,
      );
    } finally {
      renderer.setBlendMode(previousBlend);
    }
  }

  drawOnTop(renderTexture, graphic, extras, offsetX, offsetY) {
    const { appearance, emission, flame, flicker = 1, glass } = extras;
    const x = graphic.x - offsetX,
      y = graphic.y - offsetY;
    // A flame is its own light, so scene shading never dims it.
    if (flame)
      this.map.batchDrawFrame(
        renderTexture,
        flame.flame,
        x + flame.x,
        y + flame.y,
        graphic.alpha,
        null,
        0xffffff,
      );
    // A moving flame glows through its own frame's core; a still lamp
    // through its glass.
    const core = flame
      ? appearance.enabled && flame.core
      : emission && emission.mask;
    if (core)
      this.map.batchDrawFrame(
        renderTexture,
        core,
        flame ? x + flame.x : x,
        flame ? y + flame.y : y,
        Math.min(1, appearance.coreAlpha * flicker) * graphic.alpha,
        null,
        appearance.coreColor,
      );
    if (!this.enabled || !renderTexture.renderTarget) return;
    for (const { light, texture } of glass) {
      const glow = windowAppearance(light);
      if (!texture || !glow.enabled) continue;
      this.map.batchDrawFrame(
        renderTexture,
        texture.mask,
        x,
        y,
        glow.alpha * graphic.alpha,
        null,
        glow.color,
      );
    }
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
