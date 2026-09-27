// The EMF layer names live with the lighting package, which needs them
// without the editor.
export { Layer, isWallLayer } from "../lighting/layer.js";

// The editor's own overlays (tile specs, entities, grid) come after the EMF
// graphic layers in its layer order.
export const FIRST_EDITOR_LAYER = 9;
