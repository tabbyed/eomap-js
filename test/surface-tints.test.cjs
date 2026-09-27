const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../scripts/register-core.cjs");

const {
  LightField,
  HEIGHT_LEVELS,
  HEIGHT_STEP,
} = require("../src/core/lighting/field/light-field");
const { surfaceTints } = require("../src/core/lighting/field/surface-tints");
const {
  wallSurfaceVertex,
  wallSurfaceSlices,
} = require("../src/core/lighting/model/wall-surface");
const { defaultLighting } = require("../src/core/lighting/model/settings");
const { EMF } = require("../src/core/data/emf");

const SOLID = 350; // A catalogued solid wall.
const FENCE = 30; // A wall-layer graphic that lets light through.

function lit() {
  const emf = EMF.new(16, 16, "Surface tints");
  emf.getTile(5, 5).gfx[1] = 7; // A street lamp.
  emf.getTile(6, 5).gfx[3] = SOLID;
  emf.getTile(4, 6).gfx[4] = SOLID;
  emf.getTile(8, 8).gfx[3] = FENCE;
  const lighting = defaultLighting();
  lighting.ambient = { brightness: 0.3, color: "#97b5ed" };
  lighting.lights["9,4"] = {
    radius: 4,
    brightness: 1.2,
    glow: 0,
    color: "#88aaff",
    enabled: true,
    height: 40,
    shadows: true,
  };
  return { emf, lighting, field: new LightField(emf, lighting) };
}

const frames = {
  wall: { width: 32, height: 248 },
  ground: { width: 64, height: 32 },
  prop: { width: 32, height: 64 },
};
const graphics = () => [
  { tileX: 6, tileY: 5, layer: 3, frame: frames.wall },
  { tileX: 4, tileY: 6, layer: 4, frame: frames.wall },
  { tileX: 8, tileY: 8, layer: 3, frame: frames.wall },
  { tileX: 5, tileY: 6, layer: 0, frame: frames.ground },
  { tileX: 5, tileY: 5, layer: 1, frame: frames.prop },
];

// The sampling batchLitFrame did for every vertex of every redraw.
function reference(field, emf, { tileX: x, tileY: y, layer }, frame) {
  if ((layer === 3 || layer === 4) && emf.getTile(x, y).gfx[layer] === SOLID) {
    const rows = wallSurfaceSlices(x, y, frame.height);
    return {
      rows,
      tints: rows.flatMap((row) =>
        [0, frame.width].map((px) => {
          const p = wallSurfaceVertex(layer, x, y, frame.height, px, row);
          return field.tint(p.sampleX, p.sampleY, Math.max(0, p.height));
        }),
      ),
    };
  }
  if (layer === 0)
    return {
      rows: null,
      tints: [
        field.groundCornerTint(x, y, -1, 0),
        field.groundCornerTint(x, y, 0, -1),
        field.groundCornerTint(x, y, 0, 1),
        field.groundCornerTint(x, y, 1, 0),
      ],
    };
  return { rows: null, tints: Array(4).fill(field.tint(x, y)) };
}

function assertMatchesReference(field, emf, list) {
  for (const graphic of list) {
    const { rows, tints } = surfaceTints(field, emf, graphic, graphic.frame);
    const expected = reference(field, emf, graphic, graphic.frame);
    assert.deepEqual(
      { rows, tints: [...tints] },
      expected,
      `layer ${graphic.layer} at ${graphic.tileX},${graphic.tileY}`,
    );
  }
}

function countSamples(field) {
  const counts = { samples: 0 };
  for (const method of ["tint", "groundCornerTint"]) {
    const original = field[method].bind(field);
    field[method] = (...args) => {
      counts.samples++;
      return original(...args);
    };
  }
  return counts;
}

test("cached tints match the field for solid walls, see-through walls, ground and props", () => {
  const { emf, field } = lit();
  const list = graphics();
  assertMatchesReference(field, emf, list);
  // Solid walls are shaded in strips; everything else takes four corners.
  assert.ok(list[0].surfaceTints.rows.length > 2);
  assert.equal(list[2].surfaceTints.rows, null);
});

