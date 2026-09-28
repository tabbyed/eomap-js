import {
  lampAt,
  freeLightAt,
  lampPreset,
  lightSettings,
} from "../model/lamps.js";
import { windowAt, windowKey, windowSettings } from "../model/windows.js";
import { ambientSettings } from "../model/settings.js";
import { ASSET_PACK } from "../packs/index.js";

// The companion .lighting.json file: serializing, parsing and matching it
// against the map it was saved for.

// Fingerprint only graphics/layout: changing music or a sign doesn't detach lights.
export function mapFingerprint(emf) {
  let hash = 2166136261;
  const add = (value) => {
    hash = Math.imul(hash ^ value, 16777619) >>> 0;
  };
  add(emf.width);
  add(emf.height);
  for (const tile of emf.tiles)
    for (const graphic of tile.gfx) add(graphic ?? 0);
  return hash.toString(16).padStart(8, "0");
}

export function serializeLighting(emf, lighting) {
  const lamps = {};
  for (const [key, value] of Object.entries(lighting.lamps)) {
    const [x, y, graphic] = key.split(",").map(Number);
    const lamp = lampAt(emf, lighting, x, y);
    if (lamp?.graphic === graphic) lamps[key] = value;
  }
  const lights = {};
  for (const [key, value] of Object.entries(lighting.lights || {})) {
    const [x, y] = key.split(",").map(Number);
    if (freeLightAt(emf, lighting, x, y)) lights[key] = value;
  }
  const windows = {};
  for (const [key, value] of Object.entries(lighting.windows || {})) {
    if (!WINDOW_KEY_PATTERN.test(key)) continue;
    const [x, y, layer, graphic] = key.split(",").map(Number);
    const window = windowAt(emf, lighting, x, y, layer);
    if (window?.graphic === graphic) windows[key] = value;
  }
  return (
    JSON.stringify(
      {
        version: 1,
        assetPack: ASSET_PACK.id,
        map: {
          width: emf.width,
          height: emf.height,
          fingerprint: mapFingerprint(emf),
        },
        ambient: ambientSettings(lighting.ambient),
        ...(lighting.outdoors ? { outdoors: true } : {}),
        lamps,
        lights,
        windows,
      },
      null,
      2,
    ) + "\n"
  );
}

export function parseLighting(text, emf) {
  return readLightingFile(text, emf).lighting;
}

// A map edited since its lighting was saved, here or in another editor, no
// longer matches the fingerprint. Rejecting the file would orphan every light,
// so keep each entry whose position and graphic still match and count the
// rest. On an unchanged map a mismatched entry means a damaged file.
export function readLightingFile(text, emf) {
  const input = JSON.parse(text);
  if (!input || input.version !== 1 || input.assetPack !== ASSET_PACK.id)
    throw new Error("Unsupported lighting file or graphics pack.");
  if (!input.map || typeof input.map !== "object")
    throw new Error("Unsupported lighting file or graphics pack.");
  if (input.outdoors !== undefined && typeof input.outdoors !== "boolean")
    throw new Error("Invalid outdoors setting.");
  const mapChanged =
    input.map.width !== emf.width ||
    input.map.height !== emf.height ||
    input.map.fingerprint !== mapFingerprint(emf);
  let dropped = 0;
  // Returns true when a stale entry should be skipped.
  const mismatch = (message) => {
    if (!mapChanged) throw new Error(message);
    dropped++;
    return true;
  };
  if (
    !input.lamps ||
    typeof input.lamps !== "object" ||
    Array.isArray(input.lamps)
  )
    throw new Error("Invalid lamp list.");
  if (Object.keys(input.lamps).length > emf.width * emf.height)
    throw new Error("Too many lamp overrides.");
  const lamps = {};
  for (const [key, value] of Object.entries(input.lamps)) {
    if (!/^(0|[1-9]\d*),(0|[1-9]\d*),(0|[1-9]\d*)$/.test(key))
      throw new Error("Invalid lamp position.");
    const [x, y, graphic] = key.split(",").map(Number);
    if (
      lampAt(emf, { lamps: {} }, x, y)?.graphic !== graphic &&
      mismatch("Invalid lamp position or graphic.")
    )
      continue;
    lamps[key] = lightSettings({ ...lampPreset(graphic), ...value });
  }
  const lights = {};
  const inputLights = input.lights === undefined ? {} : input.lights;
  if (
    !inputLights ||
    typeof inputLights !== "object" ||
    Array.isArray(inputLights) ||
    Object.keys(inputLights).length > emf.width * emf.height
  )
    throw new Error("Invalid free light list.");
  for (const [key, value] of Object.entries(inputLights)) {
    if (!/^(0|[1-9]\d*),(0|[1-9]\d*)$/.test(key))
      throw new Error("Invalid free light position.");
    const [x, y] = key.split(",").map(Number);
    if (
      (x >= emf.width || y >= emf.height) &&
      mismatch("Free light is outside the map.")
    )
      continue;
    lights[key] = lightSettings(value);
  }
  const windows = {};
  const inputWindows = input.windows === undefined ? {} : input.windows;
  if (
    !inputWindows ||
    typeof inputWindows !== "object" ||
    Array.isArray(inputWindows) ||
    Object.keys(inputWindows).length > emf.width * emf.height * 2
  )
    throw new Error("Invalid window light list.");
  for (const [key, value] of Object.entries(inputWindows)) {
    if (!WINDOW_KEY_PATTERN.test(key))
      throw new Error("Invalid window light position or layer.");
    const [x, y, layer, graphic] = key.split(",").map(Number);
    const window = windowAt(emf, { windows: {} }, x, y, layer);
    if (
      (!window || window.key !== windowKey(x, y, layer, graphic)) &&
      mismatch("Window light does not match a window on this map.")
    )
      continue;
    windows[key] = windowSettings(value);
  }
  return {
    lighting: {
      ambient: ambientSettings(input.ambient),
      lamps,
      lights,
      windows,
      ...(input.outdoors ? { outdoors: true } : {}),
    },
    mapChanged,
    dropped,
  };
}

// Keys are per placed wall instance, including its face and current graphic.
const WINDOW_KEY_PATTERN = /^(0|[1-9]\d*),(0|[1-9]\d*),(3|4),(0|[1-9]\d*)$/;
