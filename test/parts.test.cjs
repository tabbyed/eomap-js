const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");

const {
  partsOf,
  partOf,
  ownerOf,
  partTiles,
  placedParts,
} = require("../src/core/lighting/model/parts");
const { EMF } = require("../src/core/data/emf");
const { Layer } = require("../src/core/data/layer");

const { Objects, DownWall, RightWall } = Layer;

test("split windows and multi-tile lamps share one owner-and-parts relation", () => {
  // The fireplace's right-hand half, one tile right of the hearth.
  assert.deepEqual(partsOf(Objects, 77), [
    { layer: Objects, graphic: 78, owner: 77, dx: 1, dy: 0 },
  ]);
  // A church window continuing onto the sprite beside it.
  assert.deepEqual(partOf(DownWall, 4), {
    layer: DownWall,
    graphic: 4,
    owner: 3,
    dx: 1,
    dy: 0,
  });
  // Each part is listed under its owner, in the same direction.
  for (const [layer, owner] of [
    [Objects, 77],
    [DownWall, 3],
    [DownWall, 5],
    [RightWall, 9],
    [RightWall, 13],
  ])
    for (const part of partsOf(layer, owner))
      assert.equal(partOf(layer, part.graphic), part);
});

test("a relation holds only on its own layer", () => {
  assert.equal(partOf(RightWall, 4), null);
  assert.equal(partOf(Objects, 4), null);
  assert.deepEqual(partsOf(DownWall, 77), []);
  // Graphic 12 is the wall lantern's own sprite and also the lower half of
  // window 13: a part of one fixture can own another.
  assert.equal(partOf(RightWall, 12).owner, 13);
  assert.deepEqual(partsOf(RightWall, 12), []);
});

test("parts find their owners, and owners find only the parts really drawn", () => {
  const emf = EMF.new(10, 10, "Parts");
  const objects = (x, y, graphic) => (emf.getTile(x, y).gfx[Objects] = graphic);
  objects(2, 2, 77), objects(3, 2, 78);
  objects(6, 2, 77), objects(7, 2, 1); // A table where the half would go.
  objects(9, 5, 77); // At the map's edge: its half would fall outside.

  assert.deepEqual(ownerOf(emf, Objects, 3, 2), { x: 2, y: 2, graphic: 77 });
  assert.equal(ownerOf(emf, Objects, 2, 2), null, "an owner is not a part");
  assert.equal(ownerOf(emf, Objects, 7, 2), null, "the table is no part");
  assert.equal(ownerOf(emf, Objects, -1, 2), null);

  assert.deepEqual(partTiles(Objects, 77, 6, 2), [{ x: 7, y: 2, graphic: 78 }]);
  assert.deepEqual(placedParts(emf, Objects, 77, 2, 2), [
    { x: 3, y: 2, graphic: 78 },
  ]);
  assert.deepEqual(placedParts(emf, Objects, 77, 6, 2), [], "table stays");
  assert.deepEqual(placedParts(emf, Objects, 77, 9, 5), []);
});
