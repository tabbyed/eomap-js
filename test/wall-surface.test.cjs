const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");
const {
  wallSurfaceVertex,
  wallSurfaceSlices,
} = require("../src/core/lighting/wall-surface");

function spritePoint(layer, tileX, tileY, height, px, py) {
  return {
    x: (tileX - tileY) * 32 + (layer === 4 ? 32 : 0) + px,
    y: (tileX + tileY) * 16 + 31 - height + py,
  };
}

function project(vertex) {
  return {
    x: (vertex.x - vertex.y) * 32 + 32,
    y: (vertex.x + vertex.y) * 16 + 16 - vertex.height,
  };
}

test("wall vertices reproject exactly to the native sprite for both orientations", () => {
  for (const layer of [3, 4]) {
    for (const [px, py] of [
      [0, 0],
      [32, 0],
      [0, 239],
      [32, 239],
      [9, 103],
    ]) {
      const vertex = wallSurfaceVertex(layer, 7, 11, 239, px, py);
      assert.deepEqual(project(vertex), spritePoint(layer, 7, 11, 239, px, py));
      if (layer === 3) {
        assert.equal(vertex.sampleX, vertex.x);
        assert.equal(vertex.sampleY, vertex.y + 0.5);
      } else {
        assert.equal(vertex.sampleX, vertex.x + 0.5);
        assert.equal(vertex.sampleY, vertex.y);
      }
    }
  }
});

test("adjacent bitmap resources share the same physical seam and exterior sample", () => {
  for (const layer of [3, 4]) {
    const first = { x: 7, y: 11, height: 239 };
    const second = {
      x: first.x + (layer === 3 ? 1 : 0),
      y: first.y - (layer === 4 ? 1 : 0),
      height: 184,
    };
    for (const physicalHeight of [0, 29, 96, 160]) {
      const ground = wallSurfaceVertex(
        layer,
        first.x,
        first.y,
        first.height,
        32,
        0,
      );
      const firstLocalY = ground.height - physicalHeight;
      const screen = spritePoint(
        layer,
        first.x,
        first.y,
        first.height,
        32,
        firstLocalY,
      );
      const secondTop = spritePoint(
        layer,
        second.x,
        second.y,
        second.height,
        0,
        0,
      );
      const secondLocalY = screen.y - secondTop.y;
      const a = wallSurfaceVertex(
        layer,
        first.x,
        first.y,
        first.height,
        32,
        firstLocalY,
      );
      const b = wallSurfaceVertex(
        layer,
        second.x,
        second.y,
        second.height,
        0,
        secondLocalY,
      );
      assert.deepEqual(a, b);
      assert.equal(a.height, physicalHeight);
      assert.deepEqual(project(a), screen);
      assert.deepEqual(project(b), screen);
    }
  }
});

test("different frame heights and anchors share world-space interpolation knots", () => {
  for (const layer of [3, 4]) {
    const a = { x: 7, y: 11, height: 239 };
    const b = {
      x: a.x + (layer === 3 ? 1 : 0),
      y: a.y - (layer === 4 ? 1 : 0),
      height: 184,
    };
    const topA = spritePoint(layer, a.x, a.y, a.height, 0, 0).y;
    const topB = spritePoint(layer, b.x, b.y, b.height, 0, 0).y;
    const overlapTop = Math.max(topA, topB);
    const overlapBottom = Math.min(topA + a.height, topB + b.height);
    const sharedKnots = (frame, top) =>
      wallSurfaceSlices(frame.x, frame.y, frame.height)
        .map((localY) => localY + top)
        .filter((worldY) => worldY > overlapTop && worldY < overlapBottom);
    const knotsA = sharedKnots(a, topA);
    assert.ok(knotsA.length > 5);
    assert.deepEqual(knotsA, sharedKnots(b, topB));
    assert.ok(knotsA.every((worldY) => worldY % 16 === 0));
  }
});

test("slice UV bounds and spacing remain valid above the screen origin", () => {
  const slices = wallSurfaceSlices(0, 0, 515);
  assert.equal(slices[0], 0);
  assert.equal(slices.at(-1), 515);
  for (let i = 1; i < slices.length; i++) {
    assert.ok(slices[i] > slices[i - 1]);
    assert.ok(slices[i] - slices[i - 1] <= 16);
  }
  assert.deepEqual(wallSurfaceSlices(0, 0, 0), [0]);
  assert.throws(() => wallSurfaceSlices(0, 0, 32, 0), RangeError);
});
