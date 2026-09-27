import { lampAt, lampOwning } from "../model/lamps.js";
import { projectLight } from "../model/light-geometry.js";
import { windowGlassAt } from "../model/windows.js";
import { emissionAppearance } from "./lamp-emission.js";
import { windowAppearance } from "./window-emission.js";
import { FLAMES, flameFlicker, flameFrame } from "./flame-animation.js";
import { Layer, isWallLayer } from "../layer.js";

// What lighting adds to a graphic as it is drawn, whatever draws it: the
// editor's Phaser map view or a game client.
//
// A renderer describes each graphic it draws as a shown graphic, { layer,
// x, y, graphic, pending }: its tile, the graphic ID whose art it shows, and
// whether a replacement is still loading. While one is, the previous art
// shows, and it shows no light of its own.

const NO_GLASS = Object.freeze([]);

/**
 * The window glass a shown wall graphic draws, [{ light, spec }]: its own
 * window or fixture, and any part of a neighbour's window drawn on it.
 */
export function glassShown(map, lighting, shown) {
  if (!isWallLayer(shown.layer) || shown.pending) return NO_GLASS;
  const glass = windowGlassAt(map, lighting, shown.x, shown.y, shown.layer);
  return glass.length
    ? glass.filter(({ spec }) => spec.graphic === shown.graphic)
    : NO_GLASS;
}

/**
 * The lamp a shown object graphic lights, as its owner or as one of its
 * parts with a flame, or null. A lamp being moved, whose key is `displaced`,
 * shows only at its preview.
 */
export function lampShown(map, lighting, shown, displaced = null) {
  if (shown.layer !== Layer.Objects) return null;
  const own = lampAt(map, lighting, shown.x, shown.y);
  const lamp =
    own ??
    (FLAMES.has(shown.graphic)
      ? lampOwning(map, lighting, shown.x, shown.y)
      : null);
  if (!lamp || shown.pending || lamp.key === displaced) return null;
  return own && shown.graphic !== lamp.graphic ? null : lamp;
}

/**
 * What lighting adds to one shown graphic, in the same shape for every kind
 * of fixture, or null when it adds nothing:
 * - art: a frame drawn in place of the graphic's own art (a candle without
 *   its native flame), or null for its own art;
 * - halo: { frame, x, y, alpha, tint }, an additive glow drawn behind it,
 *   centred on its light source in world pixels;
 * - overlays: [{ frame, dx, dy, alpha, tint }], drawn over it in order,
 *   each offset from its top-left: a flame, the flame's or bulb's hot core,
 *   lit window glass;
 * - flickers: whether it changes with the flame clock.
 * Alphas exclude the graphic's own, which drawing applies.
 *
 * `textures` supplies what the renderer has uploaded, or null while that is
 * still being prepared: get(graphic) gives { mask, halo }, and
 * getFlame(graphic) { base, frames }. Each glass item carries its own
 * `texture`, { mask }. `step` is the flame clock's step (flameStep).
 */
export function glowOf(textures, step, shown, lamp, glass) {
  if (!lamp && !glass.length) return null;
  const glow = { art: null, halo: null, overlays: [], flickers: false };
  if (lamp) addLampGlow(glow, textures, step, shown.graphic, lamp);
  for (const { light, texture } of glass) addPaneGlow(glow, light, texture);
  return glow.halo || glow.overlays.length ? glow : null;
}

// A lamp's halo, and its glowing glass or moving flame. A part of a lamp
// drawn across tiles, such as a fireplace's right-hand half, draws its
// share of its owner's flame in step with it; the owner alone has a halo.
function addLampGlow(glow, textures, step, graphic, lamp) {
  const own = graphic === lamp.graphic;
  const appearance = emissionAppearance(lamp);
  // A switched-off light keeps the game's still flame.
  const flame =
    lamp.enabled !== false && FLAMES.has(graphic)
      ? textures.getFlame(graphic)
      : null;
  const flicker = flame ? flameFlicker(lamp.key, step) : 1;
  const emission =
    own && appearance.enabled ? textures.get(lamp.graphic) : null;
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
    const frame = flame.frames[flameFrame(lamp.key, step, flame.frames.length)];
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
