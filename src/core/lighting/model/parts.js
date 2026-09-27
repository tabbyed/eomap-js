import { ASSET_PACK } from "../packs/index.js";
import { Layer } from "../../data/layer.js";
import { tileInMap } from "./validation.js";

// Fixtures drawn across several sprites on one layer: an owner graphic and
// its parts, each at an offset (dx, dy) from the owner's tile. The split
// church windows and the fireplace are both described this way, and this is
// the only place the relation is read.
//
// A part is { layer, graphic, owner, dx, dy }: `graphic` is drawn at the
// owner's tile + (dx, dy). The owner alone carries the fixture's light and
// settings; its parts are drawn beside it. A sprite can be a part of one
// fixture and the owner of another, such as the church wall lantern.

const PARTS = new Map();
const OWNERS = new Map();
const NONE = Object.freeze([]);
const key = (layer, graphic) => `${layer}:${graphic}`;

function register(part) {
  const owner = key(part.layer, part.owner);
  if (!PARTS.has(owner)) PARTS.set(owner, []);
  PARTS.get(owner).push(part);
  OWNERS.set(key(part.layer, part.graphic), part);
}

// Lamps list their parts; each window part names its owner.
for (const preset of ASSET_PACK.lamps)
  for (const { graphic, dx, dy } of preset.parts ?? [])
    register({ layer: Layer.Objects, graphic, owner: preset.graphic, dx, dy });
for (const [graphic, layer, owner, dx, dy] of ASSET_PACK.windowParts)
  register({ layer, graphic, owner, dx, dy });

/** The parts drawn with an owner graphic on a layer. */
export function partsOf(layer, owner) {
  return PARTS.get(key(layer, owner)) ?? NONE;
}

/** The part a graphic is on a layer, or null. */
export function partOf(layer, graphic) {
  return OWNERS.get(key(layer, graphic)) ?? null;
}

const graphicAt = (emf, layer, x, y) =>
  tileInMap(emf, x, y) ? emf.getTile(x, y).gfx[layer] : undefined;

/**
 * Where the owner of the part drawn at (x, y) belongs, if that tile holds a
 * part: { x, y, graphic }. Whether the owner is really there, and what it
 * is, is for the caller's own lookup to decide.
 */
export function ownerOf(emf, layer, x, y) {
  const part = partOf(layer, graphicAt(emf, layer, x, y));
  return part && { x: x - part.dx, y: y - part.dy, graphic: part.owner };
}

/** Where each part of an owner at (x, y) belongs: { x, y, graphic }. */
export function partTiles(layer, owner, x, y) {
  return partsOf(layer, owner).map((part) => ({
    x: x + part.dx,
    y: y + part.dy,
    graphic: part.graphic,
  }));
}

/**
 * The parts of an owner at (x, y) that are really drawn where they belong.
 * Clearing only these never removes an unrelated sprite standing where a
 * missing part would go.
 */
export function placedParts(emf, layer, owner, x, y) {
  return partTiles(layer, owner, x, y).filter(
    (tile) => graphicAt(emf, layer, tile.x, tile.y) === tile.graphic,
  );
}
