import { arrayEquals, binaryInsert, removeFirst } from "../util/array-utils";
import { TileSpec } from "../data/emf";
import { GridType } from "../gfx/texture-cache";
import { LightField } from "../lighting/light-field.js";
import { lampAt, lampPreset } from "../lighting/lamps.js";
import { projectLight } from "../lighting/light-geometry.js";
import { emissionAppearance } from "../lighting/lamp-emission.js";
import { LampTextures } from "../lighting/lamp-textures.js";
import { windowGlassAt } from "../lighting/windows.js";
import { windowAppearance } from "../lighting/window-emission.js";
import { pixelHit } from "../gfx/pixel-hit-mask.js";
import { SOLID_WALL_GRAPHICS } from "../lighting/walls.js";
import {
  wallSurfaceVertex,
  wallSurfaceSlices,
} from "../lighting/wall-surface.js";

const SECTION_SIZE = 256;
const NO_GLASS = Object.freeze([]);

const TDG = 0.00000001; // gap between depth of each tile on a layer
const RDG = 0.001; // gap between depth of each row of tiles

// prettier-ignore
const layerInfo = [
    { xoff: 0,  yoff: 0,  alpha: 1.00, centered: false, bottomOrigin: false, depth:-3.0 + TDG * 1 }, // Ground
    { xoff:-2,  yoff:-2,  alpha: 1.00, centered: true,  bottomOrigin: true,  depth: 0.0 + TDG * 2 }, // Objects
    { xoff:-2,  yoff:-2,  alpha: 1.00, centered: true,  bottomOrigin: true,  depth: 0.0 + TDG * 3 }, // Overlay
    { xoff: 0,  yoff:-1,  alpha: 1.00, centered: false, bottomOrigin: true,  depth: 0.0 + TDG * 4 }, // Down Wall
    { xoff: 32, yoff:-1,  alpha: 1.00, centered: false, bottomOrigin: true,  depth:-RDG + TDG * 5 }, // Right Wall
    { xoff: 0,  yoff:-64, alpha: 1.00, centered: false, bottomOrigin: true,  depth: 0.0 + TDG * 6 }, // Roof
    { xoff: 0,  yoff:-32, alpha: 1.00, centered: false, bottomOrigin: false, depth: 0.0 + TDG * 1 }, // Top
    { xoff:-24, yoff:-12, alpha: 0.20, centered: false, bottomOrigin: false, depth:-1.0 + TDG * 1 }, // Shadow
    { xoff:-2,  yoff:-2,  alpha: 1.00, centered: true,  bottomOrigin: true,  depth: 1.0 + TDG * 1 }, // Overlay 2
    { xoff: 0,  yoff: 0,  alpha: 0.25, centered: false, bottomOrigin: false, depth:-2.0 + TDG * 1 }, // TileSpec
    { xoff: 0,  yoff: 0,  alpha: 0.25, centered: false, bottomOrigin: false, depth: 3.0 + TDG * 1 }, // TileSpec overlay
    { xoff:-1,  yoff: 0,  alpha: 0.50, centered: false, bottomOrigin: true,  depth: 4.0 + TDG * 1 }, // Warp
    { xoff:-1,  yoff: 0,  alpha: 0.50, centered: false, bottomOrigin: true,  depth: 4.0 + TDG * 2 }, // Sign
    { xoff:-1,  yoff: 0,  alpha: 0.50, centered: false, bottomOrigin: true,  depth: 4.0 + TDG * 3 }, // Item
    { xoff:-1,  yoff: 0,  alpha: 0.50, centered: false, bottomOrigin: true,  depth: 4.0 + TDG * 4 }, // NPC
    { xoff: 0,  yoff: 0,  alpha: 1.00, centered: false, bottomOrigin: false, depth: 5.0 + TDG * 1 }, // Grid
];

const layerFiles = [3, 4, 5, 6, 6, 7, 3, 22, 5];

const depthComparator = (a, b) => a.depth - b.depth;

class TileGraphic {
  constructor(cacheEntry, x, y, layer, depth, alpha) {
    this.cacheEntry = cacheEntry;
    this.x = x;
    this.y = y;
    this.layer = layer;
    this.depth = depth;
    this.alpha = alpha;
    this.pendingEntry = null;
  }

  get width() {
    return this.cacheEntry.asset.width;
  }

  get height() {
    return this.cacheEntry.asset.height;
  }
}

class EntityMap {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.sparseArray = {};
  }

  get(x, y) {
    let index = this.getIndex(x, y);
    let entities = this.sparseArray[index];
    if (entities === undefined) {
      entities = [];
    }
    return entities;
  }

  set(x, y, entities) {
    let index = this.getIndex(x, y);
    this.sparseArray[index] = entities;
    if (entities.length === 0) {
      delete this.sparseArray[index];
    }
  }

  add(entity) {
    let index = this.getIndex(entity.x, entity.y);
    if (this.sparseArray[index] === undefined) {
      this.sparseArray[index] = [];
    }
    this.sparseArray[index].push(entity);
  }

  getIndex(x, y) {
    return y * this.width + x;
  }
}

