import { windowAt, windowKey, windowSettings } from "./windows.js";
import { finiteRange, hexColor, tileInMap } from "./validation.js";

// EMF graphics, not EGF resource IDs (the latter are graphic + 100).
// These defaults describe the native EO pack. Other packs can override them.
// Anchors are screen-pixel offsets from the tile centre to the visible foot.
// Source heights are measured from that foot to the centre of the glass.
export const CHICAGO_AMBER = { color: "#ffad46", brightness: 1.6, glow: 1.15 };

export const LAMP_PRESETS = [
  {
    id: "street",
    name: "Street lamp",
    graphic: 7,
    radius: 5,
    ...CHICAGO_AMBER,
    height: 103,
    anchor: { x: -1, y: 13 },
    description: "Chicago amber along a path",
  },
  {
    id: "tall",
    name: "Tall lamp",
    graphic: 6,
    radius: 6,
    ...CHICAGO_AMBER,
    brightness: 1.8,
    height: 114,
    anchor: { x: -2, y: 13 },
    description: "A wider pool for an entrance",
  },
  {
    id: "lantern",
    name: "Lantern",
    graphic: 400,
    radius: 3,
    ...CHICAGO_AMBER,
    brightness: 1.1,
    height: 15,
    anchor: { x: -2, y: 9 },
    description: "A small, intimate pool",
  },
  {
    id: "garden",
    name: "Garden lantern",
    graphic: 89,
    // Graphic 90 is identical artwork under another ID; placements use 89.
    variants: [90],
    radius: 3,
    ...CHICAGO_AMBER,
    brightness: 1.1,
    height: 16,
    anchor: { x: -3, y: 7 },
    description: "A low stone lantern for paths and gardens",
  },
];

export const AMBIENT_PRESETS = {
  day: { name: "Day", brightness: 1, color: "#ffffff" },
  dusk: { name: "Dusk", brightness: 0.55, color: "#c2b7ed" },
  night: { name: "Night", brightness: 0.3, color: "#97b5ed" },
};

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
  kind: "free",
  description: "Light any tile without adding a graphic",
};

// Called for every object graphic on each placement and redraw.
const PRESETS_BY_GRAPHIC = new Map(
  LAMP_PRESETS.flatMap((preset) =>
    [preset.graphic, ...(preset.variants ?? [])].map((graphic) => [
      graphic,
      preset,
    ]),
  ),
);

export function lampPreset(graphic) {
  return PRESETS_BY_GRAPHIC.get(graphic) || null;
}

export function lampKey(x, y, graphic) {
  return `${x},${y},${graphic}`;
}

export function defaultLighting() {
  return {
    ambient: { brightness: 1, color: "#ffffff" },
    lamps: {},
    lights: {},
    windows: {},
  };
}

export function lampAt(emf, lighting, x, y) {
  if (!tileInMap(emf, x, y)) return null;
  const graphic = emf.getTile(x, y).gfx[1];
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
    kind: "lamp",
  };
}

export function freeLightAt(emf, lighting, x, y) {
  if (!tileInMap(emf, x, y)) return null;
  const key = `${x},${y}`;
  const settings = lighting.lights?.[key];
  return settings ? { ...FREE_LIGHT_PRESET, ...settings, x, y, key } : null;
}

export function selectedLight(emf, lighting, selection) {
  if (!selection) return null;
  if (selection.kind === "window")
    return windowAt(emf, lighting, selection.x, selection.y, selection.layer);
  return selection.kind === "free"
    ? freeLightAt(emf, lighting, selection.x, selection.y)
    : lampAt(emf, lighting, selection.x, selection.y);
}

export function withLight(lighting, light, settings) {
  const collection =
    light.kind === "window"
      ? "windows"
      : light.kind === "free"
        ? "lights"
        : "lamps";
  const entries = { ...lighting[collection] };
  if (settings)
    entries[light.key] =
      light.kind === "window"
        ? windowSettings(settings)
        : lightSettings(settings);
  else delete entries[light.key];
  return { ...lighting, [collection]: entries };
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

export function ambientSettings(value) {
  if (!value || typeof value !== "object")
    throw new Error("Missing ambient settings.");
  return {
    brightness: finiteRange(value.brightness, 0.15, 1, "Ambient brightness"),
    color: color(value.color),
  };
}

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
        assetPack: "eo-native",
        map: {
          width: emf.width,
          height: emf.height,
          fingerprint: mapFingerprint(emf),
        },
        ambient: ambientSettings(lighting.ambient),
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
  const input = JSON.parse(text);
  if (!input || input.version !== 1 || input.assetPack !== "eo-native")
    throw new Error("Unsupported lighting file or graphics pack.");
  if (
    input.map?.width !== emf.width ||
    input.map?.height !== emf.height ||
    input.map?.fingerprint !== mapFingerprint(emf)
  ) {
    throw new Error(
      "This lighting file belongs to a different map layout. Open the matching EMF first.",
    );
  }
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
    if (lampAt(emf, { lamps: {} }, x, y)?.graphic !== graphic)
      throw new Error("Invalid lamp position or graphic.");
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
    if (x >= emf.width || y >= emf.height)
      throw new Error("Free light is outside the map.");
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
    if (!window || window.key !== windowKey(x, y, layer, graphic))
      throw new Error("Window light does not match a window on this map.");
    windows[key] = windowSettings(value);
  }
  return { ambient: ambientSettings(input.ambient), lamps, lights, windows };
}

// Keys are per placed wall instance, including its face and current graphic.
const WINDOW_KEY_PATTERN = /^(0|[1-9]\d*),(0|[1-9]\d*),(3|4),(0|[1-9]\d*)$/;
