// Lighting catalogue for the native Endless Online graphics: which walls
// block light, which objects are lamps and candles, their moving flames and
// the windows painted into wall art.
//
// Everything the lighting code knows about specific artwork lives here, so a
// different graphics pack needs a new catalogue rather than code changes.
// Graphic IDs are EMF graphics, not EGF resource IDs (those are graphic + 100).
// Verify window entries with scripts/audit-window-assets.cjs.

export const id = "eo-native";

export * from "./walls.js";
export * from "./lamps.js";
export * from "./flames.js";
export * from "./windows.js";
