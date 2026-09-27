import { SOLID_WALL_GRAPHICS } from "./walls.js";
import { wallSurfaceVertex, wallSurfaceSlices } from "../model/wall-surface.js";
import { Layer, isWallLayer } from "../layer.js";

// The light each drawn graphic shows, as 0xRRGGBB vertex tints:
// - a solid wall is one upright surface, shaded in strips. `rows` are the
//   strip edges in bitmap pixels; `tints` holds each row's left and right.
// - a ground tile takes one tint per corner (top-left, top-right,
//   bottom-left, bottom-right) and never interpolates across a wall.
// - anything else takes the tint at its tile, at all four corners.
//
// Tints change only when the field does, so each graphic keeps its tints in
// `graphic.surfaceTints` until the field's revision moves on. Redraws for a
// flicker step, an animation frame or a pan then sample nothing: O(1) per
// graphic rather than O(rows) field samples. A stale entry is refilled in
// place, so relighting allocates nothing once every graphic has an entry.
export function surfaceTints(field, emf, graphic, frame) {
  const x = graphic.tileX,
    y = graphic.tileY,
    layer = graphic.layer;
  // The tile's current graphic decides, even while older art still shows.
  const solid =
    isWallLayer(layer) && SOLID_WALL_GRAPHICS.has(emf.getTile(x, y).gfx[layer]);
  let entry = graphic.surfaceTints;
  if (!entry)
    // Every field up front, so all entries share one shape.
    entry = graphic.surfaceTints = {
      field: null,
      revision: 0,
      solid: false,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rows: null,
      tints: [],
    };
  else if (
    entry.field === field &&
    entry.revision === field.revision &&
    entry.solid === solid &&
    entry.x === x &&
    entry.y === y &&
    entry.width === frame.width &&
    entry.height === frame.height
  )
    return entry;

  // Strip rows depend only on where the wall is and how tall its art is.
  if (!solid) entry.rows = null;
  else if (
    !entry.rows ||
    entry.x !== x ||
    entry.y !== y ||
    entry.height !== frame.height
  )
    entry.rows = wallSurfaceSlices(x, y, frame.height);
  entry.field = field;
  entry.revision = field.revision;
  entry.solid = solid;
  entry.x = x;
  entry.y = y;
  entry.width = frame.width;
  entry.height = frame.height;

  // Resizing an array is a slow path, so only a new shape of entry does it.
  const count = solid ? entry.rows.length * 2 : 4;
  if (entry.tints.length !== count) entry.tints = new Array(count).fill(0);
  const tints = entry.tints;
  if (solid) {
    // Neighbouring bitmaps share surface coordinates AND interpolation
    // rows, so adjacent pieces of one wall meet without seams.
    const rows = entry.rows;
    const sample = (px, py) => {
      const p = wallSurfaceVertex(layer, x, y, frame.height, px, py);
      return field.tint(p.sampleX, p.sampleY, Math.max(0, p.height));
    };
    for (let i = 0; i < rows.length; i++) {
      tints[i * 2] = sample(0, rows[i]);
      tints[i * 2 + 1] = sample(frame.width, rows[i]);
    }
  } else if (layer === Layer.Ground) {
    tints[0] = field.groundCornerTint(x, y, -1, 0);
    tints[1] = field.groundCornerTint(x, y, 0, -1);
    tints[2] = field.groundCornerTint(x, y, 0, 1);
    tints[3] = field.groundCornerTint(x, y, 1, 0);
  } else {
    tints[0] = tints[1] = tints[2] = tints[3] = field.tint(x, y);
  }
  return entry;
}

/**
 * One 0xRRGGBB tint for a whole sprite, for renderers that tint sprites
 * rather than their corners: a solid wall takes the light on its outside
 * face, halfway up its art, and anything else the light at its tile. Coarser
 * than surfaceTints, and cheaper: one sample per sprite.
 */
export function spriteTint(field, map, shown, frameWidth, frameHeight) {
  const { layer, x, y } = shown;
  if (
    isWallLayer(layer) &&
    SOLID_WALL_GRAPHICS.has(map.getTile(x, y).gfx[layer])
  ) {
    const p = wallSurfaceVertex(
      layer,
      x,
      y,
      frameHeight,
      frameWidth / 2,
      frameHeight / 2,
    );
    return field.tint(p.sampleX, p.sampleY, Math.max(0, p.height));
  }
  return field.tint(x, y);
}
