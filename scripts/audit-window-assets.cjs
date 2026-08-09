#!/usr/bin/env node
// Audit native gfx006 wall bitmaps for window glass. Local development only;
// graphics and maps stay in the user's EO installation.
//
//   node scripts/audit-window-assets.cjs --gfx <gfx-dir> --maps <maps-dir> [--write]
//
// Prints every bitmap whose dark, flat glass looks like a window, whether it
// is already catalogued, and whether it satisfies the single-sprite rules:
// complete within the 32 px sprite, and a colour that selects only glass
// within its bounds. It then verifies the whole catalogue in
// src/core/lighting/windows.js, including textured glass and windows split
// across two sprites, and --write regenerates docs/window-assets.json.
require("./register-core.cjs");
const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { PEReader } = require("../src/core/gfx/load/pe-reader");
const { DIBReader } = require("../src/core/gfx/load/dib-reader");
const { EMF } = require("../src/core/data/emf");
const { EOReader } = require("../src/core/data/eo-reader");
const {
  WINDOW_DEFINITIONS,
  WINDOW_PARTS,
  createWindowMask,
} = require("../src/core/lighting/windows");

const { values: args } = parseArgs({
  options: {
    gfx: { type: "string" },
    maps: { type: "string" },
    write: { type: "boolean", default: false },
  },
});
if (!args.gfx || !fs.existsSync(path.join(args.gfx, "gfx006.egf")))
  throw new Error("Pass --gfx <dir> containing gfx006.egf.");

const arrayBuffer = (file) => {
  const bytes = fs.readFileSync(file);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
};

// Glass is a dark, flat colour (pure black is transparent in EO bitmaps).
// Keep compact 4-connected regions of one exact colour.
function darkRegions({ width, height, data }) {
  const seen = new Uint8Array(width * height);
  const regions = [];
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !data[start * 4 + 3]) continue;
    seen[start] = 1;
    const rgb = [data[start * 4], data[start * 4 + 1], data[start * 4 + 2]];
    if (Math.max(...rgb) > 72) continue;
    const stack = [start];
    const pixels = [];
    while (stack.length) {
      const i = stack.pop();
      pixels.push(i);
      const x = i % width;
      for (const j of [i - 1, i + 1, i - width, i + width]) {
        if (j < 0 || j >= width * height || seen[j]) continue;
        if (Math.abs((j % width) - x) > 1) continue; // Row wrap.
        const k = j * 4;
        if (
          data[k + 3] &&
          data[k] === rgb[0] &&
          data[k + 1] === rgb[1] &&
          data[k + 2] === rgb[2]
        ) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    const xs = pixels.map((i) => i % width);
    const ys = pixels.map((i) => Math.floor(i / width));
    const bounds = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs) + 1,
      Math.max(...ys) + 1,
    ];
    const w = bounds[2] - bounds[0],
      h = bounds[3] - bounds[1];
    if (
      pixels.length >= 12 &&
      w >= 3 &&
      h >= 4 &&
      pixels.length / (w * h) >= 0.45
    )
      regions.push({ rgb, area: pixels.length, bounds, xs, ys });
  }
  return regions;
}

// Two to eight similar panes of one colour, clustered like one window.
function windowGlass(regions) {
  const byColour = new Map();
  for (const region of regions) {
    const key = region.rgb.join(",");
    if (!byColour.has(key)) byColour.set(key, []);
    byColour.get(key).push(region);
  }
  const groups = [];
  for (const panes of byColour.values()) {
    const areas = panes.map((pane) => pane.area);
    const bounds = [
      Math.min(...panes.map((pane) => pane.bounds[0])),
      Math.min(...panes.map((pane) => pane.bounds[1])),
      Math.max(...panes.map((pane) => pane.bounds[2])),
      Math.max(...panes.map((pane) => pane.bounds[3])),
    ];
    if (
      panes.length >= 2 &&
      panes.length <= 8 &&
      Math.min(...areas) >= 25 &&
      Math.max(...areas) <= 320 &&
      Math.max(...areas) / Math.min(...areas) <= 2.2 &&
      bounds[2] - bounds[0] <= 32 &&
      bounds[3] - bounds[1] <= 80 &&
      panes.every(({ bounds: [l, t, r, b] }) => {
        const w = r - l,
          h = b - t;
        return w >= 3 && w <= 16 && h >= 5 && h <= 32;
      })
    )
      groups.push({ rgb: panes[0].rgb, panes, bounds });
  }
  return groups;
}