test("a redraw that changes no light samples nothing", () => {
  const { emf, field } = lit();
  const list = graphics();
  for (const graphic of list) surfaceTints(field, emf, graphic, graphic.frame);
  const counts = countSamples(field);
  for (let redraw = 0; redraw < 3; redraw++)
    for (const graphic of list)
      surfaceTints(field, emf, graphic, graphic.frame);
  assert.equal(counts.samples, 0);
});

test("a light, ambient or wall change refreshes the tints it affects", () => {
  const { emf, lighting, field } = lit();
  const list = graphics();
  assertMatchesReference(field, emf, list);

  const brighter = {
    ...lighting,
    lights: {
      "9,4": { ...lighting.lights["9,4"], brightness: 2, radius: 6 },
    },
  };
  field.setSettings(brighter);
  assertMatchesReference(field, emf, list);

  field.setSettings({
    ...brighter,
    ambient: { brightness: 0.6, color: "#ffffff" },
  });
  assertMatchesReference(field, emf, list);

  // A new wall moves the field on even where no light is re-traced, since
  // ground corners read wall edges directly.
  const before = field.revision;
  emf.getTile(12, 12).gfx[3] = SOLID;
  field.queueWall(12, 12);
  field.flushWalls();
  assert.ok(field.revision > before);
  assertMatchesReference(field, emf, list);

  // Replacing a solid wall with a fence changes how it is shaded.
  emf.getTile(6, 5).gfx[3] = FENCE;
  field.queueWall(6, 5);
  field.flushWalls();
  assertMatchesReference(field, emf, list);
  assert.equal(list[0].surfaceTints.rows, null);
});

test("a new field or a different frame height recomputes", () => {
  const { emf, lighting, field } = lit();
  const [wall] = graphics();
  const first = surfaceTints(field, emf, wall, frames.wall);
  const rebuilt = new LightField(emf, lighting);
  const counts = countSamples(rebuilt);
  surfaceTints(rebuilt, emf, wall, frames.wall);
  assert.ok(counts.samples > 0);
  assert.equal(first.field, rebuilt);

  const shorter = { width: 32, height: 200 };
  assert.deepEqual(
    [...surfaceTints(rebuilt, emf, wall, shorter).rows],
    wallSurfaceSlices(wall.tileX, wall.tileY, shorter.height),
  );
  assertMatchesReference(rebuilt, emf, [{ ...wall, frame: shorter }]);
});

test("tint interpolates exactly as the per-corner sampler it replaced", () => {
  const { field } = lit();
  // The previous implementation, kept here as the reference.
  const expected = (x, y, height = 0) => {
    x = Math.max(0, Math.min(field.width - 1, x));
    y = Math.max(0, Math.min(field.height - 1, y));
    const left = Math.floor(x),
      top = Math.floor(y);
    const right = Math.min(field.width - 1, left + 1),
      bottom = Math.min(field.height - 1, top + 1);
    const fx = x - left,
      fy = y - top;
    const z = Math.max(0, Math.min(HEIGHT_LEVELS - 1, height / HEIGHT_STEP));
    const low = Math.floor(z),
      high = Math.min(HEIGHT_LEVELS - 1, low + 1),
      fz = z - low;
    const sample = (tx, ty, c) => {
      const i = (ty * field.width + tx) * 3 + c;
      return (
        field.values[low * field.bandSize + i] * (1 - fz) +
        field.values[high * field.bandSize + i] * fz
      );
    };
    let result = 0;
    for (let c = 0; c < 3; c++) {
      const a = sample(left, top, c) * (1 - fx) + sample(right, top, c) * fx;
      const b =
        sample(left, bottom, c) * (1 - fx) + sample(right, bottom, c) * fx;
      const value = Math.round(
        Math.max(0, Math.min(1, field.ambient[c] + a * (1 - fy) + b * fy)) *
          255,
      );
      result = (result << 8) | value;
    }
    return result;
  };
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 5000; i++) {
    const x = random() * 18 - 1,
      y = random() * 18 - 1,
      height = random() * 700 - 50;
    assert.equal(field.tint(x, y, height), expected(x, y, height));
  }
  // Edges and the top height band, where neighbours clamp onto themselves.
  for (const [x, y, height] of [
    [15, 15, 576],
    [0, 0, 0],
    [15.5, 7.25, 600],
  ])
    assert.equal(field.tint(x, y, height), expected(x, y, height));
});
