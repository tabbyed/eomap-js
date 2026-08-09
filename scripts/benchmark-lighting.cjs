#!/usr/bin/env node
// Run from the repository: node --expose-gc scripts/benchmark-lighting.cjs
// Optionally add --fixture path/to/00005.emf --json --samples 21.
require("./register-core.cjs");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { performance } = require("node:perf_hooks");
const { parseArgs } = require("node:util");
const { EMF } = require("../src/core/data/emf");
const { EOReader } = require("../src/core/data/eo-reader");
const {
  LightField,
  HEIGHT_LEVELS,
} = require("../src/core/lighting/light-field");
const { SHADOW_RAYS } = require("../src/core/lighting/walls");
const {
  defaultLighting,
  lampAt,
  lightSettings,
  withLight,
  FREE_LIGHT_PRESET,
} = require("../src/core/lighting/lamps");
const { windowAt } = require("../src/core/lighting/windows");

const { values: args } = parseArgs({
  options: {
    fixture: { type: "string" },
    json: { type: "boolean" },
    samples: { type: "string", default: "21" },
  },
});
const sampleCount = Number(args.samples);
if (!Number.isInteger(sampleCount) || sampleCount < 5 || sampleCount > 100)
  throw new Error("--samples must be an integer from 5 to 100.");

let checksum = 0;
const round = (value) => Number(value.toFixed(6));
function measure(operation, operationsPerSample) {
  for (let warm = 0; warm < 3; warm++)
    for (let i = 0; i < operationsPerSample; i++) operation();
  const times = [];
  for (let sample = 0; sample < sampleCount; sample++) {
    const start = performance.now();
    for (let i = 0; i < operationsPerSample; i++) operation();
    times.push((performance.now() - start) / operationsPerSample);
  }
  times.sort((a, b) => a - b);
  return {
    medianMs: round(times[Math.floor(times.length / 2)]),
    p95Ms: round(times[Math.ceil(times.length * 0.95) - 1]),
    operationsPerSample,
  };
}

function synthetic(size, dense) {
  const emf = EMF.new(size, size, "Lighting benchmark");
  let settings = defaultLighting();
  settings.ambient = { color: "#97b5ed", brightness: 0.3 };
  const centre = Math.floor(size / 2);
  const positions = [];
  if (dense) {
    for (let y = 12; y < size - 12; y += 6)
      for (let x = 12; x < size - 12; x += 6) positions.push({ x, y });
  } else {
    for (let y = centre - 6; y <= centre + 6; y += 4)
      for (let x = centre - 6; x <= centre + 6; x += 4)
        positions.push({ x, y });
  }
  positions.forEach(({ x, y }, i) => {
    if (i % 4 === 0) {
      emf.getTile(x, y).gfx[1] = 7;
      const lamp = lampAt(emf, settings, x, y);
      settings = withLight(settings, lamp, { ...lamp, radius: 6 });
    } else if (i % 4 === 1) {
      const layer = i % 8 === 1 ? 3 : 4;
      emf.getTile(x, y).gfx[layer] = layer === 3 ? 477 : 474;
      const window = windowAt(emf, settings, x, y, layer);
      settings = withLight(settings, window, { ...window, radius: 6 });
    } else {
      settings.lights[`${x},${y}`] = lightSettings({
        ...FREE_LIGHT_PRESET,
        radius: 6,
        height: i % 4 === 2 ? 96 : 0,
      });
    }
  });
  // Same editable source and reach across map sizes; discovery is not timed here.
  const editKey = `${centre},${centre + 1}`;
  settings.lights[editKey] = lightSettings({
    ...FREE_LIGHT_PRESET,
    radius: 6,
    height: 64,
  });
  return {
    name: `synthetic-${size}-${dense ? "dense" : "sparse"}`,
    emf,
    settings,
    editKey,
  };
}

function fixture(filename) {
  const bytes = fs.readFileSync(filename);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  return {
    name: path.basename(filename),
    emf: EMF.read(new EOReader(buffer)),
    settings: defaultLighting(),
  };
}

