import { LightField } from "../lighting/light-field.js";
import { lampAt, lampPreset } from "../lighting/lamps.js";
import { projectLight } from "../lighting/light-geometry.js";
import { emissionAppearance } from "../lighting/lamp-emission.js";
import { LampTextures } from "../lighting/lamp-textures.js";
import { windowGlassAt } from "../lighting/windows.js";
import { windowAppearance } from "../lighting/window-emission.js";
import { pixelHit } from "../gfx/pixel-hit-mask.js";
import { SOLID_WALL_GRAPHICS } from "../lighting/walls.js";
import {
  wallSurfaceVertex,
  wallSurfaceSlices,
} from "../lighting/wall-surface.js";

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
    this.textures = new LampTextures(scene, gfxLoader, () =>
      map.invalidateCachedFrame(),
    );
    this.field = null;
    this.settings = null;
    this.committed = null;
    this.enabled = false;
    // A lamp being moved: its preview replaces it, so it must not glow.
    this.displacedLampKey = null;
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

  show(settings) {
    if (this.field && this.settings === settings) return;
    this.settings = settings;
    if (this.field) this.field.setSettings(settings);
    else this.field = new LightField(this.emf, settings);
    this.map.invalidateCachedFrame();
  }

  setEnabled(enabled) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.map.invalidateCachedFrame();
  }

  // Map hooks.

  // A map rebuild restores every tile; build the field once afterwards.
  reset() {
    this.field = null;
  }

  rebuild() {
    if (this.settings) this.field = new LightField(this.emf, this.settings);
  }

  tileChanged(x, y, layer) {
    if (!this.field) return;
    if (layer === 1) this.field.updateTile(x, y);
    else if (layer === 3 || layer === 4) this.field.queueWall(x, y);
  }

  update() {
    this.field?.flushWalls();
  }

  sectionPadding(graphic) {
    return graphic.layer === 1 &&
      lampPreset(graphic.cacheEntry.resourceID - 100)
      ? HALO_PADDING
      : 0;
  }

  // Whether `graphic` is drawn with lit vertex tints (WebGL only).
  shades(graphic) {
    return this.enabled && this.field !== null && graphic.layer < 9;
  }

  // Emission and glass for one graphic, or null when it has neither.
  prepare(renderTexture, graphic) {
    const lamp =
      this.enabled && renderTexture.renderTarget && graphic.layer === 1
        ? lampAt(this.emf, this.settings, graphic.tileX, graphic.tileY)
        : null;
    const appearance = lamp && emissionAppearance(lamp);
    const emission =
      appearance?.enabled &&
      lamp.key !== this.displacedLampKey &&
      graphic.cacheEntry.resourceID === lamp.graphic + 100 &&
      !graphic.cacheEntry.loadingComplete
        ? this.textures.get(lamp.graphic)
        : null;
    // Prepare masks even with the preview off so unlit panes remain pickable.
    const glass = this.windowGlass(graphic);
    for (const item of glass) item.texture = this.textures.getWindow(item.spec);
    if (!emission && !glass.length) return null;
    return { lamp, appearance, emission, glass };
  }

  drawBehind(renderTexture, graphic, extras, offsetX, offsetY) {
    const { lamp, appearance, emission } = extras;
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
        appearance.haloAlpha * graphic.alpha,
        null,
        appearance.haloColor,
      );
    } finally {
      renderer.setBlendMode(previousBlend);
    }
  }

  drawOnTop(renderTexture, graphic, extras, offsetX, offsetY) {
    const { appearance, emission, glass } = extras;
    const x = graphic.x - offsetX,
      y = graphic.y - offsetY;
    if (emission)
      this.map.batchDrawFrame(
        renderTexture,
        emission.mask,
        x,
        y,
        appearance.coreAlpha * graphic.alpha,
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
    const field = this.field;
    const pack = (rgb) => {
      // MultiPipeline's fragment shader already swizzles the vertex tint.
      return Phaser.Renderer.WebGL.Utils.getTintAppendFloatAlpha(rgb, alpha);
    };
    const x = graphic.tileX,
      y = graphic.tileY;
    const tint = (x, y, height = 0) => pack(field.tint(x, y, height));
    const solidWall =
      (graphic.layer === 3 || graphic.layer === 4) &&
      SOLID_WALL_GRAPHICS.has(this.emf.getTile(x, y).gfx[graphic.layer]);
    if (solidWall) {
      // Neighbouring graphics share surface coordinates AND interpolation rows.
      // Sampling one tile centre across each whole bitmap creates visible seams.
      const surfaceTint = (px, py) => {
        const p = wallSurfaceVertex(graphic.layer, x, y, frame.height, px, py);
        return tint(p.sampleX, p.sampleY, Math.max(0, p.height));
      };
      const rows = wallSurfaceSlices(x, y, frame.height);
      // Adjacent slices share a row, so sample each row's edge tints once.
      let topLeft = surfaceTint(0, rows[0]),
        topRight = surfaceTint(frame.width, rows[0]);
      for (let i = 0; i < rows.length - 1; i++) {
        const top = rows[i],
          bottom = rows[i + 1];
        const bottomLeft = surfaceTint(0, bottom),
          bottomRight = surfaceTint(frame.width, bottom);
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
          frame.v0 + ((frame.v1 - frame.v0) * top) / frame.height,
          frame.u1,
          frame.v0 + ((frame.v1 - frame.v0) * bottom) / frame.height,
          topLeft,
          topRight,
          bottomLeft,
          bottomRight,
          0,
          frame.source.glTexture,
          unit,
        );
        topLeft = bottomLeft;
        topRight = bottomRight;
      }
      return;
    }
    let tl, tr, bl, br;
    if (graphic.layer === 0) {
      tl = pack(field.groundCornerTint(x, y, -1, 0));
      tr = pack(field.groundCornerTint(x, y, 0, -1));
      bl = pack(field.groundCornerTint(x, y, 0, 1));
      br = pack(field.groundCornerTint(x, y, 1, 0));
    } else tl = tr = bl = br = tint(x, y);
    pipeline.batchQuad(
      null,
      matrix.getX(0, 0),
      matrix.getY(0, 0),
      matrix.getX(0, frame.height),
      matrix.getY(0, frame.height),
      matrix.getX(frame.width, frame.height),
      matrix.getY(frame.width, frame.height),
      matrix.getX(frame.width, 0),
      matrix.getY(frame.width, 0),
      frame.u0,
      frame.v0,
      frame.u1,
      frame.v1,
      tl,
      tr,
      bl,
      br,
      0,
      frame.source.glTexture,
      unit,
    );
  }

  // Glass shown by a loaded wall graphic, with the light each part belongs
  // to. A replacement still decoding shows the previous artwork, so no glass.
  windowGlass(graphic) {
    const entry = graphic.cacheEntry;
    if ((graphic.layer !== 3 && graphic.layer !== 4) || entry.loadingComplete)
      return NO_GLASS;
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
        graphic.layer === 0 ||
        graphic.layer === 7 ||
        graphic.layer >= 9 ||
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
