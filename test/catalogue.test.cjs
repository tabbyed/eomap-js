const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");

// Structural checks on the native lighting catalogue, so a mistake in its
// data fails here rather than in the editor. Checks against the real
// graphics (exact glass colours and bounds) live in window-assets.test.cjs
// and scripts/audit-window-assets.cjs.
const pack = require("../src/core/lighting/packs/eo-native");
const { lightSettings } = require("../src/core/lighting/model/lamps");
const { windowSettings } = require("../src/core/lighting/model/windows");
const { partsOf, partOf } = require("../src/core/lighting/model/parts");
const { Layer, isWallLayer } = require("../src/core/data/layer");

const { lamps, windows, windowParts, bulbGlass, flames, solidWalls } = pack;
const variantGraphic = (variant) =>
  typeof variant === "number" ? variant : variant.graphic;
const isGraphic = (value) => Number.isInteger(value) && value > 0;

test("every lamp is a valid light with its own id and graphics", () => {
  const ids = new Set();
  const graphics = new Map();
  const claim = (graphic, id) => {
    assert.ok(isGraphic(graphic), `${id}: graphic ${graphic}`);
    assert.ok(
      !graphics.has(graphic),
      `${graphic}: ${graphics.get(graphic)} and ${id}`,
    );
    graphics.set(graphic, id);
  };
  for (const preset of lamps) {
    assert.ok(/^[a-z][a-z-]*$/.test(preset.id), `id ${preset.id}`);
    assert.ok(!ids.has(preset.id), `id ${preset.id} is used twice`);
    ids.add(preset.id);
    assert.ok(preset.name && preset.description, `${preset.id} is described`);
    claim(preset.graphic, preset.id);
    // Each variant, with its own overrides, is as valid as the preset.
    for (const variant of preset.variants ?? []) {
      claim(variantGraphic(variant), preset.id);
      const light = { ...preset, ...(typeof variant === "object" && variant) };
      assert.doesNotThrow(() => lightSettings({ ...light, enabled: true }));
      assert.ok(
        Number.isInteger(light.anchor.x) && Number.isInteger(light.anchor.y),
      );
    }
    assert.doesNotThrow(
      () => lightSettings({ ...preset, enabled: true }),
      preset.id,
    );
    assert.ok(
      Number.isInteger(preset.anchor.x) && Number.isInteger(preset.anchor.y),
    );
  }
});

test("every part belongs to an owner on its own layer, and no part is a lamp", () => {
  const lampGraphics = new Set(
    lamps.flatMap((preset) => [
      preset.graphic,
      ...(preset.variants ?? []).map(variantGraphic),
    ]),
  );
  for (const preset of lamps) {
    if (!preset.parts) continue;
    // Parts are tied to the preset's own graphic, so a mirrored variant
    // would need parts of its own.
    assert.equal(
      preset.variants,
      undefined,
      `${preset.id} has parts and variants`,
    );
    for (const part of preset.parts) {
      assert.ok(isGraphic(part.graphic));
      assert.ok(
        !lampGraphics.has(part.graphic),
        `part ${part.graphic} is a lamp`,
      );
      assert.ok(Math.abs(part.dx) + Math.abs(part.dy) > 0);
      assert.equal(partOf(Layer.Objects, part.graphic).owner, preset.graphic);
    }
  }
  const windowLayers = new Map(
    windows.map(([graphic, layer]) => [graphic, layer]),
  );
  for (const [graphic, layer, owner, dx, dy] of windowParts) {
    assert.equal(
      windowLayers.get(owner),
      layer,
      `part ${graphic}'s owner ${owner}`,
    );
    assert.ok(Math.abs(dx) + Math.abs(dy) > 0);
    assert.ok(partsOf(layer, owner).some((part) => part.graphic === graphic));
  }
});

