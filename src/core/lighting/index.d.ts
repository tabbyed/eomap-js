// Types for eo-lighting. The package is plain JavaScript; these describe its
// public API (index.js). test/lighting-package.test.cjs keeps the two in step.

// ---------------------------------------------------------------- Maps --

/** One tile's graphics, indexed by Layer. */
export interface LightingTile {
  readonly gfx: ArrayLike<number | null | undefined>;
}

/** A map as the lighting reads it: an EMF, or anything shaped like one. */
export interface LightingMap {
  readonly width: number;
  readonly height: number;
  getTile(x: number, y: number): LightingTile;
  /** Every tile; only mapFingerprint reads it. */
  readonly tiles: Iterable<LightingTile>;
}

/** Decoded ImageData-like pixels: 4 bytes per pixel, row by row. */
export interface RgbaPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export declare const Layer: Readonly<{
  Ground: 0;
  Objects: 1;
  Overlay: 2;
  DownWall: 3;
  RightWall: 4;
  Roof: 5;
  Top: 6;
  Shadow: 7;
  Overlay2: 8;
}>;
export declare function isWallLayer(layer: number): boolean;
export declare function isRgbaPixels(pixels: unknown): pixels is RgbaPixels;

// ------------------------------------------------------------ Settings --

export type LightKindName = "lamp" | "free" | "window";
export declare const LightKind: Readonly<{
  Lamp: "lamp";
  Free: "free";
  Window: "window";
}>;

/** A lamp's or free light's settings, as saved. */
export interface LightSettings {
  radius: number;
  brightness: number;
  glow: number;
  color: string;
  enabled: boolean;
  height: number;
  shadows: boolean;
}

/** A window's or wall fixture's settings, as saved. */
export interface WindowSettings {
  enabled: boolean;
  color: string;
  brightness: number;
  glow: number;
  radius: number;
}

export interface AmbientSettings {
  brightness: number;
  color: string;
}

/** A map's lighting: ambient light and overrides keyed by position. */
export interface Lighting {
  ambient: AmbientSettings;
  /** "x,y,graphic" */
  lamps: Record<string, LightSettings>;
  /** "x,y" */
  lights: Record<string, LightSettings>;
  /** "x,y,layer,graphic" */
  windows: Record<string, WindowSettings>;
}

/** A light as found on a map: its settings, identity and position. */
export interface Light extends Partial<LightSettings> {
  kind: LightKindName;
  key: string;
  x: number;
  y: number;
  graphic?: number;
  layer?: number;
  name?: string;
  [detail: string]: unknown;
}

export interface LampPreset {
  id: string;
  name: string;
  graphic: number;
  radius: number;
  color: string;
  brightness: number;
  glow: number;
  height: number;
  anchor: { x: number; y: number };
  description: string;
  variants?: readonly (
    | number
    | { graphic: number; [override: string]: unknown }
  )[];
  parts?: readonly { graphic: number; dx: number; dy: number }[];
  kind?: LightKindName;
}

export interface Selection {
  kind: LightKindName;
  x: number;
  y: number;
  layer?: number;
}

export declare const AMBIENT_PRESETS: Readonly<
  Record<string, { name: string; brightness: number; color: string }>
>;
export declare function defaultLighting(): Lighting;
export declare function ambientSettings(value: unknown): AmbientSettings;

/** Seconds in a day: the range of a time of day, from midnight. */
export declare const SECONDS_PER_DAY: number;
/**
 * The ambient light at a time of day, in seconds after midnight: night until
 * dawn, day from mid-morning to early evening, with dusk's light between.
 */
export declare function ambientAt(seconds: number): AmbientSettings;
/**
 * How strongly lamp glass, halos and window panes glow under an ambient
 * light, from 0 in daylight to 1 at night: glowOf's `strength`.
 */
export declare function glowStrength(ambient: AmbientSettings): number;
export declare function selectedLight(
  map: LightingMap,
  lighting: Lighting,
  selection: Selection | null | undefined,
): Light | null;
export declare function withLight(
  lighting: Lighting,
  light: Pick<Light, "kind" | "key">,
  settings: object | null,
): Lighting;
export declare function lightEntry(
  lighting: Lighting,
  light: Pick<Light, "kind" | "key">,
): LightSettings | WindowSettings | undefined;

// --------------------------------------------------- Lamps and windows --

export interface TilePlacement {
  x: number;
  y: number;
  graphic: number;
}

export declare const CHICAGO_AMBER: Readonly<{
  color: string;
  brightness: number;
  glow: number;
}>;
export declare const FREE_LIGHT_PRESET: Readonly<
  Omit<LampPreset, "graphic" | "anchor"> & LightSettings
