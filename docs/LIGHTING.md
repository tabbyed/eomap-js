# Lighting

A one-page map of the lighting work: what it does, where it lives and how it's checked. The [README](../README.md#lighting) shows how to use it, [Some thoughts on lighting](some-thoughts-on-lighting.md) tells how it came about, and the [package README](../src/core/lighting/README.md) covers the API.

## What it does

- **Lights native fixtures on their own.** Street, tall and festive lamps, lanterns, garden lanterns, candlesticks and five other kinds of candle, a blue brazier, the fireplace, 30 window styles and the church's wall lantern. A fixture drawn from two graphics, like the fireplace, is one light described as parts.
- **Lights Forest Rift's web-only art too.** Frosthollow's log walls block light, their wall lanterns glow like the church's, and the inn's table candles burn with the taper flame. EOWeb draws these from its own `assets/gfx-extra`, on IDs the native files leave free, so the editor can't show them, but a map using them lights the same in both.
- **Keeps light out of rooms.** Walls are edges between tiles, and each light ray-casts against the solid ones. Only curated building walls block; fences and decorations don't.
- **Shades walls as surfaces.** A solid wall is lit in 16 px strips on a grid shared by every wall, sampled at each strip's real height, so neighbouring pieces meet without seams. Indoor walls are solid too, so a shelf candle lights its wall smoothly.
- **Animates flames.** Candles, the brazier and the fireplace swap their still flames for moving ones built from the game's own art, all on one flicker clock with uneven 120–190 ms steps.
- **Never touches the EMF.** Settings live in a companion `.lighting.json` (version 1). It records the map's fingerprint, so lighting loaded onto a changed map keeps every light that still matches.

## Where it lives

| Path                                          | What                                                              |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `src/core/lighting/`                          | **eo-lighting**, the renderer-free core, shared with game clients |
| `src/core/lighting/packs/eo-native/`          | The catalogue: lamps, flames, blocking walls and windows          |
| `src/core/lighting/field/`                    | The cached light field, wall grid and per-vertex tints            |
| `src/core/lighting/appearance/`               | Halos, glowing glass and flame frames: what each graphic shows    |
| `src/core/lighting/file/`                     | Reading and writing `.lighting.json`                              |
| `src/core/gameobjects/lighting-renderer.js`   | How the editor draws it with Phaser                               |
| `src/core/components/lighting-panel.js`       | The Lighting panel                                                |
| `src/core/controllers/lighting-controller.js` | The panel's actions: edits, load and save, all undoable           |

## Drawing it in another renderer

[EOWeb](https://github.com/tabbyed/eoweb) installs `src/core/lighting` as a package and draws the same numbers with Pixi. The light field is renderer-free, but a renderer must lay out `surfaceTints` exactly as the editor does, or the two will blend light differently:

- A solid wall's `rows` run top to bottom, and `tints` holds each row's left tint, then its right.
- A ground tile's four tints are its top-left, top-right, bottom-left and bottom-right corners.
- Each band between two rows is two triangles split from top-left to bottom-right.

## Checking it

```sh
npm run test:lighting        # lighting, catalogue, file and package tests
npm run benchmark:lighting   # CPU benchmarks of the lighting core
node scripts/audit-window-assets.cjs --gfx /path/to/gfx --maps /path/to/maps
```

The audit reads the native gfx006. Web-only windows have no bitmap there, so their entries in `docs/window-assets.json`, marked `webOnly`, are measured from EOWeb's PNGs with the same mask and carried over as they are.

Sampling the field costs the same however many lights a map has, and changing one light recomputes only what it reaches. Roof surfaces, finite-height blockers and custom graphics still need geometry metadata before they can be lit correctly.
