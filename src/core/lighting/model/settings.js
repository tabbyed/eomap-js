import { lampAt, freeLightAt, lightSettings } from "./lamps.js";
import { windowAt, windowSettings } from "./windows.js";
import { finiteRange, hexColor } from "./validation.js";
import { LightKind } from "./light-kind.js";

// A map's lighting settings: ambient light and per-light overrides, keyed by
// lamp, free light and window. Settings objects are immutable; each edit
// makes a new one, so undo restores the previous object.

export const AMBIENT_PRESETS = {
  day: { name: "Day", brightness: 1, color: "#ffffff" },
  dusk: { name: "Dusk", brightness: 0.55, color: "#c2b7ed" },
  night: { name: "Night", brightness: 0.3, color: "#97b5ed" },
};

export function defaultLighting() {
  return {
    ambient: { brightness: 1, color: "#ffffff" },
    lamps: {},
    lights: {},
    windows: {},
  };
}

export function selectedLight(emf, lighting, selection) {
  if (!selection) return null;
  if (selection.kind === LightKind.Window)
    return windowAt(emf, lighting, selection.x, selection.y, selection.layer);
  return selection.kind === LightKind.Free
    ? freeLightAt(emf, lighting, selection.x, selection.y)
    : lampAt(emf, lighting, selection.x, selection.y);
}

export function withLight(lighting, light, settings) {
  const collection =
    light.kind === LightKind.Window
      ? "windows"
      : light.kind === LightKind.Free
        ? "lights"
        : "lamps";
  const entries = { ...lighting[collection] };
  if (settings)
    entries[light.key] =
      light.kind === LightKind.Window
        ? windowSettings(settings)
        : lightSettings(settings);
  else delete entries[light.key];
  return { ...lighting, [collection]: entries };
}

const color = (value) =>
  hexColor(value, "Choose a six-digit colour, such as #ffcf88.");

export function ambientSettings(value) {
  if (!value || typeof value !== "object")
    throw new Error("Missing ambient settings.");
  return {
    brightness: finiteRange(value.brightness, 0.15, 1, "Ambient brightness"),
    color: color(value.color),
  };
}
