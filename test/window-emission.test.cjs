const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");
const {
  windowAppearance,
  maskOutline,
} = require("../src/core/lighting/appearance/window-emission");
const {
  createPixelHitMask,
  pixelHit,
} = require("../src/core/gfx/pixel-hit-mask");

function mask(width, height, points) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha = 255] of points)
    data.set([255, 255, 255, alpha], (y * width + x) * 4);
  return { width, height, data };
}

test("window glass remains visible with no outdoor spill", () => {
  const light = { enabled: true, glow: 0.85, color: "#FFD495" };
  const unlitStreet = windowAppearance({ ...light, brightness: 0 });
  const brightStreet = windowAppearance({ ...light, brightness: 2 });
  assert.deepEqual(unlitStreet, brightStreet);
  assert.equal(unlitStreet.enabled, true);
  assert.equal(unlitStreet.alpha, 0.765);
  assert.equal(unlitStreet.color, 0xffd495);
  assert.equal(
    windowAppearance({ ...light, color: "#3366aa" }).color,
    0x3366aa,
  );
});

test("glow and enabled controls stop emission without invalid opacity", () => {
  for (const patch of [
    { enabled: false },
    { glow: 0 },
    { glow: -1 },
    { glow: NaN },
    { glow: Infinity },
  ]) {
    const appearance = windowAppearance({
      enabled: true,
      glow: 0.85,
      ...patch,
    });
    assert.equal(appearance.enabled, false);
    assert.equal(appearance.alpha, 0);
  }
  assert.equal(windowAppearance({ glow: 2, color: "invalid" }).alpha, 1);
  assert.equal(windowAppearance({ glow: 2, color: "invalid" }).color, 0xffd495);
  assert.equal(windowAppearance(null).enabled, false);
});

test("picking follows pane alpha rather than the rectangular wall or frame", () => {
  // Window textures retain a 1-bit pane mask for picking, not RGBA pixels.
  const panes = createPixelHitMask(
    mask(5, 4, [
      [1, 1],
      [3, 1, 128],
      [1, 2],
      [3, 2],
    ]),
  );
  assert.equal(pixelHit(panes, 1.9, 1.9), true);
  assert.equal(pixelHit(panes, 3, 1), true);
  assert.equal(pixelHit(panes, 2, 1), false); // Mullion.
  assert.equal(pixelHit(panes, 0, 0), false); // Wall/frame.
  for (const [x, y] of [
    [-0.1, 1],
    [1, -0.1],
    [5, 1],
    [1, 4],
    [NaN, 1],
    [1, Infinity],
  ])
    assert.equal(pixelHit(panes, x, y), false);
  assert.equal(pixelHit(null, 0, 0), false);
  assert.throws(
    () => createPixelHitMask({ width: 1, height: 1, data: [] }),
    TypeError,
  );
});

test("pane outlines contain boundary edges without internal pixel seams", () => {
  const pixels = mask(2, 2, [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]);
  // A filled square is four sides, each one merged segment of length 2.
  const outline = maskOutline(pixels);
  assert.equal(outline.length, 4);
  for (const [x1, y1, x2, y2] of outline) {
    assert.equal(Math.abs(x2 - x1) + Math.abs(y2 - y1), 2);
    assert.ok(
      (x1 === x2 && (x1 === 0 || x1 === 2)) ||
        (y1 === y2 && (y1 === 0 || y1 === 2)),
    );
  }
  assert.equal(new Set(outline.map((edge) => edge.join(","))).size, 4);
  // An L-shaped pane keeps its inner corner: six sides.
  assert.equal(
    maskOutline(
      mask(2, 2, [
        [0, 0],
        [0, 1],
        [1, 1],
      ]),
    ).length,
    6,
  );
  // Separate panes are never joined across the mullion between them.
  assert.equal(
    maskOutline(
      mask(3, 1, [
        [0, 0],
        [2, 0],
      ]),
    ).length,
    8,
  );
  assert.deepEqual(maskOutline(mask(3, 2, [])), []);
  assert.deepEqual(maskOutline(null), []);
});
