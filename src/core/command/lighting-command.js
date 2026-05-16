import { MapCommand } from "./map-command";

// One transaction for graphics and metadata, including a move across two tiles.
export class LightingCommand extends MapCommand {
  constructor(mapState, lighting, tiles = []) {
    super(mapState);
    this.before = mapState.lighting;
    this.after = lighting;
    this.tiles = tiles.map((tile) => ({
      ...tile,
      before: mapState.emf.getTile(tile.x, tile.y).gfx[1],
    }));
    this.affectsMap = tiles.length > 0;
  }

  apply(settings, undo) {
    this.mapState.lighting = settings;
    this.map.setLighting(settings);
    for (const tile of this.tiles)
      this.map.setGraphic(tile.x, tile.y, undo ? tile.before : tile.graphic, 1);
  }

  execute() {
    this.apply(this.after, false);
  }
  undo() {
    this.apply(this.before, true);
  }
}
