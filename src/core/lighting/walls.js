// Curated opaque surfaces in the native EO pack, verified against gfx006.
// Wall layers also contain fences, posts, fires and decorations. Walkability
// (TileSpec.Wall) is deliberately not used as an optical property.
export const SOLID_WALL_GRAPHICS = new Set([
  3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 92, 93, 94, 95, 96, 98, 99, 100, 116, 342,
  344, 350, 351, 352, 353, 354, 355, 356, 357, 431, 438, 462, 464, 465, 467,
  468, 469, 471, 472, 474, 475, 476, 477, 479, 480, 482, 483, 484, 486, 534,
  535,
]);

export const SHADOW_RAYS = 512;

// Ray directions are fixed; compute them once rather than per source build.
const RAY_X = new Float64Array(SHADOW_RAYS);
const RAY_Y = new Float64Array(SHADOW_RAYS);
for (let i = 0; i < SHADOW_RAYS; i++) {
  const angle = (i * Math.PI * 2) / SHADOW_RAYS;
  RAY_X[i] = Math.cos(angle);
  RAY_Y[i] = Math.sin(angle);
}

// Tile centres are integers. Down walls lie on y + 0.5; right walls on x + 0.5.
// These are separate edges, so light can reach a wall without entering the room.
export class WallGrid {
  constructor(emf) {
    this.emf = emf;
    this.width = emf.width;
    this.height = emf.height;
    this.down = new Uint8Array(this.width * this.height);
    this.right = new Uint8Array(this.width * this.height);
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) this.update(x, y);
  }

  update(x, y) {
    const tile = this.emf.getTile(x, y),
      index = y * this.width + x;
    this.down[index] = SOLID_WALL_GRAPHICS.has(tile.gfx[3]) ? 1 : 0;
    this.right[index] = SOLID_WALL_GRAPHICS.has(tile.gfx[4]) ? 1 : 0;
  }

  edge(x, y, dx, dy) {
    const bx = dx < 0 ? x - 1 : x,
      by = dy < 0 ? y - 1 : y;
    if (bx < 0 || by < 0 || bx >= this.width || by >= this.height) return false;
    return Boolean((dx ? this.right : this.down)[by * this.width + bx]);
  }

  ray(x, y, dx, dy, radius) {
    const sx = dx >= 0 ? 1 : -1,
      sy = dy >= 0 ? 1 : -1;
    const stepX = Math.abs(dx) < 1e-10 ? Infinity : 1 / Math.abs(dx);
    const stepY = Math.abs(dy) < 1e-10 ? Infinity : 1 / Math.abs(dy);
    // Native emitters need not sit at a tile centre. Locate their containing
    // cell first, then measure the first boundary from the actual source.
    const sourceX = x,
      sourceY = y;
    x = Math.floor(sourceX + 0.5);
    y = Math.floor(sourceY + 0.5);
    let nextX = Number.isFinite(stepX)
        ? (x + sx * 0.5 - sourceX) / dx
        : Infinity,
      nextY = Number.isFinite(stepY) ? (y + sy * 0.5 - sourceY) / dy : Infinity;
    while (Math.min(nextX, nextY) < radius) {
      const distance = Math.min(nextX, nextY);
      // Check both edges at a corner; a diagonal must not leak through it.
      const crossX = nextX <= nextY + 1e-9,
        crossY = nextY <= nextX + 1e-9;
      if (
        (crossX && this.edge(x, y, sx, 0)) ||
        (crossY && this.edge(x, y, 0, sy))
      )
        return Math.max(0, distance);
      if (crossX) {
        x += sx;
        nextX += stepX;
      }
      if (crossY) {
        y += sy;
        nextY += stepY;
      }
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) break;
    }
    return radius;
  }

  depths(light) {
    const result = new Float32Array(SHADOW_RAYS);
    for (let i = 0; i < SHADOW_RAYS; i++)
      result[i] = this.ray(light.x, light.y, RAY_X[i], RAY_Y[i], light.radius);
    return result;
  }

  // The same depths, cast on first lookup. A light only reads the rays either
  // side of each tile within reach, so small lights cast O(min(A, R²)) rays
  // rather than all A.
  lazyDepths(light) {
    return new LazyDepths(this, light);
  }

  static visible(depths, dx, dy, distance) {
    if (!depths || distance < 1e-9) return true;
    const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
    const index = (angle * SHADOW_RAYS) / (Math.PI * 2);
    const left = Math.floor(index),
      right = (left + 1) % SHADOW_RAYS;
    return distance < Math.min(depths.at(left), depths.at(right)) + 1e-4;
  }
}

class LazyDepths {
  constructor(walls, light) {
    this.walls = walls;
    this.x = light.x;
    this.y = light.y;
    this.radius = light.radius;
    // Cast depths are never negative; Float32 storage matches depths().
    this.values = new Float32Array(SHADOW_RAYS).fill(-1);
  }

  at(index) {
    let depth = this.values[index];
    if (depth < 0) {
      this.values[index] = this.walls.ray(
        this.x,
        this.y,
        RAY_X[index],
        RAY_Y[index],
        this.radius,
      );
      depth = this.values[index];
    }
    return depth;
  }
}
