import { lampAt, freeLightAt } from "../model/lamps.js";
import { SOLID_WALL_GRAPHICS, WallGrid } from "./walls.js";
import { LIGHT_HEIGHT_UNIT, lightSource } from "../model/light-geometry.js";
import { windowAt } from "../model/windows.js";
import { tileInMap } from "../model/validation.js";
import { Layer, isWallLayer } from "../../data/layer.js";
import { LightKind } from "../model/light-kind.js";

export const HEIGHT_STEP = LIGHT_HEIGHT_UNIT;
export const HEIGHT_LEVELS = 19; // 0..576 px: max source height + max light reach.
const MAX_RADIUS = 12;
// Up to four sources share a tile. Keys are integers, kind * tiles + index,
// so wall edits look sources up without building or hashing strings.
const LAMP = 0,
  FREE = 1,
  WINDOW_DOWN = 2,
  WINDOW_RIGHT = 3,
  SOURCE_KINDS = 4;
// Keys a blocker's neighbourhood scan would visit.
const NEIGHBOURHOOD_KEYS = (2 * MAX_RADIUS + 3) ** 2 * SOURCE_KINDS;
const CONTRIBUTION_FIELDS = [
  "x",
  "y",
  "graphic",
  "kind",
  "layer",
  "radius",
  "height",
  "color",
  "brightness",
  "enabled",
  "shadows",
];
const sameContribution = (a, b) =>
  a && b && CONTRIBUTION_FIELDS.every((key) => a[key] === b[key]);

function rgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

const castsShadow = (light) =>
  light && light.enabled && light.brightness !== 0 && light.shadows !== false;

// Settings are immutable: unchanged entries retain their identity. Comparing
// references avoids serializing every light for each inspector input event.
// Each added, removed or replaced key is visited once, without a key union.
function forChangedKeys(before, after, update) {
  if (before === after) return;
  before = before || {};
  after = after || {};
  const coordinates = (key) => key.split(",").map(Number);
  for (const key in before)
    if (before[key] !== after[key]) update(...coordinates(key));
  for (const key in after) if (!(key in before)) update(...coordinates(key));
}

