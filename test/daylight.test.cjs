const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");
const {
  SECONDS_PER_DAY,
  ambientAt,
  glowStrength,
} = require("../src/core/lighting/model/daylight");
const {
  AMBIENT_PRESETS,
  defaultLighting,
} = require("../src/core/lighting/model/settings");
const { glowOf, lampShown } = require("../src/core/lighting/appearance/glow");
const { Layer } = require("../src/core/lighting/layer");

const hours = (h) => h * 3600;
const preset = ({ brightness, color }) => ({ brightness, color });

test("the sky is night at midnight, day at noon and dusk at dusk", () => {
  assert.deepEqual(ambientAt(0), preset(AMBIENT_PRESETS.night));
  assert.deepEqual(ambientAt(hours(3)), preset(AMBIENT_PRESETS.night));
  assert.deepEqual(ambientAt(hours(12)), preset(AMBIENT_PRESETS.day));
  assert.deepEqual(ambientAt(hours(6.5)), preset(AMBIENT_PRESETS.dusk));
  assert.deepEqual(ambientAt(hours(18.5)), preset(AMBIENT_PRESETS.dusk));
  assert.deepEqual(ambientAt(hours(22)), preset(AMBIENT_PRESETS.night));
});

test("dawn brightens and dusk darkens without a jump, across midnight too", () => {
  let previous = ambientAt(0);
  for (let s = 60; s <= SECONDS_PER_DAY; s += 60) {
    const ambient = ambientAt(s);
    assert.ok(
      Math.abs(ambient.brightness - previous.brightness) < 0.01,
      `${s}s`,
    );
    assert.match(ambient.color, /^#[0-9a-f]{6}$/);
    previous = ambient;
  }
  assert.deepEqual(
    ambientAt(SECONDS_PER_DAY + hours(12)),
    ambientAt(hours(12)),
  );
  assert.deepEqual(ambientAt(-hours(12)), ambientAt(hours(12)));
});

test("lamps glow fully at night, partly at dusk and not at all by day", () => {
  assert.equal(glowStrength(AMBIENT_PRESETS.night), 1);
  assert.equal(glowStrength(AMBIENT_PRESETS.day), 0);
  const dusk = glowStrength(AMBIENT_PRESETS.dusk);
  assert.ok(dusk > 0 && dusk < 1);
  assert.equal(glowStrength({ brightness: 0.1, color: "#000000" }), 1);
});

// A one-tile map with a street lamp (7) or a shelf candle (73) on it.
function lampMap(graphic) {
  const gfx = new Array(9).fill(null);
  gfx[Layer.Objects] = graphic;
  const tiles = [{ gfx }];
  return { width: 1, height: 1, tiles, getTile: () => tiles[0] };
}
const textures = {
  get: () => ({ mask: "mask", halo: { width: 64, height: 64 } }),
  getFlame: () => ({
    base: null,
    frames: [{ x: 0, y: 0, flame: "flame", core: "core" }],
  }),
};
const shown = (graphic) => ({
  layer: Layer.Objects,
  x: 0,
  y: 0,
  graphic,
  pending: false,
});
function glowAt(graphic, strength) {
  const map = lampMap(graphic);
  const lighting = defaultLighting();
  const lamp = lampShown(map, lighting, shown(graphic));
  return glowOf(textures, 0, shown(graphic), lamp, [], strength);
}

test("by day a lamp adds nothing, and a candle keeps only its flame", () => {
  const lampByNight = glowAt(7, 1);
  assert.ok(lampByNight.halo.alpha > 0);
  assert.equal(glowAt(7, 0), null);

  const candleByNight = glowAt(73, 1);
  assert.deepEqual(
    candleByNight.overlays.map((o) => o.frame),
    ["flame", "core"],
  );
  const candleByDay = glowAt(73, 0);
  assert.equal(candleByDay.halo, null);
  assert.deepEqual(
    candleByDay.overlays.map((o) => o.frame),
    ["flame"],
  );

  const dusk = glowAt(7, 0.5);
  assert.ok(Math.abs(dusk.halo.alpha - lampByNight.halo.alpha / 2) < 1e-9);
});
