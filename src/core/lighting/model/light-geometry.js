import { lampPreset } from "./lamps.js";
import { windowSource } from "./windows.js";
import { LightKind } from "./light-kind.js";

// Height and horizontal distance use the same scale as the cached light field.
export const LIGHT_HEIGHT_UNIT = 32;

export function lightSource(light) {
  if (light.kind === LightKind.Window) return windowSource(light);
  // Keep EMF tile coordinates as the light's identity. The native object artwork
  // has its foot below/left of the tile centre; use that same ground anchor for
  // illumination, visibility and guides, including during move previews.
  const anchor =
    light.kind === LightKind.Free ? null : lampPreset(light.graphic)?.anchor;
  const dx = anchor?.x ?? 0;
  const dy = anchor?.y ?? 0;
  return {
    x: light.x + dx / 64 + dy / 32,
    y: light.y - dx / 64 + dy / 32,
    height: light.height ?? 0,
  };
}

export function lightGroundRadius(light) {
  const height = (light.height ?? 0) / LIGHT_HEIGHT_UNIT;
  return Math.sqrt(Math.max(0, light.radius ** 2 - height ** 2));
}

export function projectLight(light) {
  const source = lightSource(light);
  const x = (source.x - source.y) * 32 + 32;
  const groundY = (source.x + source.y) * 16 + 16;
  return { x, groundY, sourceY: groundY - source.height };
}