// Cached light at fixed height bands. Building one source costs O(ZR² + AR),
// with fixed Z height bands and A angular rays. Sampling is O(1), not O(lights).
// Retained contributions are sampled without a per-light loop at render time.
export class LightField {
  constructor(emf, settings) {
    this.emf = emf;
    this.settings = settings;
    this.width = emf.width;
    this.height = emf.height;
    this.tiles = this.width * this.height;
    this.bandSize = this.tiles * 3;
    this.values = new Float32Array(this.bandSize * HEIGHT_LEVELS);
    this.sources = new Map();
    this.walls = new WallGrid(emf);
    this.dirtyWalls = new Set();
    this.preview = null;
    // Moves whenever a sample could change: a contribution, the ambient light
    // or a wall edge. Drawn tints stay valid while it holds still.
    this.revision = 0;
    this.setAmbient(settings.ambient);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tile = emf.getTile(x, y);
        if (tile.gfx[Layer.Objects] != null) this.updateTile(x, y);
        if (tile.gfx[Layer.DownWall] != null)
          this.updateWindow(x, y, Layer.DownWall);
        if (tile.gfx[Layer.RightWall] != null)
          this.updateWindow(x, y, Layer.RightWall);
      }
    }
    forChangedKeys(null, settings.lights, (x, y) => this.updateFreeLight(x, y));
  }

  sourceKey(kind, x, y) {
    return kind * this.tiles + y * this.width + x;
  }

  windowSourceKey(x, y, layer) {
    return this.sourceKey(
      layer === Layer.DownWall ? WINDOW_DOWN : WINDOW_RIGHT,
      x,
      y,
    );
  }

  setAmbient(ambient) {
    this.ambient = rgb(ambient.color).map(
      (channel) => channel * ambient.brightness,
    );
    this.revision++;
  }

  setSettings(settings) {
    // The replaced light may change with the settings; its tool redraws it.
    this.setPreview(null);
    // A metadata edit can follow a wall command before the next render tick.
    // Finish that geometry batch against its old settings before applying this.
    this.flushWalls();
    const old = this.settings;
    this.settings = settings;
    if (old.ambient !== settings.ambient) this.setAmbient(settings.ambient);
    // Source updates also compare their effective contribution, so imported or
    // cloned equivalent overrides still reuse the field.
    forChangedKeys(old.lamps, settings.lamps, (x, y) => this.updateTile(x, y));
    forChangedKeys(old.lights, settings.lights, (x, y) =>
      this.updateFreeLight(x, y),
    );
    forChangedKeys(old.windows, settings.windows, (x, y, layer) =>
      this.updateWindow(x, y, layer),
    );
  }

  // Bulb and pane glow change only the cached sprite overlay, not surface
  // lighting: an equal contribution keeps the field and stores the new light.
  replaceSource(key, light) {
    const previous = this.sources.get(key);
    if (sameContribution(previous, light)) {
      this.sources.set(key, light);
      return;
    }
    if (previous) this.accumulate(previous, -1);
    if (light) {
      this.sources.set(key, light);
      this.accumulate(light, 1);
    } else this.sources.delete(key);
  }

  updateFreeLight(x, y) {
    if (!tileInMap(this.emf, x, y)) return;
    this.replaceSource(
      this.sourceKey(FREE, x, y),
      freeLightAt(this.emf, this.settings, x, y),
    );
  }

  updateTile(x, y) {
    if (!tileInMap(this.emf, x, y)) return;
    this.replaceSource(
      this.sourceKey(LAMP, x, y),
      lampAt(this.emf, this.settings, x, y),
    );
  }

  updateWindow(x, y, layer) {
    if (!tileInMap(this.emf, x, y) || !isWallLayer(layer)) return;
    this.replaceSource(
      this.windowSourceKey(x, y, layer),
      windowAt(this.emf, this.settings, x, y, layer),
    );
  }

  queueWall(x, y) {
    this.dirtyWalls.add(y * this.width + x);
  }

  // A light shown before it is placed, and the committed light it replaces
  // while moving. It is kept apart from `sources`, so a wall edit can remove
  // it against the old walls and restore it against the new ones.
  setPreview(preview) {
    this.applyPreview(-1);
    this.preview = preview?.light ? preview : null;
    this.applyPreview(1);
  }

  applyPreview(sign) {
    if (!this.preview) return;
    this.accumulate(this.preview.light, sign);
    if (this.preview.replaces) this.accumulate(this.preview.replaces, -sign);
  }

  flushWalls() {
    if (!this.dirtyWalls.size) return;
    // Ground corners read wall edges, even where no light is re-traced.
    this.revision++;
    const preview = this.preview;
    this.setPreview(null);
    const affected = new Set();
    const changedWindows = new Map();
    const blockers = [];
    for (const index of this.dirtyWalls) {
      const x = index % this.width,
        y = (index - x) / this.width;
      // Window graphics are also blockers. Keep their OLD source until every
      // affected contribution has been removed with the OLD optical grid.
      for (const layer of [Layer.DownWall, Layer.RightWall]) {
        const key = this.windowSourceKey(x, y, layer);
        const previous = this.sources.get(key);
        const light = windowAt(this.emf, this.settings, x, y, layer);
        if ((!previous && !light) || sameContribution(previous, light))
          continue;
        changedWindows.set(key, light);
        if (previous) affected.add(key);
      }
      const tile = this.emf.getTile(x, y);
      // Repainting masonry without changing opacity or its window does not
      // alter any light path. Only emitter changes above need work in that case.
      if (
        Boolean(this.walls.down[index]) !==
          SOLID_WALL_GRAPHICS.has(tile.gfx[Layer.DownWall]) ||
        Boolean(this.walls.right[index]) !==
          SOLID_WALL_GRAPHICS.has(tile.gfx[Layer.RightWall])
      )
        blockers.push(x, y);
    }
    if (blockers.length) this.collectShadowedSources(blockers, affected);
    // Remove with the OLD optical grid before applying the batch of wall edits.
    for (const key of affected) this.accumulate(this.sources.get(key), -1);
    for (const index of this.dirtyWalls)
      this.walls.update(index % this.width, Math.floor(index / this.width));
    this.dirtyWalls.clear();
    for (const [key, light] of changedWindows) {
      if (light) {
        this.sources.set(key, light);
        affected.add(key);
      } else this.sources.delete(key);
    }
    for (const key of affected) {
      const light = this.sources.get(key);
      if (light) this.accumulate(light, 1);
    }
    this.setPreview(preview);
  }

  // Add every shadow-casting source that reaches a changed blocker, visiting
  // whichever is smaller: all L sources, or each blocker's bounded
  // neighbourhood. O(D * min(L, Rmax²)) for D blockers.
  collectShadowedSources(blockers, affected) {
    const reaches = (light, source, x, y) => {
      const dx = source.x - x,
        dy = source.y - y;
      return dx * dx + dy * dy <= (light.radius + 1) ** 2;
    };
    // One pass over the sources costs no more than one neighbourhood scan.
    if (this.sources.size <= NEIGHBOURHOOD_KEYS) {
      for (const [key, light] of this.sources) {
        if (affected.has(key) || !castsShadow(light)) continue;
        const source = lightSource(light);
        for (let i = 0; i < blockers.length; i += 2)
          if (reaches(light, source, blockers[i], blockers[i + 1])) {
            affected.add(key);
            break;
          }
      }
      return;
    }
    // Native anchors stay within half a tile of their owner on either axis;
    // the extra cell covers both that offset and the edited wall's endpoints.
    for (let i = 0; i < blockers.length; i += 2) {
      const x = blockers[i],
        y = blockers[i + 1];
      const minX = Math.max(0, x - MAX_RADIUS - 1),
        maxX = Math.min(this.width - 1, x + MAX_RADIUS + 1);
      const minY = Math.max(0, y - MAX_RADIUS - 1),
        maxY = Math.min(this.height - 1, y + MAX_RADIUS + 1);
      for (let kind = 0; kind < SOURCE_KINDS; kind++)
        for (let sy = minY; sy <= maxY; sy++)
          for (let sx = minX; sx <= maxX; sx++) {
            const key = this.sourceKey(kind, sx, sy);
            if (affected.has(key)) continue;
            const light = this.sources.get(key);
            if (castsShadow(light) && reaches(light, lightSource(light), x, y))
              affected.add(key);
          }
    }
  }

  accumulate(light, sign) {
    if (!light.enabled || light.brightness === 0) return;
    this.revision++;
    const channels = rgb(light.color);
    const radius = light.radius;
    const radiusSquared = radius * radius;
    const height = light.height ?? 0;
    const source = lightSource(light);
    const depths =
      light.shadows === false
        ? null
        : this.walls.lazyDepths({ ...source, radius });
    const firstHeight = Math.max(0, Math.ceil(height / HEIGHT_STEP - radius));
    const lastHeight = Math.min(
      HEIGHT_LEVELS - 1,
      Math.floor(height / HEIGHT_STEP + radius),
    );
    const heightSquares = new Float64Array(lastHeight - firstHeight + 1);
    for (let z = firstHeight; z <= lastHeight; z++) {
      const dz = (z * HEIGHT_STEP - height) / HEIGHT_STEP;
      heightSquares[z - firstHeight] = dz * dz;
    }
    const minX = Math.max(0, Math.floor(source.x - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(source.x + radius));
    const minY = Math.max(0, Math.floor(source.y - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(source.y + radius));
    // Windows emit through their outward-facing glass, never back into the
    // building, including when another wall provides an open route.
    const facing = light.kind === LightKind.Window;
    const sourceZ = height / HEIGHT_STEP;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - source.x,
          dy = y - source.y;
        if (facing && dx * source.normalX + dy * source.normalY <= 0) continue;
        const planarSquared = dx * dx + dy * dy;
        if (
          planarSquared >= radiusSquared ||
          !WallGrid.visible(depths, dx, dy, Math.sqrt(planarSquared))
        )
          continue;
        const index = (y * this.width + x) * 3;
        // Visit only bands inside the sphere, |z - sourceZ| < span, widened
        // by one band each side; the distance test below stays exact.
        const span = Math.sqrt(radiusSquared - planarSquared);
        const zFrom = Math.max(firstHeight, Math.floor(sourceZ - span));
        const zTo = Math.min(lastHeight, Math.ceil(sourceZ + span));
        for (let z = zFrom; z <= zTo; z++) {
          const distanceSquared =
            (planarSquared + heightSquares[z - firstHeight]) / radiusSquared;
          if (distanceSquared >= 1) continue;
          const falloff = (1 - distanceSquared) ** 2 * light.brightness * sign;
          const offset = z * this.bandSize + index;
          this.values[offset] += channels[0] * falloff;
          this.values[offset + 1] += channels[1] * falloff;
          this.values[offset + 2] += channels[2] * falloff;
        }
      }
    }
  }

  tint(x, y, height = 0) {
    x = Math.max(0, Math.min(this.width - 1, x));
    y = Math.max(0, Math.min(this.height - 1, y));
    const left = Math.floor(x),
      top = Math.floor(y);
    const right = Math.min(this.width - 1, left + 1),
      bottom = Math.min(this.height - 1, top + 1);
    const fx = x - left,
      fy = y - top;
    const z = Math.max(0, Math.min(HEIGHT_LEVELS - 1, height / HEIGHT_STEP));
    const low = Math.floor(z),
      high = Math.min(HEIGHT_LEVELS - 1, low + 1),
      fz = z - low;
    // Called for every lit vertex, so it allocates nothing: each corner is
    // an offset into the low band, and the high band sits `span` further on.
    const values = this.values;
    const span = (high - low) * this.bandSize;
    const band = low * this.bandSize;
    const topLeft = band + (top * this.width + left) * 3,
      topRight = band + (top * this.width + right) * 3,
      bottomLeft = band + (bottom * this.width + left) * 3,
      bottomRight = band + (bottom * this.width + right) * 3;
    let result = 0;
    for (let c = 0; c < 3; c++) {
      const a =
        (values[topLeft + c] * (1 - fz) + values[topLeft + c + span] * fz) *
          (1 - fx) +
        (values[topRight + c] * (1 - fz) + values[topRight + c + span] * fz) *
          fx;
      const b =
        (values[bottomLeft + c] * (1 - fz) +
          values[bottomLeft + c + span] * fz) *
          (1 - fx) +
        (values[bottomRight + c] * (1 - fz) +
          values[bottomRight + c + span] * fz) *
          fx;
      const value = Math.round(
        Math.max(0, Math.min(1, this.ambient[c] + a * (1 - fy) + b * fy)) * 255,
      );
      result = (result << 8) | value;
    }
    return result;
  }

  groundCornerTint(x, y, dx, dy) {
    // Do not interpolate the lit room's colour into a tile behind its wall.
    return this.walls.edge(x, y, dx, dy)
      ? this.tint(x, y)
      : this.tint(x + dx, y + dy);
  }
}