class CachedFrame {
  constructor(renderTexture) {
    this.renderTexture = renderTexture;
    this.dirty = true;
  }

  destroy() {
    this.renderTexture.destroy();
    this.renderTexture = null;
  }
}

export class EOMap extends Phaser.GameObjects.GameObject {
  constructor(scene, textureCache, emf, layerVisibility) {
    super(scene, "EOMap");

    this.textureCache = textureCache;
    this.lampTextures = new LampTextures(scene, textureCache.gfxLoader, () =>
      this.invalidateCachedFrame(),
    );
    this.emf = emf;
    this.layerVisibility = layerVisibility;

    this.x = 0;
    this.y = 0;
    this.drawScale = 1.0;

    this.camera = new Phaser.Cameras.Scene2D.Camera().setScene(scene);
    this.selectedLayer = 0;
    this.sections = null;
    this.sectionWidth = null;
    this.sectionHeight = null;
    this.visibleSections = null;
    this.items = null;
    this.npcs = null;
    this.tileGraphics = null;
    this.renderList = null;
    this.cachedFrame = null;
    this.animationFrame = 0;

    this.renderListChangesSinceLastTick = 0;
    this.dirtyRenderList = false;

    this._tempMatrix1 = new Phaser.GameObjects.Components.TransformMatrix();
    this._tempMatrix2 = new Phaser.GameObjects.Components.TransformMatrix();

    this.init();
    this.initPipeline();
  }

  init() {
    for (let i in this.tileGraphics) {
      this.releaseTileGraphic(this.tileGraphics[i]);
    }

    this.sections = [];
    this.sectionWidth = Math.ceil((this.emf.width * 64) / SECTION_SIZE);
    this.sectionHeight = Math.ceil((this.emf.height * 32) / SECTION_SIZE);
    this.visibleSections = [];
    this.items = new EntityMap(this.emf.width, this.emf.height);
    this.npcs = new EntityMap(this.emf.width, this.emf.height);
    this.tileGraphics = {};
    this.renderList = [];

    // Resize rebuilds the field once below, not once for every restored tile.
    this.lightField = null;

    this.initSections();
    this.initEntityMaps();
    this.initTileGraphics();

    if (this.lightingSettings)
      this.lightField = new LightField(this.emf, this.lightingSettings);

    this.cull();
  }

  initSections() {
    let sectionCount = this.sectionWidth * this.sectionHeight;
    for (let i = 0; i < sectionCount; ++i) {
      this.sections.push(new Set());
    }
  }

  initEntityMaps() {
    for (let item of this.emf.items) {
      this.items.add(item);
    }

    for (let npc of this.emf.npcs) {
      this.npcs.add(npc);
    }
  }

  initTileGraphics() {
    for (let y = 0; y < this.emf.height; ++y) {
      for (let x = 0; x < this.emf.width; ++x) {
        let tile = this.emf.getTile(x, y);
        for (let layer = 0; layer < 9; ++layer) {
          let gfx = tile.gfx[layer];
          this.setGraphic(x, y, gfx, layer);
        }
        this.setSpec(x, y, tile.spec);
        this.setWarp(x, y, tile.warp);
        this.setSign(x, y, tile.sign);
        this.setItems(x, y, this.items.get(x, y));
        this.setNPCs(x, y, this.npcs.get(x, y));
        this.setGrid(x, y);
      }
    }
  }

  rebuildRenderList() {
    let visibleGraphicIndices = new Set();
    for (let section of this.visibleSections) {
      for (let graphicIndex of section) {
        let layer = this.tileGraphics[graphicIndex].layer;
        if (this.layerVisibility.isLayerVisible(layer)) {
          visibleGraphicIndices.add(graphicIndex);
        }
      }
    }

    this.renderList = Array.from(visibleGraphicIndices, (index) => {
      let tileGraphic = this.tileGraphics[index];
      tileGraphic.alpha = this.calcAlpha(tileGraphic.layer);
      return tileGraphic;
    });

    this.renderList.sort(depthComparator);

    this.dirtyRenderList = false;
  }

  calcDepth(x, y, layer) {
    return layerInfo[layer].depth + y * RDG + x * layerInfo.length * TDG;
  }

  calcAlpha(layer) {
    let alpha = layerInfo[layer].alpha;
    if (layer === 9 && this.selectedLayer === 9) {
      alpha *= 3;
    }
    return alpha;
  }

  getSection(x, y) {
    return this.sections[y * this.sectionWidth + x];
  }

