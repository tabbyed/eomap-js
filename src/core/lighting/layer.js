// EMF graphic layers, as indexed by Tile.gfx.
export const Layer = Object.freeze({
  Ground: 0,
  Objects: 1,
  Overlay: 2,
  DownWall: 3,
  RightWall: 4,
  Roof: 5,
  Top: 6,
  Shadow: 7,
  Overlay2: 8,
});

export function isWallLayer(layer) {
  return layer === Layer.DownWall || layer === Layer.RightWall;
}
