import { finiteRange, hexColor, tileInMap } from "./validation.js";
import { ASSET_PACK } from "../packs/index.js";
import { Layer } from "../layer.js";
import { LightKind } from "./light-kind.js";
import { ownerOf, partTiles, placedParts } from "./parts.js";

// Lamps and free lights: presets, lookup on the map and settings validation.

// Lamp presets come from the pack catalogue. Other packs can override them.
export const CHICAGO_AMBER = ASSET_PACK.chicagoAmber;
export const LAMP_PRESETS = ASSET_PACK.lamps;

export const FREE_LIGHT_PRESET = {
  id: "free",
  name: "Free light",
  radius: 4,
  color: "#ffcf88",
  brightness: 1,
  glow: 0,
  enabled: true,
  height: 0,
  shadows: true,
  kind: LightKind.Free,
  description: "Light any tile without adding a graphic",
};

// Called for every object graphic on each placement and redraw. A variant is
// either identical artwork (a graphic ID) or its own sprite, such as a mirror
// image, that overrides the preset's anchor or height.
const PRESETS_BY_GRAPHIC = new Map(
  LAMP_PRESETS.flatMap((preset) => [
    [preset.graphic, preset],
    ...(preset.variants ?? []).map((variant) =>
      typeof variant === "number"
        ? [variant, preset]
        : [variant.graphic, { ...preset, ...variant }],
    ),
  ]),
);

const PRESETS_BY_ID = new Map(
  [FREE_LIGHT_PRESET, ...LAMP_PRESETS].map((preset) => [preset.id, preset]),
);

// The preset a tool state names: a lamp's id, or "free" for a free light.
export function presetById(id) {
  return PRESETS_BY_ID.get(id) ?? null;
}

export function lampPreset(graphic) {
  return PRESETS_BY_GRAPHIC.get(graphic) || null;
}

export function lampKey(x, y, graphic) {
  return `${x},${y},${graphic}`;
}

export function lampAt(emf, lighting, x, y) {
  if (!tileInMap(emf, x, y)) return null;
  const graphic = emf.getTile(x, y).gfx[Layer.Objects];
  const preset = lampPreset(graphic);
  if (!preset) return null;
  const key = lampKey(x, y, graphic);
  return {
    ...preset,
    enabled: true,
    shadows: true,
    ...lighting.lamps[key],
    x,
    y,
    key,
    graphic,
    kind: LightKind.Lamp,
  };
}

// A lamp drawn across several tiles, such as a fireplace, lists its other
// sprites as `parts` (see parts.js). Only the owner is a lamp: lampAt never
// answers for a part, so a light is never counted twice.

/** The lamp at a tile, or the lamp whose part is drawn there. */
export function lampOwning(emf, lighting, x, y) {
  const lamp = lampAt(emf, lighting, x, y);
  if (lamp) return lamp;
  const owner = ownerOf(emf, Layer.Objects, x, y);
  const found = owner && lampAt(emf, lighting, owner.x, owner.y);
  return found?.graphic === owner?.graphic ? found : null;
}

/** Every object graphic a lamp at (x, y) places: its own, then its parts'. */
export function lampTiles(preset, x, y, graphic = preset.graphic) {
  return [{ x, y, graphic }, ...partTiles(Layer.Objects, graphic, x, y)];
}

/**
 * The tiles a placed lamp actually occupies: its own, and each part drawn
 * where it belongs. Deleting or moving a lamp clears only these, so an
 * object standing where a missing part would go is never removed.
 */
export function placedLampTiles(emf, lamp) {
  return [
    { x: lamp.x, y: lamp.y, graphic: lamp.graphic },
    ...placedParts(emf, Layer.Objects, lamp.graphic, lamp.x, lamp.y),
  ];
}

/**
 * Whether a lamp and all its parts fit at (x, y): every tile inside the map
 * and free of objects, except the tiles that `moving`, the lamp being moved
 * there, will vacate.
 */
export function lampFitsAt(emf, preset, x, y, moving = null) {
  const vacated = moving ? placedLampTiles(emf, moving) : [];
  return lampTiles(preset, x, y).every(
    (tile) =>
      tileInMap(emf, tile.x, tile.y) &&
      (!emf.getTile(tile.x, tile.y).gfx[Layer.Objects] ||
        vacated.some((v) => v.x === tile.x && v.y === tile.y)),
  );
}

export function freeLightAt(emf, lighting, x, y) {
  if (!tileInMap(emf, x, y)) return null;
  const key = `${x},${y}`;
  const settings = lighting.lights?.[key];
  return settings ? { ...FREE_LIGHT_PRESET, ...settings, x, y, key } : null;
}

const color = (value) =>
  hexColor(value, "Choose a six-digit colour, such as #ffcf88.");

export function lightSettings(value) {
  if (!value || typeof value !== "object")
    throw new Error("Missing light settings.");
  if (typeof value.enabled !== "boolean")
    throw new Error("Missing light enabled state.");
  if (value.shadows !== undefined && typeof value.shadows !== "boolean")
    throw new Error("Invalid wall interaction setting.");
  return {
    radius: finiteRange(value.radius, 1, 12, "Light reach"),
    brightness: finiteRange(value.brightness, 0, 2, "Light brightness"),
    glow: finiteRange(value.glow ?? 1, 0, 2, "Bulb glow"),
    color: color(value.color),
    enabled: value.enabled,
    height: finiteRange(value.height ?? 0, 0, 192, "Source height"),
    shadows: value.shadows ?? true,
  };
}