  findSections(tileGraphic) {
    let halfWidth = this.emf.width * 32;
    let x = tileGraphic.x + halfWidth;
    let y = tileGraphic.y;

    let width = tileGraphic.width;
    let height = tileGraphic.height;
    if (
      tileGraphic.layer === 1 &&
      lampPreset(tileGraphic.cacheEntry.resourceID - 100)
    ) {
      x -= 32;
      y -= 32;
      width += 64;
      height += 64;
    }

    let top = Math.trunc(y / SECTION_SIZE);
    let bottom = Math.trunc((y + height) / SECTION_SIZE);
    let left = Math.trunc(x / SECTION_SIZE);
    let right = Math.trunc((x + width) / SECTION_SIZE);

    top = Math.min(this.sectionHeight - 1, top);
    bottom = Math.min(this.sectionHeight - 1, bottom);
    left = Math.min(this.sectionWidth - 1, left);
    right = Math.min(this.sectionWidth - 1, right);

    top = Math.max(0, top);
    bottom = Math.max(0, bottom);
    left = Math.max(0, left);
    right = Math.max(0, right);

    let result = [];

    for (let sectionY = top; sectionY <= bottom; ++sectionY) {
      for (let sectionX = left; sectionX <= right; ++sectionX) {
        let section = this.getSection(sectionX, sectionY);
        result.push(section);
      }
    }

    return result;
  }

  draw(x, y, drawID, layer) {
    if (layer >= 0 && layer <= 8) {
      this.setGraphic(x, y, drawID, layer);
      return;
    }

    if (layer === 9) {
      this.setSpec(x, y, drawID);
      return;
    }

    throw new Error(`Invalid draw layer: ${layer}`);
  }

  getDrawID(x, y, layer) {
    if (layer >= 0 && layer <= 8) {
      return this.emf.getTile(x, y).gfx[layer];
    }

    if (layer === 9) {
      return this.emf.getTile(x, y).spec;
    }

    throw new Error(`Invalid draw layer: ${layer}`);
  }

  setGraphic(x, y, gfx, layer) {
    if (gfx === 0 && layer !== 0) {
      return;
    }

    this.emf.getTile(x, y).gfx[layer] = gfx;
    if (layer === 1 && this.lightField) this.lightField.updateTile(x, y);
    if ((layer === 3 || layer === 4) && this.lightField)
      this.lightField.queueWall(x, y);

    let cacheEntry = null;
    if (gfx) {
      let fileID = layerFiles[layer];
      let resourceID = gfx + 100;

      cacheEntry = this.textureCache.getResource(
        fileID,
        resourceID,
        layer !== 0 && layer !== 7,
      );
      if (!cacheEntry) {
        console.warn("Could not load gfx %d/%d.", gfx, fileID);
        return;
      }
    }

    this.setTileGraphic(x, y, layer, cacheEntry);
  }

  setSpec(x, y, tileSpec) {
    let tile = this.emf.getTile(x, y);
    let oldTileSpec = tile.spec;

    tile.spec = tileSpec;

    if (oldTileSpec === TileSpec.Chest || tile.spec === TileSpec.Chest) {
      this.updateItemGraphic(x, y);
    }

    let cacheEntry = null;

    if (tileSpec !== null) {
      cacheEntry = this.textureCache.getSpec(tileSpec);
      if (!cacheEntry) {
        console.warn("Could not load tileSpec %d.", tileSpec);
        return;
      }
    }

    this.setTileGraphic(x, y, 9, cacheEntry);
    this.setTileGraphic(x, y, 10, cacheEntry);
  }

  getWarp(x, y) {
    return this.emf.getTile(x, y).warp;
  }

  setWarp(x, y, warp) {
    let tile = this.emf.getTile(x, y);
    tile.warp = warp;

    let cacheEntry = null;

    if (warp) {
      let entityType;
      switch (warp.door) {
        case 0:
          entityType = "warp";
          break;
        case 1:
          entityType = "door";
          break;
        default:
          entityType = "lockeddoor";
      }
      cacheEntry = this.textureCache.getEntity(entityType);
    }

    this.setTileGraphic(x, y, 11, cacheEntry);
  }

  getSign(x, y) {
    return this.emf.getTile(x, y).sign;
  }

  setSign(x, y, sign) {
    let tile = this.emf.getTile(x, y);
    tile.sign = sign;

    let cacheEntry = null;

    if (sign) {
      cacheEntry = this.textureCache.getEntity("sign");
    }

    this.setTileGraphic(x, y, 12, cacheEntry);
  }

  getItems(x, y) {
    return [...this.items.get(x, y)];
  }

  updateItemGraphic(x, y) {
    let items = this.items.get(x, y);
    let cacheEntry = null;

    if (items.length > 0) {
      let entityKey = "items";
      if (this.emf.getTile(x, y).spec === TileSpec.Chest) {
        entityKey = "chest";
      }
      cacheEntry = this.textureCache.getEntity(entityKey);
    }

    this.setTileGraphic(x, y, 13, cacheEntry);
  }

  setItems(x, y, items) {
    let oldItems = this.items.get(x, y);
    this.items.set(x, y, items);
    this.emf.items = this.emf.items.filter((item) => !oldItems.includes(item));
    this.emf.items = this.emf.items.concat(items);
    this.updateItemGraphic(x, y);
  }

  getNPCs(x, y) {
    return [...this.npcs.get(x, y)];
  }

  setNPCs(x, y, npcs) {
    let oldNPCs = this.npcs.get(x, y);
    this.npcs.set(x, y, npcs);
    this.emf.npcs = this.emf.npcs.filter((npc) => !oldNPCs.includes(npc));
    this.emf.npcs = this.emf.npcs.concat(npcs);

    let cacheEntry = null;

    if (npcs.length > 0) {
      cacheEntry = this.textureCache.getEntity("npc");
    }

    this.setTileGraphic(x, y, 14, cacheEntry);
  }

