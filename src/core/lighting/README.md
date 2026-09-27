# eo-lighting

Lighting for Endless Online maps, shared by the
[eomap-js](https://github.com/tabbyed/eomap-js) editor and game clients such
as EOWeb. Plain JavaScript modules with TypeScript declarations; nothing here
depends on a renderer.

- **Catalogue** (`packs/eo-native/`): which native graphics are lamps,
  candles and flames, which walls block light, and the windows painted into
  wall art.
- **Light field** (`LightField`): each light's colour cached over the map at
  fixed height bands, with walls blocking it. Sampling is O(1); editing one
  light recomputes only what it reaches.
- **Appearance** (`glowOf`, `spriteTint`, `surfaceTints`): what each drawn
  graphic shows, as halos, glowing glass, window panes and flickering
  flames, and how its art is shaded.
- **File** (`readLightingFile`, `serializeLighting`): the companion
  `.lighting.json` saved beside a map.

## Install

It lives in the eomap-js repository, in `src/core/lighting`:

```sh
pnpm add "github:tabbyed/eomap-js#<commit>&path:/src/core/lighting"
```

## Use

```js
import { LightField, readLightingFile, spriteTint } from "eo-lighting";

// `map` is an EMF, or anything with width, height, tiles and getTile(x, y).
const { lighting } = readLightingFile(await response.text(), map);
const field = new LightField(map, lighting);
sprite.tint = spriteTint(
  field,
  map,
  { layer, x, y },
  frame.width,
  frame.height,
);
```

A map with no lighting file uses `defaultLighting()`: full daylight, with
the catalogue's lamps and windows lit at their defaults.