>;
export declare const LAMP_PRESETS: readonly LampPreset[];
export declare function lampPreset(graphic: number): LampPreset | null;
export declare function presetById(id: string): LampPreset | null;
export declare function lampKey(x: number, y: number, graphic: number): string;
export declare function lampAt(
  map: LightingMap,
  lighting: Lighting,
  x: number,
  y: number,
): Light | null;
export declare function lampOwning(
  map: LightingMap,
  lighting: Lighting,
  x: number,
  y: number,
): Light | null;
export declare function freeLightAt(
  map: LightingMap,
  lighting: Lighting,
  x: number,
  y: number,
): Light | null;
export declare function lampTiles(
  preset: Pick<LampPreset, "graphic">,
  x: number,
  y: number,
  graphic?: number,
): TilePlacement[];
export declare function placedLampTiles(
  map: LightingMap,
  lamp: Light,
): TilePlacement[];
export declare function lampFitsAt(
  map: LightingMap,
  preset: Pick<LampPreset, "graphic">,
  x: number,
  y: number,
  moving?: Light | null,
): boolean;
export declare function lightSettings(value: unknown): LightSettings;

/** One sprite's window glass. */
export interface GlassSpec {
  key: string;
  graphic: number;
  layer: number;
  width: number;
  height: number;
  /** left, top, right, bottom; right and bottom exclusive. */
  bounds: [number, number, number, number];
  glass: number[][];
  colors: ReadonlySet<number>;
}

export interface WindowDefinition extends GlassSpec {
  name: string;
  fixture: "window" | "lantern";
  defaults: Readonly<WindowSettings & { shadows: boolean }>;
  centreX: number;
  centreY: number;
  sourceHeight: number;
}

export interface GlassItem<F = unknown> {
  light: Light;
  spec: GlassSpec;
  /** Set by the renderer: the uploaded pane mask, once there is one. */
  texture?: { mask: F } | null;
}

export declare const WINDOW_DEFAULTS: Readonly<
  WindowSettings & { shadows: boolean }
>;
export declare const WINDOW_DEFINITIONS: ReadonlyMap<number, WindowDefinition>;
export declare const WINDOW_PARTS: ReadonlyMap<
  number,
  GlassSpec & { owner: number; dx: number; dy: number }
>;
export declare function windowKey(
  x: number,
  y: number,
  layer: number,
  graphic: number,
): string;
export declare function windowAt(
  map: LightingMap,
  lighting: Lighting,
  x: number,
  y: number,
  layer: number,
): Light | null;
export declare function windowGlassAt(
  map: LightingMap,
  lighting: Lighting,
  x: number,
  y: number,
  layer: number,
): GlassItem[];
export declare function windowGlassSprites(
  map: LightingMap,
  light: Light,
): { x: number; y: number; spec: GlassSpec }[];
export declare function windowSource(light: Light): {
  x: number;
  y: number;
  height: number;
  normalX: number;
  normalY: number;
};
export declare function windowSettings(value: unknown): WindowSettings;
export declare function createWindowMask(
  pixels: RgbaPixels,
  glass: number | GlassSpec,
): RgbaPixels;

/** A sprite drawn beside its owner as part of one fixture. */
export interface Part {
  layer: number;
  graphic: number;
  owner: number;
  dx: number;
  dy: number;
}
export declare function partsOf(layer: number, owner: number): readonly Part[];
export declare function partOf(layer: number, graphic: number): Part | null;
export declare function ownerOf(
  map: LightingMap,
  layer: number,
  x: number,
  y: number,
): TilePlacement | null;
export declare function partTiles(
  layer: number,
  owner: number,
  x: number,
  y: number,
): TilePlacement[];
export declare function placedParts(
  map: LightingMap,
  layer: number,
  owner: number,
  x: number,
  y: number,
): TilePlacement[];

// ------------------------------------------------------------ Geometry --

export declare const LIGHT_HEIGHT_UNIT: number;
/** Where a light shines from, in tiles, with its height in pixels. */
export declare function lightSource(light: Light): {
  x: number;
  y: number;
  height: number;
};
/** A light's ground point and source in world pixels. */
export declare function projectLight(light: Light): {
  x: number;
  groundY: number;
  sourceY: number;
};
export declare function lightGroundRadius(light: Light): number;
export declare function wallSurfaceVertex(
  layer: number,
  tileX: number,
  tileY: number,
  frameHeight: number,
  localX: number,
  localY: number,
): { x: number; y: number; height: number; sampleX: number; sampleY: number };
export declare function wallSurfaceSlices(
  tileX: number,
  tileY: number,
  frameHeight: number,
  step?: number,
): number[];

// --------------------------------------------------------------- Field --

export declare const HEIGHT_STEP: number;
export declare const HEIGHT_LEVELS: number;
export declare const SOLID_WALL_GRAPHICS: ReadonlySet<number>;