// A Down wall's panes slope down to the right; a Right wall's slope up.
function paneSlope(panes) {
  let slope = 0;
  for (const { xs, ys, bounds } of panes) {
    const top = (column) => Math.min(...ys.filter((_, i) => xs[i] === column));
    slope += Math.sign(top(bounds[2] - 1) - top(bounds[0]));
  }
  return slope > 0 ? 3 : slope < 0 ? 4 : null;
}

function glassPixels({ width, data }, rgb, [left, top, right, bottom]) {
  let count = 0;
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) {
      const i = (y * width + x) * 4;
      if (
        data[i + 3] &&
        data[i] === rgb[0] &&
        data[i + 1] === rgb[1] &&
        data[i + 2] === rgb[2]
      )
        count++;
    }
  return count;
}

function placements(mapsDirectory) {
  const result = new Map();
  if (!mapsDirectory) return result;
  for (const name of fs.readdirSync(mapsDirectory).sort()) {
    if (!/\.emf$/i.test(name)) continue;
    let emf;
    try {
      emf = EMF.read(new EOReader(arrayBuffer(path.join(mapsDirectory, name))));
    } catch (error) {
      console.warn(`Skipping ${name}: ${error.message}`);
      continue;
    }
    for (let y = 0; y < emf.height; y++)
      for (let x = 0; x < emf.width; x++)
        for (const layer of [3, 4]) {
          const graphic = emf.getTile(x, y).gfx[layer];
          if (!graphic) continue;
          if (!result.has(graphic)) result.set(graphic, []);
          result.get(graphic).push({ map: name, x, y, layer });
        }
  }
  return result;
}

const egf = new PEReader(arrayBuffer(path.join(args.gfx, "gfx006.egf")));
const placed = placements(args.maps);
const rows = [];
for (const resource of [...egf.getResourceIDs()].sort((a, b) => a - b)) {
  const info = egf.getResourceInfo(resource);
  let pixels;
  try {
    pixels = {
      width: info.width,
      height: info.height,
      data: new DIBReader(egf.readResource(info)).read(),
    };
  } catch {
    continue;
  }
  const graphic = resource - 100;
  for (const glass of windowGlass(darkRegions(pixels))) {
    const occurrences = placed.get(graphic) ?? [];
    const layers = new Set(occurrences.map(({ layer }) => layer));
    const paneArea = glass.panes.reduce((sum, pane) => sum + pane.area, 0);
    rows.push({
      graphic,
      size: `${pixels.width}x${pixels.height}`,
      glass: glass.rgb.join(","),
      panes: glass.panes.length,
      bounds: glass.bounds.join(","),
      layer: layers.size === 1 ? [...layers][0] : paneSlope(glass.panes),
      placed: occurrences.length,
      // Rules for a native catalogue entry, as for the original six windows.
      complete: glass.bounds[0] > 0 && glass.bounds[2] < pixels.width,
      exact: glassPixels(pixels, glass.rgb, glass.bounds) === paneArea,
      catalogued: WINDOW_DEFINITIONS.has(graphic),
    });
  }
}
console.table(rows);
console.log(
  "Textured glass and windows split across sprites are not detected above;",
  "review the artwork and catalogue them with explicit palettes and parts.",
);

