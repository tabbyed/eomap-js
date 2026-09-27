// The kinds of light a map can hold. A selection or light record names its
// kind, and lighting settings keep one collection per kind.
export const LightKind = Object.freeze({
  // A lamp graphic on the Objects layer.
  Lamp: "lamp",
  // A light on any tile, with no graphic.
  Free: "free",
  // A window or wall lantern painted into a wall graphic.
  Window: "window",
});