  setGrid(x, y) {
    let isMaxX = x === this.emf.width - 1;
    let isMaxY = y === this.emf.height - 1;

    let gridType = GridType.Normal;
    if (isMaxX && isMaxY) {
      gridType = GridType.All;
    } else if (isMaxX) {
      gridType = GridType.Right;
    } else if (isMaxY) {
      gridType = GridType.Down;
    }

    this.setTileGraphic(x, y, 15, this.textureCache.getGridTile(gridType));
  }

  getTileGraphicIndex(x, y, layer) {
    return (y * this.emf.width + x) * layerInfo.length + layer;
  }

  releaseTileGraphic(graphic) {
    if (graphic.pendingEntry && graphic.pendingEntry !== graphic.cacheEntry)
      graphic.pendingEntry.decRef();
    graphic.cacheEntry.decRef();
    graphic.pendingEntry = null;
  }

  setTileGraphic(x, y, layer, cacheEntry) {
    let graphicIndex = this.getTileGraphicIndex(x, y, layer);
    let oldGraphic = this.tileGraphics[graphicIndex];

    if (!cacheEntry) {
      if (oldGraphic) {
        for (let section of this.findSections(oldGraphic)) {
          section.delete(graphicIndex);
        }

        delete this.tileGraphics[graphicIndex];

        if (!this.dirtyRenderList) {
          removeFirst(this.renderList, oldGraphic);
          if (++this.renderListChangesSinceLastTick > 100) {
            this.dirtyRenderList = true;
          }
        }

        this.releaseTileGraphic(oldGraphic);
        this.checkEntityOffsets(x, y, layer);
        this.invalidateCachedFrame();
      }
      return;
    }

    if (
      oldGraphic?.pendingEntry === cacheEntry ||
      (oldGraphic?.cacheEntry === cacheEntry && !oldGraphic.pendingEntry)
    )
      return;

    // Keep one visible graphic while its replacement decodes. Each graphic
    // owns its displayed entry and at most one distinct pending entry; copying
    // placeholders used to release the displayed entry twice on rapid edits.
    if (
      oldGraphic?.pendingEntry &&
      oldGraphic.pendingEntry !== oldGraphic.cacheEntry
    )
      oldGraphic.pendingEntry.decRef();
    if (!oldGraphic || oldGraphic.cacheEntry !== cacheEntry)
      cacheEntry.incRef();
    const tileGraphic =
      oldGraphic ||
      new TileGraphic(
        cacheEntry,
        0,
        0,
        layer,
        this.calcDepth(x, y, layer),
        0.0,
      );

    // Render-list rebuilds can see this placeholder before the asset loads.
    // Keep its ownership available for lighting and surface sampling.
    tileGraphic.tileX = x;
    tileGraphic.tileY = y;
    tileGraphic.pendingEntry = cacheEntry;
    this.tileGraphics[graphicIndex] = tileGraphic;

    const applyLoaded = () => {
      if (
        this.tileGraphics?.[graphicIndex] === tileGraphic &&
        tileGraphic.pendingEntry === cacheEntry
      ) {
        for (let section of this.findSections(tileGraphic)) {
          section.delete(graphicIndex);
        }
        if (tileGraphic.cacheEntry !== cacheEntry)
          tileGraphic.cacheEntry.decRef();
        tileGraphic.cacheEntry = cacheEntry;
        tileGraphic.pendingEntry = null;
        tileGraphic.alpha = this.calcAlpha(layer);
        this.updateTileGraphicPosition(x, y, layer, tileGraphic);
        this.addTileGraphic(x, y, layer, tileGraphic);
      }
    };
    if (cacheEntry.loadingComplete)
      cacheEntry.loadingComplete.then(applyLoaded);
    else applyLoaded();
  }

  addTileGraphic(x, y, layer, tileGraphic) {
    let graphicIndex = this.getTileGraphicIndex(x, y, layer);

    for (let section of this.findSections(tileGraphic)) {
      section.add(graphicIndex);
    }

    this.tileGraphics[graphicIndex] = tileGraphic;

    if (!this.dirtyRenderList && this.layerVisibility.isLayerVisible(layer)) {
      binaryInsert(this.renderList, tileGraphic, depthComparator);
      if (++this.renderListChangesSinceLastTick > 100) {
        this.dirtyRenderList = true;
      }
    }

    this.checkEntityOffsets(x, y, layer);
    this.invalidateCachedFrame();
  }

  updateTileGraphicPosition(x, y, layer, tileGraphic) {
    tileGraphic.tileX = x;
    tileGraphic.tileY = y;
    let info = layerInfo[layer];
    tileGraphic.x = info.xoff + x * 32 - y * 32;
    tileGraphic.y = info.yoff + x * 16 + y * 16;

    if (info.centered) {
      tileGraphic.x -= Math.floor(tileGraphic.cacheEntry.asset.width / 2) - 32;
    }

    if (info.bottomOrigin) {
      tileGraphic.y -= tileGraphic.cacheEntry.asset.height - 32;
    }
  }