// Connected 4-neighbour regions of a mask's pixels.
function maskPanes({ width, height, data }) {
  const seen = new Uint8Array(width * height);
  const panes = [];
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !data[start * 4 + 3]) continue;
    seen[start] = 1;
    const stack = [start];
    let area = 0,
      bounds = [width, height, 0, 0];
    while (stack.length) {
      const i = stack.pop(),
        x = i % width,
        y = (i - x) / width;
      area++;
      bounds = [
        Math.min(bounds[0], x),
        Math.min(bounds[1], y),
        Math.max(bounds[2], x + 1),
        Math.max(bounds[3], y + 1),
      ];
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        const j = ny * width + nx;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen[j])
          continue;
        seen[j] = 1;
        if (data[j * 4 + 3]) stack.push(j);
      }
    }
    panes.push({ area, bounds });
  }
  return panes;
}

// Verify every catalogue entry with the production mask: the listed colours
// must select glass that fills its bounds exactly, and a partner half must
// always be placed beside its owner.
const placedAt = new Set(
  [...placed].flatMap(([graphic, list]) =>
    list.map(({ map, x, y, layer }) => `${map}|${x},${y},${layer}|${graphic}`),
  ),
);
const specs = [...WINDOW_DEFINITIONS.values(), ...WINDOW_PARTS.values()];
const audit = [];
for (const spec of specs) {
  const isPart = WINDOW_PARTS.get(spec.graphic) === spec;
  const label = `Graphic ${spec.graphic}${isPart ? " (partner half)" : ""}`;
  const problems = [];
  const resource = egf.getResourceInfo(spec.graphic + 100);
  const pixels = resource && {
    width: resource.width,
    height: resource.height,
    data: new DIBReader(egf.readResource(resource)).read(),
  };
  if (!pixels) problems.push("missing from gfx006");
  else if (pixels.width !== spec.width || pixels.height !== spec.height)
    problems.push("bitmap size differs");
  const panes = problems.length
    ? []
    : maskPanes(createWindowMask(pixels, spec));
  const tight = panes.reduce(
    (b, pane) => [
      Math.min(b[0], pane.bounds[0]),
      Math.min(b[1], pane.bounds[1]),
      Math.max(b[2], pane.bounds[2]),
      Math.max(b[3], pane.bounds[3]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  if (!problems.length && !panes.length) problems.push("no glass selected");
  else if (!problems.length && tight.join() !== spec.bounds.join())
    problems.push(`glass fills ${tight}, not the declared bounds`);
  const occurrences = placed.get(spec.graphic) ?? [];
  for (const { layer } of occurrences)
    if (layer !== spec.layer) problems.push(`placed on layer ${layer}`);
  const unpaired = isPart
    ? occurrences.filter(
        ({ map, x, y, layer }) =>
          layer === spec.layer &&
          !placedAt.has(
            `${map}|${x + spec.dx},${y + spec.dy},${layer}|${spec.owner}`,
          ),
      )
    : [];
  if (unpaired.length)
    problems.push(`${unpaired.length} placements lack their owner`);
  if (problems.length) {
    console.error(`${label}: ${[...new Set(problems)].join("; ")}`);
    process.exitCode = 1;
  }
  audit.push({
    graphic: spec.graphic,
    resource: spec.graphic + 100,
    ...(isPart
      ? { part: { owner: spec.owner, dx: spec.dx, dy: spec.dy } }
      : { name: spec.name }),
    width: spec.width,
    height: spec.height,
    frames: 1,
    glass: spec.glass,
    glassPixels: panes.reduce((sum, pane) => sum + pane.area, 0),
    glassBoundsExclusive: spec.bounds,
    panes,
    occurrences,
    ...(isPart ? { unpaired } : {}),
  });
}
console.log(
  `${specs.length} catalogue entries checked` +
    (process.exitCode ? " with problems." : "."),
);

if (args.write && !process.exitCode) {
  const output = path.resolve(__dirname, "../docs/window-assets.json");
  fs.writeFileSync(output, JSON.stringify(audit, null, 2) + "\n");
  console.log(`Wrote ${audit.length} catalogue entries to ${output}`);
}