/** The cached light over a map, at fixed height bands. */
export declare class LightField {
  constructor(map: LightingMap, lighting: Lighting);
  readonly width: number;
  readonly height: number;
  /** Moves whenever any sample could change. */
  readonly revision: number;
  setSettings(lighting: Lighting): void;
  /** Re-reads the Objects graphic at a tile, after it changes. */
  updateTile(x: number, y: number): void;
  /** Marks a tile whose wall graphics changed; flushWalls applies them. */
  queueWall(x: number, y: number): void;
  flushWalls(): void;
  setPreview(preview: { light: Light; replaces?: Light | null } | null): void;
  /** The light at a point (tiles, pixels above ground) as 0xRRGGBB. */
  tint(x: number, y: number, height?: number): number;
  groundCornerTint(x: number, y: number, dx: number, dy: number): number;
}

/** How a renderer describes a graphic it draws. */
export interface ShownGraphic {
  layer: number;
  x: number;
  y: number;
  /** The graphic ID whose art is showing. */
  graphic: number;
  /** A replacement is still loading, so older art is showing. */
  pending: boolean;
}

export declare function spriteTint(
  field: LightField,
  map: LightingMap,
  shown: Pick<ShownGraphic, "layer" | "x" | "y">,
  frameWidth: number,
  frameHeight: number,
): number;
export declare function surfaceTints(
  field: LightField,
  map: LightingMap,
  graphic: {
    layer: number;
    tileX: number;
    tileY: number;
    surfaceTints?: unknown;
  },
  frame: { width: number; height: number },
): { rows: number[] | null; tints: number[] };

// ---------------------------------------------------------- Appearance --

export interface EmissionAppearance {
  enabled: boolean;
  coreAlpha: number;
  haloAlpha: number;
  coreColor: number;
  haloColor: number;
}
export declare function emissionAppearance(
  light: Partial<LightSettings>,
): EmissionAppearance;
export declare function createBulbMask(
  pixels: RgbaPixels,
  graphic: number,
): RgbaPixels;
export declare function createHaloPixels(size?: number): RgbaPixels;
export declare function isGlowing(r: number, g: number, b: number): boolean;
export declare function windowAppearance(light: Partial<WindowSettings>): {
  enabled: boolean;
  alpha: number;
  color: number;
};
/** A mask's outline as line segments: x1, y1, x2, y2. */
export declare function maskOutline(
  pixels: RgbaPixels,
): [number, number, number, number][];

export declare const FLAMES: ReadonlyMap<number, object>;
export declare function flameStep(time: number): number;
export declare function flameFrame(
  key: string,
  step: number,
  count: number,
): number;
export declare function flameFlicker(key: string, step: number): number;
/** Each source a graphic's flame is built from: [gfx file, graphic ID]. */
export declare function flameSources(graphic: number): {
  pixels: [number, number];
  empty?: [number, number];
  fire?: [number, number];
} | null;
export declare function createFlameAnimation(
  pixels: RgbaPixels,
  graphic: number,
  sources?: { empty?: RgbaPixels; fire?: RgbaPixels },
): {
  base: RgbaPixels | null;
  frames: { x: number; y: number; flame: RgbaPixels; core: RgbaPixels }[];
} | null;

/** The textures a renderer has uploaded for glows; F is its frame type. */
export interface GlowTextures<F> {
  get(
    graphic: number,
  ):
    | { mask: F; halo: F & { width: number; height: number } }
    | null
    | undefined;
  getFlame(graphic: number):
    | {
        base: F | null;
        frames: readonly { x: number; y: number; flame: F; core: F }[];
      }
    | null
    | undefined;
}

/** What lighting adds to one drawn graphic. */
export interface Glow<F> {
  art: F | null;
  halo: { frame: F; x: number; y: number; alpha: number; tint: number } | null;
  overlays: { frame: F; dx: number; dy: number; alpha: number; tint: number }[];
  flickers: boolean;
}

/** F is the renderer's frame type, for the `texture` it attaches to each item. */
export declare function glassShown<F = unknown>(
  map: LightingMap,
  lighting: Lighting,
  shown: ShownGraphic,
): GlassItem<F>[];
export declare function lampShown(
  map: LightingMap,
  lighting: Lighting,
  shown: ShownGraphic,
  displaced?: string | null,
): Light | null;
export declare function glowOf<F>(
  textures: GlowTextures<F>,
  step: number,
  shown: ShownGraphic,
  lamp: Light | null,
  glass: readonly GlassItem<F>[],
  strength?: number,
): Glow<F> | null;

// ---------------------------------------------------------------- File --

export declare function mapFingerprint(map: LightingMap): string;
export declare function serializeLighting(
  map: LightingMap,
  lighting: Lighting,
): string;
export declare function readLightingFile(
  text: string,
  map: LightingMap,
): { lighting: Lighting; mapChanged: boolean; dropped: number };
export declare function parseLighting(text: string, map: LightingMap): Lighting;

// -------------------------------------------------------------- Catalogue --

export declare const ASSET_PACK: Readonly<{
  id: string;
  lamps: readonly LampPreset[];
  solidWalls: readonly number[];
  [entry: string]: unknown;
}>;