  checkEntityOffsets(x, y, layer) {
    switch (layer) {
      case 1:
      case 11:
      case 12:
      case 13:
      case 14:
        this.updateEntityOffsets(x, y);
    }
  }

  updateEntityOffsets(x, y) {
    let offset = -10;

    let object = this.tileGraphics[this.getTileGraphicIndex(x, y, 1)];
    if (object) {
      offset = Math.min(offset, 10 - object.height);
    }

    for (let layer = 11; layer <= 14; ++layer) {
      let graphicIndex = this.getTileGraphicIndex(x, y, layer);
      let entityGraphic = this.tileGraphics[graphicIndex];
      if (entityGraphic) {
        for (let section of this.findSections(entityGraphic)) {
          section.delete(graphicIndex);
        }

        entityGraphic.y = x * 16 + y * 16 + offset;
        offset -= 28;

        for (let section of this.findSections(entityGraphic)) {
          section.add(graphicIndex);
        }
      }
    }
  }

  cull() {
    let halfWidth = this.emf.width * 32;
    let fullHeight = this.emf.height * 32;

    let midX = this.scrollX + this.width / 2;
    let midY = this.scrollY + this.height / 2;
    let displayWidth = this.camera.displayWidth;
    let displayHeight = this.camera.displayHeight;
    let cullTop = midY - displayHeight / 2;
    let cullBottom = cullTop + displayHeight;
    let cullLeft = midX - displayWidth / 2;
    let cullRight = cullLeft + displayWidth;

    if (cullBottom < 0) {
      cullTop = -displayHeight;
      cullBottom = 0;
    } else if (cullTop > fullHeight) {
      cullTop = fullHeight;
      cullBottom = cullTop + displayHeight;
    }

    if (cullRight < -halfWidth) {
      cullRight = -halfWidth;
      cullLeft = cullRight - displayWidth;
    } else if (cullLeft > halfWidth) {
      cullLeft = halfWidth;
      cullRight = cullLeft + displayHeight;
    }

    cullTop = Math.max(0, cullTop);
    cullBottom = Math.min(fullHeight, cullBottom);
    cullLeft = Math.max(-halfWidth, cullLeft);
    cullRight = Math.min(halfWidth, cullRight);

    let oldVisibleSections = this.visibleSections;
    this.visibleSections = [];

    for (let y = 0; y < this.sectionHeight; ++y) {
      let top = y * SECTION_SIZE;
      let bottom = top + SECTION_SIZE;
      for (let x = 0; x < this.sectionWidth; ++x) {
        let left = -halfWidth + x * SECTION_SIZE;
        let right = left + SECTION_SIZE;

        let isVisible =
          right >= cullLeft &&
          left <= cullRight &&
          bottom >= cullTop &&
          top <= cullBottom;

        if (isVisible) {
          this.visibleSections.push(this.getSection(x, y));
        }
      }
    }

    if (!arrayEquals(oldVisibleSections, this.visibleSections)) {
      this.dirtyRenderList = true;
    }
  }

  updateDrawScale() {
    this.drawScale = 0.5;
    while (this.drawScale < this.zoom) {
      this.drawScale *= 2;
    }
  }

  setLayerVisibility(layerVisibility) {
    this.layerVisibility = layerVisibility;
    this.dirtyRenderList = true;
  }

  setSelectedLayer(selectedLayer) {
    this.selectedLayer = selectedLayer;
    this.dirtyRenderList = true;
  }

  getFrame() {
    if (!this.cachedFrame) {
      let renderTexture = new Phaser.GameObjects.RenderTexture(this.scene);
      renderTexture.camera.roundPixels = true;
      this.cachedFrame = new CachedFrame(renderTexture);
    }

    if (this.cachedFrame.dirty) {
      this.drawFrame();
    }

    this.cachedFrame.renderTexture
      .setPosition(this.x, this.y)
      .setDisplaySize(this.width, this.height);

    return this.cachedFrame;
  }

  // `setLighting` takes committed settings and drops any preview, so a
  // commit or undo can never leave an inspector preview on screen.
  setLighting(settings) {
    this.committedLighting = settings;
    this.showLighting(settings);
  }

  // Show settings that are not committed, such as a slider being dragged.
  previewLighting(settings) {
    this.showLighting(settings);
  }

  clearLightingPreview() {
    if (this.committedLighting) this.showLighting(this.committedLighting);
  }

  showLighting(settings) {
    if (this.lightField && this.lightingSettings === settings) return;
    this.lightingSettings = settings;
    if (this.lightField) this.lightField.setSettings(settings);
    else this.lightField = new LightField(this.emf, settings);
    this.invalidateCachedFrame();
  }

  setLightingPreview(enabled) {
    if (this.lightingPreview === enabled) return;
    this.lightingPreview = enabled;
    this.invalidateCachedFrame();
  }

