import { createBulbMask, createHaloPixels } from "./lamp-emission.js";
import { createWindowMask, WINDOW_DEFINITIONS } from "./windows.js";
import { maskOutline } from "./window-emission.js";
import { createPixelHitMask } from "../gfx/pixel-hit-mask.js";

let nextCacheId = 0;

// Three small native masks and one halo per open map, shared by every lamp.
// Decode/upload once; colour and strength are vertex tint/alpha changes.
export class LampTextures {
  constructor(scene, loader, invalidate) {
    this.manager = scene.textures;
    this.loader = loader;
    this.invalidate = invalidate;
    this.prefix = `lighting-emission-${++nextCacheId}`;
    this.entries = new Map();
    this.windows = new Map();
    this.keys = [];
    this.revision = 0;
    this.destroyed = false;
  }

  createTexture(name, pixels, filter) {
    const key = `${this.prefix}-${name}`;
    const canvas = document.createElement("canvas");
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    canvas
      .getContext("2d")
      .putImageData(
        new ImageData(pixels.data, pixels.width, pixels.height),
        0,
        0,
      );
    const texture = this.manager.addCanvas(key, canvas);
    texture.setFilter(filter);
    this.keys.push(key);
    return texture.get();
  }

  get(graphic) {
    if (this.destroyed) return null;
    if (!this.entries.has(graphic)) {
      if (!this.loader.resourceInfo(4, graphic + 100)) return null;
      this.entries.set(graphic, null);
      this.loader
        .loadResource(4, graphic + 100)
        .then((pixels) => {
          if (this.destroyed) return;
          const maskPixels = createBulbMask(pixels, graphic);
          if (!maskPixels) return;
          if (!this.halo)
            this.halo = this.createTexture(
              "halo",
              createHaloPixels(),
              Phaser.Textures.LINEAR,
            );
          const mask = this.createTexture(
            graphic,
            maskPixels,
            Phaser.Textures.NEAREST,
          );
          this.entries.set(graphic, { mask, halo: this.halo });
          this.revision++;
          this.invalidate();
        })
        .catch((error) => {
          if (!this.destroyed)
            console.warn("Unable to prepare lamp glow", error);
        });
    }
    return this.entries.get(graphic);
  }

  // `glass` is a catalogue graphic or a glass spec (own glass or a partner
  // part); each spec has its own mask, shared by every placed instance.
  getWindow(glass) {
    const spec =
      typeof glass === "number" ? WINDOW_DEFINITIONS.get(glass) : glass;
    if (this.destroyed || !spec) return null;
    if (!this.windows.has(spec.key)) {
      if (!this.loader.resourceInfo(6, spec.graphic + 100)) return null;
      this.windows.set(spec.key, null);
      this.loader
        .loadResource(6, spec.graphic + 100)
        .then((pixels) => {
          if (this.destroyed) return;
          const maskPixels = createWindowMask(pixels, spec);
          const mask = this.createTexture(
            `window-${spec.key}`,
            maskPixels,
            Phaser.Textures.NEAREST,
          );
          // Keep a 1-bit pane mask for picking, not the RGBA upload buffer.
          this.windows.set(spec.key, {
            mask,
            hitMask: createPixelHitMask(maskPixels),
            outline: maskOutline(maskPixels),
          });
          this.revision++;
          this.invalidate();
        })
        .catch((error) => {
          if (!this.destroyed)
            console.warn("Unable to prepare window glow", error);
        });
    }
    return this.windows.get(spec.key);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const key of this.keys) this.manager.remove(key);
    this.entries.clear();
    this.windows.clear();
    this.keys = [];
    this.halo = null;
  }
}