test("every window and part pane lies inside its 32-pixel wall bitmap", () => {
  const seen = new Set();
  for (const [
    graphic,
    layer,
    height,
    bounds,
    glass,
    name,
    defaults,
  ] of windows) {
    assert.ok(!seen.has(graphic), `window ${graphic} is listed twice`);
    seen.add(graphic);
    assert.ok(isWallLayer(layer), `window ${graphic} layer ${layer}`);
    assert.ok(name, `window ${graphic} is named`);
    insideBitmap(graphic, height, bounds);
    rgbList(graphic, glass);
    if (defaults)
      assert.doesNotThrow(() =>
        windowSettings({
          enabled: true,
          color: "#ffd495",
          brightness: 0.65,
          glow: 0.85,
          radius: 3.5,
          ...defaults,
        }),
      );
  }
  for (const [graphic, layer, , , , height, bounds, glass] of windowParts) {
    assert.ok(isWallLayer(layer));
    insideBitmap(graphic, height, bounds);
    rgbList(graphic, glass);
  }
});

function insideBitmap(graphic, height, [left, top, right, bottom]) {
  assert.ok(Number.isInteger(height) && height > 0, `${graphic} height`);
  // Right and bottom are exclusive.
  assert.ok(
    0 <= left &&
      left < right &&
      right <= 32 &&
      0 <= top &&
      top < bottom &&
      bottom <= height,
    `${graphic}'s pane ${[left, top, right, bottom]} leaves its 32x${height} bitmap`,
  );
}

function rgbList(graphic, glass) {
  const colours = Array.isArray(glass[0]) ? glass : [glass];
  assert.ok(colours.length > 0);
  for (const colour of colours)
    assert.ok(
      colour.length === 3 &&
        colour.every((c) => Number.isInteger(c) && c >= 0 && c <= 255),
      `${graphic} glass colour ${colour}`,
    );
}

test("every bulb and flame region is a well-ordered rectangle", () => {
  const ordered = ({ left, top, right, bottom }) =>
    // Inclusive bounds; a flame may rise above its sprite (negative top).
    Number.isInteger(left) && left >= 0 && left <= right && top <= bottom;
  for (const [graphic, region] of bulbGlass)
    assert.ok(ordered(region), `bulb glass of ${graphic}`);
  for (const [graphic, spec] of flames) {
    if (spec.clear) {
      const [left, top, right, bottom] = spec.clear;
      assert.ok(ordered({ left, top, right, bottom }), `clear of ${graphic}`);
    }
    if (spec.window) {
      const [left, top, right, bottom] = spec.window;
      assert.ok(ordered({ left, top, right, bottom }), `window of ${graphic}`);
    }
  }
});

test("every moving flame names what it is built from", () => {
  const isFlameOwner = (graphic) =>
    lamps.some(
      (preset) =>
        preset.graphic === graphic ||
        (preset.variants ?? []).some((v) => variantGraphic(v) === graphic),
    ) || partOf(Layer.Objects, graphic);
  for (const [graphic, spec] of flames) {
    assert.ok(isFlameOwner(graphic), `flame ${graphic} belongs to no lamp`);
    if (spec.empty) {
      // A bent flame: its fire, taken from the difference to an empty sprite.
      assert.ok(isGraphic(spec.empty) && spec.empty !== graphic);
      for (const key of ["count", "sway", "lift", "base", "margin"])
        assert.ok(Number.isFinite(spec[key]), `${graphic}.${key}`);
    } else if (spec.fire) {
      // A borrowed flame: another sprite's animation, seen through a window.
      const { file, graphic: source, frames, rows } = spec.fire;
      assert.ok(Number.isInteger(file) && isGraphic(source));
      assert.ok(Number.isInteger(frames) && frames > 1 && rows > 0);
      assert.equal(spec.window?.length, 4, `window of ${graphic}`);
    } else {
      // A drawn flame: equal-sized frames of palette letters.
      assert.ok(spec.frames.length > 1, `frames of ${graphic}`);
      const [first] = spec.frames;
      for (const frame of spec.frames) {
        assert.equal(frame.length, first.length);
        assert.ok(frame.every((row) => row.length === first[0].length));
      }
    }
  }
});

test("each solid wall is listed once", () => {
  assert.equal(new Set(solidWalls).size, solidWalls.length);
  assert.ok(solidWalls.every(isGraphic));
});