  // Glass shown by a loaded wall graphic, with the light each part belongs
  // to. A replacement still decoding shows the previous artwork, so no glass.
  windowGlass(graphic) {
    const entry = graphic.cacheEntry;
    if ((graphic.layer !== 3 && graphic.layer !== 4) || entry.loadingComplete)
      return NO_GLASS;
    const glass = windowGlassAt(
      this.emf,
      this.lightingSettings,
      graphic.tileX,
      graphic.tileY,
      graphic.layer,
    );
    return glass.length
      ? glass.filter(({ spec }) => entry.resourceID === spec.graphic + 100)
      : NO_GLASS;
  }

  pickWindow(screenX, screenY) {
    const dirty = this.camera.dirty;
    this.camera.preRender();
    this.camera.dirty = dirty;
    const point = this.camera.getWorldPoint(screenX, screenY);
    // Depth order and native alpha prevent selecting glass hidden behind
    // a foreground wall or prop. O(visible graphics), only on a click.
    for (let i = this.renderList.length - 1; i >= 0; i--) {
      const graphic = this.renderList[i];
      if (
        graphic.layer === 0 ||
        graphic.layer === 7 ||
        graphic.layer >= 9 ||
        graphic.alpha < 0.5
      )
        continue;
      const entry = graphic.cacheEntry;
      if (entry.loadingComplete) continue;
      const frame = entry.asset.getFrame(this.animationFrame);
      const x = Math.floor(point.x - graphic.x),
        y = Math.floor(point.y - graphic.y);
      if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;
      // A partner sprite's glass selects the window that owns it.
      for (const { light, spec } of this.windowGlass(graphic))
        if (pixelHit(this.lampTextures.getWindow(spec)?.hitMask, x, y))
          return light;
      const base = entry.asset.textureFrame;
      // An already-loaded floor asset can acquire a hit mask when first used
      // on the Top layer. Until that decode finishes, avoid picking through it.
      if (!entry.hitMask) return null;
      if (
        pixelHit(
          entry.hitMask,
          x + frame.cutX - base.cutX,
          y + frame.cutY - base.cutY,
        )
      )
        return null;
    }
    return null;
  }

  drawFrame() {
    this.cachedFrame.dirty = false;

    let drawSizeRatio = this.drawScale / this.zoom;
    let drawWidth = this.width * drawSizeRatio;
    let drawHeight = this.height * drawSizeRatio;

    let renderTexture = this.cachedFrame.renderTexture
      .setSize(drawWidth, drawHeight)
      .clear();

    renderTexture.texture.setFilter(Phaser.Textures.LINEAR);

    let cameraDirty = this.camera.dirty;
    this.camera.preRender();
    this.camera.dirty = cameraDirty;

    renderTexture.camera.zoom = this.drawScale;
    renderTexture.camera.scrollX = this.scrollX;
    renderTexture.camera.scrollY = this.scrollY;
    renderTexture.beginDraw();

    let worldPoint = this.camera.getWorldPoint(0, 0);
    let drawWorldPoint = renderTexture.camera.getWorldPoint(0, 0);
    let drawOffsetX = worldPoint.x - drawWorldPoint.x;
    let drawOffsetY = worldPoint.y - drawWorldPoint.y;

    for (let tileGraphic of this.renderList) {
      let asset = tileGraphic.cacheEntry.asset;
      let frame = asset.getFrame(this.animationFrame);
      const lamp =
        this.lightingPreview &&
        renderTexture.renderTarget &&
        tileGraphic.layer === 1
          ? lampAt(
              this.emf,
              this.lightingSettings,
              tileGraphic.tileX,
              tileGraphic.tileY,
            )
          : null;
      const appearance = lamp && emissionAppearance(lamp);
      const emission =
        appearance?.enabled &&
        lamp.key !== this.displacedLampKey &&
        tileGraphic.cacheEntry.resourceID === lamp.graphic + 100 &&
        !tileGraphic.cacheEntry.loadingComplete
          ? this.lampTextures.get(lamp.graphic)
          : null;
      // Prepare masks even with the preview off so unlit panes remain pickable.
      const glass = this.windowGlass(tileGraphic);
      for (const item of glass)
        item.texture = this.lampTextures.getWindow(item.spec);
      if (emission) {
        const source = projectLight(lamp);
        const renderer = renderTexture.renderer;
        const previousBlend = renderer.currentBlendMode;
        renderer.setBlendMode(Phaser.BlendModes.ADD);
        try {
          this.batchDrawFrame(
            renderTexture,
            emission.halo,
            source.x - emission.halo.width / 2 - drawOffsetX,
            source.sourceY - emission.halo.height / 2 - drawOffsetY,
            appearance.haloAlpha * tileGraphic.alpha,
            null,
            appearance.haloColor,
          );
        } finally {
          renderer.setBlendMode(previousBlend);
        }
      }

      this.batchDrawFrame(
        renderTexture,
        frame,
        tileGraphic.x - drawOffsetX,
        tileGraphic.y - drawOffsetY,
        tileGraphic.alpha,
        tileGraphic,
      );
      if (emission) {
        this.batchDrawFrame(
          renderTexture,
          emission.mask,
          tileGraphic.x - drawOffsetX,
          tileGraphic.y - drawOffsetY,
          appearance.coreAlpha * tileGraphic.alpha,
          null,
          appearance.coreColor,
        );
      }
      if (!this.lightingPreview || !renderTexture.renderTarget) continue;
      for (const { light, texture } of glass) {
        const glow = windowAppearance(light);
        if (!texture || !glow.enabled) continue;
        this.batchDrawFrame(
          renderTexture,
          texture.mask,
          tileGraphic.x - drawOffsetX,
          tileGraphic.y - drawOffsetY,
          glow.alpha * tileGraphic.alpha,
          null,
          glow.color,
        );
      }
    }

    renderTexture.endDraw();
  }

