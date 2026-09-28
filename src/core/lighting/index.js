// eo-lighting: lighting for Endless Online maps, shared by the eomap-js
// editor and game clients. See README.md.

// Map layers and decoded pixels.
export { Layer, isWallLayer } from "./layer.js";
export { isRgbaPixels } from "./pixels.js";

// The catalogue of the native graphics.
export { ASSET_PACK } from "./packs/index.js";

// Lights: settings, lamps, free lights, windows and multi-sprite fixtures.
export { LightKind } from "./model/light-kind.js";
export {
  AMBIENT_PRESETS,
  ambientSettings,
  defaultLighting,
  isOutdoors,
  lightEntry,
  selectedLight,
  withLight,
  withOutdoors,
} from "./model/settings.js";
export { SECONDS_PER_DAY, ambientAt, glowStrength } from "./model/daylight.js";
export {
  CHICAGO_AMBER,
  FREE_LIGHT_PRESET,
  LAMP_PRESETS,
  freeLightAt,
  lampAt,
  lampFitsAt,
  lampKey,
  lampOwning,
  lampPreset,
  lampTiles,
  lightSettings,
  placedLampTiles,
  presetById,
} from "./model/lamps.js";
export {
  WINDOW_DEFAULTS,
  WINDOW_DEFINITIONS,
  WINDOW_PARTS,
  createWindowMask,
  windowAt,
  windowGlassAt,
  windowGlassSprites,
  windowKey,
  windowSettings,
  windowSource,
} from "./model/windows.js";
export {
  ownerOf,
  partOf,
  partTiles,
  partsOf,
  placedParts,
} from "./model/parts.js";
export {
  LIGHT_HEIGHT_UNIT,
  lightGroundRadius,
  lightSource,
  projectLight,
} from "./model/light-geometry.js";
export { wallSurfaceSlices, wallSurfaceVertex } from "./model/wall-surface.js";

// The light field, and how drawn surfaces sample it.
export { HEIGHT_LEVELS, HEIGHT_STEP, LightField } from "./field/light-field.js";
export { SOLID_WALL_GRAPHICS } from "./field/walls.js";
export { spriteTint, surfaceTints } from "./field/surface-tints.js";

// What lamps, windows and flames look like as they are drawn.
export {
  createBulbMask,
  createHaloPixels,
  emissionAppearance,
  isGlowing,
} from "./appearance/lamp-emission.js";
export { maskOutline, windowAppearance } from "./appearance/window-emission.js";
export {
  FLAMES,
  createFlameAnimation,
  flameFlicker,
  flameFrame,
  flameSources,
  flameStep,
} from "./appearance/flame-animation.js";
export { glassShown, glowOf, lampShown } from "./appearance/glow.js";

// The companion .lighting.json file.
export {
  mapFingerprint,
  parseLighting,
  readLightingFile,
  serializeLighting,
} from "./file/lighting-file.js";