function benchmark({ name, emf, settings, editKey }) {
  let buildSink;
  const build = measure(() => {
    buildSink = new LightField(emf, settings);
    checksum ^= buildSink.sources.size;
  }, 1);
  buildSink = null;
  global.gc?.();
  const field = new LightField(emf, settings);
  global.gc?.();
  const sourceCounts = {};
  for (const source of field.sources.values())
    sourceCounts[source.kind] = (sourceCounts[source.kind] || 0) + 1;
  const editable = editKey
    ? [...field.sources.values()].find(
        (source) => source.kind === "free" && source.key === editKey,
      )
    : [...field.sources.values()].find((source) => source.kind === "lamp") ||
      field.sources.values().next().value;
  if (!editable) throw new Error(`${name} has no editable light source.`);
  const glowing =
    [...field.sources.values()].find(
      (source) => source.kind === "lamp" || source.kind === "window",
    ) || editable;
  let toggle = false;
  const singleEdit = measure(() => {
    toggle = !toggle;
    field.setSettings(
      withLight(field.settings, editable, {
        ...editable,
        brightness: editable.brightness * (toggle ? 0.9 : 1),
      }),
    );
  }, 10);
  field.setSettings(settings);
  const glowEdit = measure(() => {
    toggle = !toggle;
    field.setSettings(
      withLight(field.settings, glowing, {
        ...glowing,
        glow: toggle ? 0.5 : 1,
      }),
    );
  }, 20);
  field.setSettings(settings);
  const ambient = measure(() => {
    toggle = !toggle;
    field.setSettings({
      ...field.settings,
      ambient: { color: "#97b5ed", brightness: toggle ? 0.3 : 0.4 },
    });
  }, 200);
  field.setSettings(settings);

  const wallX = Math.min(emf.width - 1, editable.x + 2),
    wallY = editable.y;
  const wallTile = emf.getTile(wallX, wallY),
    originalWall = wallTile.gfx[3];
  wallTile.gfx[3] = null;
  field.queueWall(wallX, wallY);
  field.flushWalls();
  const wallChange = measure(() => {
    wallTile.gfx[3] = wallTile.gfx[3] === null ? 7 : null;
    field.queueWall(wallX, wallY);
    field.flushWalls();
  }, 3);
  wallTile.gfx[3] = 7;
  field.queueWall(wallX, wallY);
  field.flushWalls();
  const opaqueWallRepaint = measure(() => {
    wallTile.gfx[3] = wallTile.gfx[3] === 7 ? 8 : 7;
    field.queueWall(wallX, wallY);
    field.flushWalls();
  }, 3);
  wallTile.gfx[3] = originalWall;
  field.queueWall(wallX, wallY);
  field.flushWalls();

  const zeroLight = { ...editable, brightness: 0 };
  const zeroBrightnessSource = measure(
    () => field.accumulate(zeroLight, 1),
    20,
  );
  let sampleIndex = 0;
  const sample = measure(() => {
    const i = sampleIndex++;
    checksum ^= field.tint(
      ((i * 7) % emf.width) + 0.25,
      ((i * 11) % emf.height) + 0.75,
      i % 193,
    );
  }, 10000);
  return {
    name,
    width: emf.width,
    height: emf.height,
    sourceCounts,
    editSource: {
      kind: editable.kind,
      radius: editable.radius,
      height: editable.height,
    },
    overrideCount: ["lamps", "lights", "windows"].reduce(
      (sum, key) => sum + Object.keys(settings[key] || {}).length,
      0,
    ),
    memory: {
      fieldBytes: field.values.byteLength,
      wallGridBytes: field.walls.down.byteLength + field.walls.right.byteLength,
      totalNumericBytes:
        field.values.byteLength +
        field.walls.down.byteLength +
        field.walls.right.byteLength,
    },
    timings: {
      build,
      singleEdit,
      wallChange,
      opaqueWallRepaint,
      ambient,
      glowEdit,
      zeroBrightnessSource,
      sample,
    },
  };
}

const started = performance.now();
const cases = [];
if (args.fixture) cases.push(fixture(path.resolve(args.fixture)));
for (const size of [64, 128, 253]) {
  cases.push(synthetic(size, false));
  cases.push(synthetic(size, true));
}
const report = {
  runtime: process.version,
  platform: process.platform,
  cpu: os.cpus()[0]?.model,
  sampleCount,
  heightBands: HEIGHT_LEVELS,
  shadowRays: SHADOW_RAYS,
  statistics: {
    median: "Median of warm per-operation batch averages, in milliseconds",
    p95: "Batch-normalized p95, not individual-input tail latency; build uses batch size one",
  },
  notes: [
    "Warm CPU-only timings include immutable settings copying for edits, but exclude Babel startup, EMF parsing, fixture generation, browser rendering, texture uploads and UI updates.",
    "p95 is the percentile of per-operation batch averages, not individual-event tail latency. Each operation has three warm-up batches.",
    "Synthetic sparse scenes have the same 16 mixed sources plus one editable free light; dense scenes add one mixed source every six tiles, with radius six. They are stress fixtures, not expected content density.",
    "The dense fixtures are not a worst-case bound: a tile can carry a lamp, a free light and two window sources (up to four sources per tile). Total startup work still grows with source count; pathological content is intentionally not benchmarked here.",
    "Memory counts are exact typed-array byte lengths for the field and wall grid; JavaScript source records, EMF/settings and graphics memory are excluded. --expose-gc permits collection between initial-build measurement and edit measurement; GC is never explicitly run inside timed operations.",
    "Results vary with CPU, runtime, garbage collection and other work. This is not a browser frame-rate guarantee.",
  ],
  cases: cases.map(benchmark),
};
report.elapsedMs = round(performance.now() - started);
report.checksum = checksum;
if (args.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(
    `${report.runtime} / ${report.cpu}; ${sampleCount} samples, milliseconds per operation (median / p95)`,
  );
  console.table(
    report.cases.map((result) => ({
      scene: result.name,
      sources: Object.values(result.sourceCounts).reduce((a, b) => a + b, 0),
      fieldMiB: (result.memory.fieldBytes / 1048576).toFixed(2),
      ...Object.fromEntries(
        Object.entries(result.timings).map(([key, value]) => [
          key,
          `${value.medianMs.toFixed(4)} / ${value.p95Ms.toFixed(4)}`,
        ]),
      ),
    })),
  );
  for (const note of report.notes) console.log(note);
}