  batchDrawFrame(
    renderTexture,
    textureFrame,
    x,
    y,
    alpha,
    tileGraphic,
    emissionTint = null,
  ) {
    x += renderTexture.frame.cutX;
    y += renderTexture.frame.cutY;

    let matrix = this._tempMatrix1;
    matrix.copyFrom(renderTexture.camera.matrix);

    let spriteMatrix = this._tempMatrix2;
    spriteMatrix.applyITRS(x, y, 0, 1, 1);
    spriteMatrix.e -= renderTexture.camera.scrollX;
    spriteMatrix.f -= renderTexture.camera.scrollY;

    matrix.multiply(spriteMatrix);

    if (renderTexture.camera.roundPixels) {
      matrix.e = Math.round(matrix.e);
      matrix.f = Math.round(matrix.f);
    }

    if (renderTexture.renderTarget) {
      if (
        emissionTint === null &&
        this.lightingPreview &&
        this.lightField &&
        tileGraphic.layer < 9
      ) {
        this.batchLitFrame(
          renderTexture,
          textureFrame,
          matrix,
          alpha,
          tileGraphic,
        );
        return;
      }
      let tint =
        emissionTint ??
        (renderTexture.globalTint >> 16) +
          (renderTexture.globalTint & 0xff00) +
          ((renderTexture.globalTint & 0xff) << 16);
      renderTexture.pipeline.batchTextureFrame(
        textureFrame,
        0,
        0,
        tint,
        alpha,
        matrix,
        null,
      );
    } else {
      this.batchTextureFrameCanvas(renderTexture, textureFrame, matrix, alpha);
    }
  }

  batchLitFrame(renderTexture, frame, matrix, alpha, graphic) {
    const pipeline = renderTexture.pipeline;
    pipeline.manager.set(pipeline);
    const unit = pipeline.renderer.setTextureSource(frame.source);
    const pack = (rgb) => {
      // MultiPipeline's fragment shader already swizzles the vertex tint.
      return Phaser.Renderer.WebGL.Utils.getTintAppendFloatAlpha(rgb, alpha);
    };
    const x = graphic.tileX,
      y = graphic.tileY;
    const tint = (x, y, height = 0) => pack(this.lightField.tint(x, y, height));
    const solidWall =
      (graphic.layer === 3 || graphic.layer === 4) &&
      SOLID_WALL_GRAPHICS.has(this.emf.getTile(x, y).gfx[graphic.layer]);
    if (solidWall) {
      // Neighbouring graphics share surface coordinates AND interpolation rows.
      // Sampling one tile centre across each whole bitmap creates visible seams.
      const surfaceTint = (px, py) => {
        const p = wallSurfaceVertex(graphic.layer, x, y, frame.height, px, py);
        return tint(p.sampleX, p.sampleY, Math.max(0, p.height));
      };
      const rows = wallSurfaceSlices(x, y, frame.height);
      // Adjacent slices share a row, so sample each row's edge tints once.
      let topLeft = surfaceTint(0, rows[0]),
        topRight = surfaceTint(frame.width, rows[0]);
      for (let i = 0; i < rows.length - 1; i++) {
        const top = rows[i],
          bottom = rows[i + 1];
        const bottomLeft = surfaceTint(0, bottom),
          bottomRight = surfaceTint(frame.width, bottom);
        pipeline.batchQuad(
          null,
          matrix.getX(0, top),
          matrix.getY(0, top),
          matrix.getX(0, bottom),
          matrix.getY(0, bottom),
          matrix.getX(frame.width, bottom),
          matrix.getY(frame.width, bottom),
          matrix.getX(frame.width, top),
          matrix.getY(frame.width, top),
          frame.u0,
          frame.v0 + ((frame.v1 - frame.v0) * top) / frame.height,
          frame.u1,
          frame.v0 + ((frame.v1 - frame.v0) * bottom) / frame.height,
          topLeft,
          topRight,
          bottomLeft,
          bottomRight,
          0,
          frame.source.glTexture,
          unit,
        );
        topLeft = bottomLeft;
        topRight = bottomRight;
      }
      return;
    }
    let tl, tr, bl, br;
    if (graphic.layer === 0) {
      tl = pack(this.lightField.groundCornerTint(x, y, -1, 0));
      tr = pack(this.lightField.groundCornerTint(x, y, 0, -1));
      bl = pack(this.lightField.groundCornerTint(x, y, 0, 1));
      br = pack(this.lightField.groundCornerTint(x, y, 1, 0));
    } else tl = tr = bl = br = tint(x, y);
    pipeline.batchQuad(
      null,
      matrix.getX(0, 0),
      matrix.getY(0, 0),
      matrix.getX(0, frame.height),
      matrix.getY(0, frame.height),
      matrix.getX(frame.width, frame.height),
      matrix.getY(frame.width, frame.height),
      matrix.getX(frame.width, 0),
      matrix.getY(frame.width, 0),
      frame.u0,
      frame.v0,
      frame.u1,
      frame.v1,
      tl,
      tr,
      bl,
      br,
      0,
      frame.source.glTexture,
      unit,
    );
  }

  batchTextureFrameCanvas(renderTexture, frame, matrix, alpha) {
    let renderer = renderTexture.renderer;
    let ctx = renderer.currentContext;

    let cd = frame.canvasData;
    let frameX = cd.x;
    let frameY = cd.y;
    let frameWidth = frame.cutWidth;
    let frameHeight = frame.cutHeight;

    if (frameWidth > 0 && frameHeight > 0) {
      ctx.save();

      matrix.setToContext(ctx);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = !(
        !renderer.antialias || frame.source.scaleMode
      );

      ctx.drawImage(
        frame.source.image,
        frameX,
        frameY,
        frameWidth,
        frameHeight,
        0,
        0,
        frameWidth,
        frameHeight,
      );

      ctx.restore();
    }
  }

  renderWebGL(renderer, _src, camera) {
    if (this.width > 0 && this.height > 0) {
      let renderTexture = this.getFrame().renderTexture;
      renderTexture.renderWebGL(renderer, renderTexture, camera);
    }
  }

  renderCanvas(renderer, _src, camera) {
    if (this.width > 0 && this.height > 0) {
      let renderTexture = this.getFrame().renderTexture;

      // See: https://github.com/photonstorm/phaser/pull/6141
      let antialias = renderer.antialias;
      renderer.antialias = true;

      renderTexture.renderCanvas(renderer, renderTexture, camera);

      renderer.antialias = antialias;
    }
  }

  update(_time, _delta) {
    this.lightField?.flushWalls();
    if (this.camera.dirty) {
      this.cull();
      this.updateDrawScale();
      this.invalidateCachedFrame();
    }

    if (this.dirtyRenderList) {
      this.rebuildRenderList();
      this.invalidateCachedFrame();
    }

    this.renderListChangesSinceLastTick = 0;
    this.camera.dirty = false;

    this.updateAnimationFrame();
  }

  updateAnimationFrame() {
    let oldAnimationFrame = this.animationFrame;
    this.animationFrame = Math.trunc(performance.now() / 600) % 4;
    if (oldAnimationFrame !== this.animationFrame) {
      if (
        this.renderList.some(
          (graphic) => graphic.cacheEntry.asset.animationFrames?.length,
        )
      )
        this.invalidateCachedFrame();
    }
  }

  invalidateCachedFrame() {
    if (this.cachedFrame) {
      this.cachedFrame.dirty = true;
    }
  }

  destroy(fromScene) {
    this.lampTextures.destroy();
    for (let index in this.tileGraphics) {
      this.releaseTileGraphic(this.tileGraphics[index]);
      delete this.tileGraphics[index];
    }

    this.tileGraphics = null;
    this.sections = null;
    this.camera.destroy();

    if (this.cachedFrame) {
      this.cachedFrame.destroy();
    }

    super.destroy(fromScene);
  }

  setSize(width, height) {
    let offsetRatio = 1.0 + Math.pow(this.zoom - 1, -1);
    this.scrollX += (this.camera.width - width) / 2 / offsetRatio;
    this.scrollY += (this.camera.height - height) / 2 / offsetRatio;
    this.camera.width = width;
    this.camera.height = height;
  }

  get width() {
    return this.camera.width;
  }

  set width(value) {
    this.setSize(value, this.height);
  }

  get height() {
    return this.camera.height;
  }

  set height(value) {
    this.setSize(this.width, value);
  }

  get scrollX() {
    return this.camera.scrollX;
  }

  set scrollX(value) {
    this.camera.scrollX = value;
  }

  get scrollY() {
    return this.camera.scrollY;
  }

  set scrollY(value) {
    this.camera.scrollY = value;
  }

  get zoom() {
    return this.camera.zoom;
  }

  set zoom(value) {
    this.camera.zoom = value;
  }

  get shouldRender() {
    return !this.cachedFrame || this.cachedFrame.dirty;
  }
}

Phaser.Class.mixin(EOMap, [
  Phaser.GameObjects.Components.BlendMode,
  Phaser.GameObjects.Components.Depth,
  Phaser.GameObjects.Components.Pipeline,
]);

Phaser.GameObjects.GameObjectFactory.register(
  "eomap",
  function (scene, textureCache, emf, layerVisibility) {
    const map = new EOMap(scene, textureCache, emf, layerVisibility);
    this.displayList.add(map);
    return map;
  },
);
