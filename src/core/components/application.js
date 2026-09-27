import { css, html, LitElement } from "lit";

import { customElement, property, query, state } from "lit/decorators.js";

import "@spectrum-web-components/dropzone/sp-dropzone.js";

import "./sidebar";
import "./editor";
import "./infobar";
import "./entity-editor";
import "./new-map";
import "./properties";
import "./settings";
import "./about";
import "./prompt";
import "./lighting-panel";
import { LightingController } from "../controllers/lighting-controller";
import { saveMapWithLighting } from "../state/lighting-save.js";

import { Startup } from "./startup";
import { Palette } from "./palette";

import { GFXLoader } from "../gfx/load/gfx-loader";
import { LocalLoadingStrategy } from "../gfx/load/strategy/local-loading-strategy";
import { RemoteLoadingStrategy } from "../gfx/load/strategy/remote-loading-strategy";

import { SettingsController } from "../controllers/settings-controller";
import { RecentFilesController } from "../controllers/recent-files-controller";
import { MenubarController } from "../controllers/menubar-controller";

import { TilePosState } from "../state/tilepos-state";
import { Eyedrop } from "../tools/eyedrop";
import { LayerVisibilityState } from "../state/layer-visibility-state";
import { EntityState } from "../state/entity-state";
import { MapPropertiesState } from "../state/map-properties-state";
import { SettingsState } from "../state/settings-state";
import { MapState } from "../state/map-state";
import { PromptState, PromptType } from "../state/prompt-state";

import { EMF } from "../data/emf";
import { EOReader } from "../data/eo-reader";
import { CHAR_MAX } from "../data/eo-numeric-limits";

import { FileSystemProvider } from "../filesystem/file-system-provider";

@customElement("eomap-application")
export class Application extends LitElement {
  static get styles() {
    return css`
      :host {
        --spectrum-divider-size: 1px;
        --spectrum-global-font-family-code:
          "Source Code Pro", Monaco_, Consolas, monospace;
        background-color: var(--spectrum-global-color-gray-200);
        color: var(--spectrum-global-color-gray-800);
        width: 100%;
        height: 100%;
        display: grid;
        grid-template-rows: min-content 1fr;
        grid-template-columns: min-content minmax(0, 1fr) min-content;
        overflow: hidden;
      }

      eomap-titlebar {
        grow-row: 1 / 2;
        grid-column: 1 / 3;
        border-bottom: 1px solid var(--spectrum-global-color-gray-200);
      }

      eomap-sidebar {
        grid-row: 2 / 4;
        grid-column: 1;
        border-right: 1px solid var(--spectrum-global-color-gray-200);
      }

      eomap-startup {
        grid-row: 2 / 3;
        grid-column: 2;
      }

      eomap-editor {
        grid-row: 2 / 3;
        grid-column: 2;
      }

      sp-dropzone {
        --spectrum-dropzone-border-width: 0px;
        --spectrum-dropzone-border-radius: 0px;
        --spectrum-dropzone-padding: 0px;
        grid-row: 2 / 3;
        grid-column: 2;
        z-index: 101;
        pointer-events: none;
      }

      sp-dropzone[dragged] {
        --spectrum-dropzone-border-width: unset;
      }

      :host([dragged]) sp-dropzone {
        pointer-events: all;
      }

      eomap-palette {
        grid-row: 2 / 4;
        grid-column: 3;
        border-left: 1px solid var(--spectrum-global-color-gray-200);
      }

      .lighting-demo {
        grid-row: 2;
        grid-column: 2;
        align-self: end;
        justify-self: center;
        z-index: 102;
        margin: 25px;
        padding: 12px 20px;
        background: #edbd72;
        color: #211c15;
        border: none;
        border-radius: 5px;
        font: 600 14px system-ui;
        cursor: pointer;
      }

      eomap-infobar {
        grid-row: 3 / 4;
        grid-column: 2;
        border-top: 1px solid var(--spectrum-global-color-gray-200);
      }
    `;
  }

  @query("sp-dropzone", true)
  dropzone;

  @query("eomap-sidebar", true)
  sidebar;

  @query("eomap-editor")
  editor;

  @query("eomap-entity-editor")
  entityEditor;

  @query("eomap-new-map")
  newMap;

  @query("eomap-properties")
  properties;

  @query("eomap-settings")
  settings;

  @query("eomap-about")
  about;

  @query("eomap-prompt")
  prompt;

  @property({ type: Boolean, reflect: true, attribute: "dragged" })
  isDragged = false;

  @state({ type: Number })
  startupStatus = Startup.Status.LOADING_SETTINGS;

  @state({ type: GFXLoader })
  gfxLoader = null;

  @state({ type: MapState })
  mapState = new MapState();

  @property({ type: RecentFilesController })
  recentFilesController = null;

  @property({ type: SettingsController })
  settingsController = null;

  @property({ type: MenubarController })
  menubarController = null;

  @property({ type: FileSystemProvider })
  fileSystemProvider = null;

  @state({ type: Boolean })
  dirty = false;

  @state({ type: Boolean })
  hasUndoCommands = false;

  @state({ type: Boolean })
  hasRedoCommands = false;

  @state({ type: Number })
  gfxErrors = 0;

  @state({ type: TilePosState })
  currentPos = new TilePosState();

  @state({ type: Number })
  zoom = null;

  @state({ type: LayerVisibilityState })
  layerVisibility = new LayerVisibilityState();

  @state({ type: String })
  selectedTool = "draw";

  @state()
  lightingToolState = {
    mode: "select",
    preset: "street",
    preview: true,
    guides: true,
    selection: null,
    duplicate: null,
    notice: "",
  };

  @state()
  lightingRevision = 0;

  lightingController = new LightingController(this);

  @state()
  lightingInspectorFocused = false;

  @state({ type: Number })
  selectedLayer = 0;

  @state({ type: Number })
  selectedDrawID = null;

  @state({ type: Eyedrop })
  eyedrop = null;

  @state({ type: EntityState })
  entityState = null;

  @state({ type: MapPropertiesState })
  mapPropertiesState = null;

  @state({ type: SettingsState })
  settingsState = null;

  @state({ type: Array })
  recentFiles = [];

  @state({ type: Boolean })
  paletteResizing = false;

  @state({ type: Number })
  maxPaletteWidth = Palette.DEFAULT_WIDTH;

  @state({ type: Boolean })
  hasOpenModal = false;

  @state({ type: Boolean })
  hasOpenPrompt = false;

  @state({ type: Boolean })
  hasOpenContextMenu = false;

  pendingGFXLoader = null;

  isToolBeingUsed = false;

  onWindowKeyDown = (event) => {
    if (!this.keyboardEnabled()) {
      return;
    }

    if (!this.isToolBeingUsed && !event.repeat) {
      const tool = this.sidebar.getToolKeyForKeybinding(event);
      if (tool) {
        this.lightingController.clearPreview();
        this.selectedTool = tool;
      }
    }
  };

  onResize = (_event) => {
    this.calculateMaxPaletteWidth();
  };

  onBeforeUnload = (event) => {
    if (this.mapState.dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  };

  onMapStateChange = () => {
    ++this.lightingRevision;
    this.dirty = this.mapState.dirty;
    this.hasUndoCommands = this.mapState.commandInvoker.hasUndoCommands;
    this.hasRedoCommands = this.mapState.commandInvoker.hasRedoCommands;
    this.dispatchEvent(
      new CustomEvent("map-state-changed", { detail: this.mapState }),
    );
  };

  constructor() {
    super();
    this.addEventListener("keydown", this.onKeyDown);
    this.addEventListener("wheel", this.onWheel);
    this.addEventListener("dragover", this.onDragOver);
    this.addEventListener("dragleave", this.onDragLeave);
    this.addEventListener("drop", this.onDrop);
    this.addEventListener("context-menu-open", this.onContextMenuOpen);
    this.addEventListener("context-menu-close", this.onContextMenuClose);
  }

  undo() {
    this.lightingController.clearPreview();
    this.commandInvoker.undo();
  }

  redo() {
    this.lightingController.clearPreview();
    this.commandInvoker.redo();
  }

  readMap(buffer) {
    let reader = new EOReader(buffer);
    let emf = EMF.read(reader);
    this.mapState = this.mapState.withEMF(emf);
  }

  isConnectedMode() {
    return (
      !!FORCE_CONNECTED_MODE_URL || this.settingsState.connectedModeEnabled
    );
  }

  async canLoadGFX() {
    if (this.isConnectedMode()) {
      return true;
    } else {
      return (
        this.settingsState.gfxDirectory &&
        !(await this.needGFXDirectoryPermission()) &&
        !(await this.needAssetsDirectoryPermission())
      );
    }
  }

  async loadGFX() {
    this.destroyGFXLoader();

    let loadingStrategy;

    if (this.isConnectedMode()) {
      loadingStrategy = new RemoteLoadingStrategy(
        FORCE_CONNECTED_MODE_URL || this.settingsState.connectedModeURL,
      );
    } else {
      loadingStrategy = new LocalLoadingStrategy(
        this.settingsState.gfxDirectory,
        this.settingsState.customAssetsDirectory,
      );
    }

    const newGFXLoader = new GFXLoader(loadingStrategy);
    this.pendingGFXLoader = newGFXLoader;

    try {
      await Promise.allSettled(
        [3, 4, 5, 6, 7, 22].map(async (fileID) => {
          try {
            await newGFXLoader.loadEGF(fileID);
          } catch (e) {
            if (e.name === "AbortError") {
              throw e;
            } else {
              ++this.gfxErrors;
              console.error("Failed to load EGF %d: %s", fileID, e);
            }
          }
        }),
      );

      // Preload the cursor
      await newGFXLoader.loadRaw("cursor.png");

      if (newGFXLoader === this.pendingGFXLoader) {
        this.gfxLoader = newGFXLoader;
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        throw e;
      }
    } finally {
      if (newGFXLoader === this.pendingGFXLoader) {
        this.pendingGFXLoader = null;
      }
    }
  }

  showPrompt(promptState) {
    this.prompt.state = promptState;
    this.prompt.open = true;
    this.hasOpenPrompt = true;
  }

  async firstUpdated(changes) {
    super.firstUpdated(changes);

    const children = this.shadowRoot.querySelectorAll("*");
    await Promise.all(Array.from(children).map((c) => c.updateComplete));

    this.calculateMaxPaletteWidth();
  }

  updated(changes) {
    if (changes.has("settingsState") && this.settingsState) {
      this.manageSettings(changes.get("settingsState"));
    }
    if (changes.has("mapState")) {
      this.manageMapState(changes.get("mapState"));
    }
    if (changes.has("startupStatus")) {
      this.managePendingMapLoad();
    }
    if (changes.has("hasOpenPrompt")) {
      this.emitHasOpenPromptChanged();
    }
    this.updateStartupStatus();
  }

  async manageSettings(previous) {
    if (!this.fileSystemProvider.supported) {
      return;
    }

    if (!(await this.settingsChangeRequiresGFXReload(previous))) {
      return;
    }

    this.destroyGFXLoader();

    if (await this.canLoadGFX()) {
      this.loadGFX();
    }
  }

  manageMapState(previous) {
    if (previous) {
      previous.commandInvoker.off("change", this.onMapStateChange);
    }
    this.lightingToolState = {
      ...this.lightingToolState,
      mode: "select",
      selection: null,
      duplicate: null,
      notice: "",
    };
    this.mapState.commandInvoker.on("change", this.onMapStateChange);
    this.onMapStateChange();
  }

  managePendingMapLoad() {
    if (
      this.validGfx() &&
      this.mapState &&
      this.mapState.pending &&
      this.mapState.fileHandle
    ) {
      this.openFile(this.mapState.fileHandle);
    }
  }

  async settingsChangeRequiresGFXReload(previous) {
    if (!previous) {
      return true;
    }

    if (!!FORCE_CONNECTED_MODE_URL) {
      return false;
    }

    if (
      previous.connectedModeEnabled !== this.settingsState.connectedModeEnabled
    ) {
      return true;
    }

    if (this.isConnectedMode()) {
      return previous.connectedModeURL !== this.settingsState.connectedModeURL;
    }

    switch (this.startupStatus) {
      case Startup.Status.NEED_GFX_DIRECTORY_PERMISSION:
      case Startup.Status.NEED_ASSETS_DIRECTORY_PERMISSION:
        return this.canLoadGFX();
      default:
        return (
          (await this.isDifferentHandle(
            previous.gfxDirectory,
            this.settingsState.gfxDirectory,
          )) ||
          this.isDifferentHandle(
            previous.customAssetsDirectory,
            this.settingsState.customAssetsDirectory,
          )
        );
    }
  }

  async isDifferentHandle(a, b) {
    if (!a && !b) {
      return false;
    }
    if (!!a !== !!b) {
      return true;
    }
    return !(await a.isSameEntry(b));
  }

  calculateMaxPaletteWidth() {
    this.maxPaletteWidth = Math.max(
      Palette.MIN_WIDTH,
      this.clientWidth - this.sidebar.offsetWidth,
    );
  }

  renderEditor() {
    if (this.validGfx() && this.mapState.loaded) {
      return html`
        <eomap-editor
          @pointerdown=${() => {
            this.lightingInspectorFocused = false;
            this.shadowRoot
              .querySelector("eomap-lighting-panel")
              ?.shadowRoot.activeElement?.blur();
          }}
          .gfxLoader=${this.gfxLoader}
          .mapState=${this.mapState}
          .layerVisibility=${this.layerVisibility}
          .selectedTool=${this.selectedTool}
          .selectedLayer=${this.selectedLayer}
          .selectedDrawID=${this.selectedDrawID}
          .entityState=${this.entityState}
          .mapPropertiesState=${this.mapPropertiesState}
          .lightingToolState=${this.lightingToolState}
          .pointerEnabled=${this.pointerEnabled()}
          .keyboardEnabled=${this.keyboardEnabled()}
          @changedata-currentPos=${this.onCurrentPosChanged}
          @changedata-eyedrop=${this.onEyedropChanged}
          @changedata-isToolBeingUsed=${this.onIsToolBeingUsedChanged}
          @request-entity-editor=${this.onEntityEditorRequested}
          @zoom-changed=${this.onEditorZoomChanged}
          @lighting-tool-state=${(event) => {
            this.lightingToolState = event.detail;
          }}
        ></eomap-editor>
      `;
    }

    return html`
      <eomap-startup
        .status=${this.startupStatus}
        .mapState=${this.mapState}
        .gfxErrors=${this.gfxErrors}
        @settings=${this.showSettings}
        @request-gfx-directory-permission=${this
          .onRequestGFXDirectoryPermission}
        @request-assets-directory-permission=${this
          .onRequestAssetsDirectoryPermission}
        @retry-gfx=${this.loadGFX}
      ></eomap-startup>
    `;
  }

  render() {
    return html`
      <eomap-sidebar
        .menubarController=${this.menubarController}
        .selectedTool=${this.selectedTool}
        .canUndo=${this.canUndo()}
        .canRedo=${this.canRedo()}
        @tool-selected=${this.onToolSelected}
        @undo=${this.undo}
        @redo=${this.redo}
      ></eomap-sidebar>
      ${this.renderEditor()}
      ${LIGHTING_DEMO_URL && !this.mapState.loaded
        ? html`<button
            class="lighting-demo"
            ?disabled=${!this.validGfx()}
            @click=${this.openLightingDemo}
          >
            Open lighting preview
          </button>`
        : ""}
      <sp-dropzone
        @sp-dropzone-should-accept=${this.onDropzoneShouldAccept}
        @sp-dropzone-drop=${this.onDropzoneDrop}
      ></sp-dropzone>
      <eomap-palette
        .lightingActive=${this.selectedTool === "lighting"}
        .gfxLoader=${this.gfxLoader}
        .gfxErrors=${this.gfxErrors}
        .eyedrop=${this.eyedrop}
        .selectedLayer=${this.selectedLayer}
        .pointerEnabled=${this.pointerEnabled()}
        .keyboardEnabled=${this.keyboardEnabled()}
        .maxWidth=${this.maxPaletteWidth}
        @resize-start=${this.onPaletteResizeStart}
        @resize-end=${this.onPaletteResizeEnd}
        @layer-selected=${this.onSelectedLayerChanged}
        @lighting-selected=${this.onToolSelected}
        @changedata-selectedDrawID=${this.onSelectedDrawIDChanged}
      >
        <eomap-lighting-panel
          slot="lighting"
          .mapState=${this.mapState}
          .toolState=${this.lightingToolState}
          .gfxLoader=${this.gfxLoader}
          .revision=${this.lightingRevision}
          @focusin=${() => {
            this.lightingInspectorFocused = true;
          }}
          @focusout=${() => {
            this.lightingInspectorFocused = false;
          }}
          @lighting-action=${(event) =>
            this.lightingController.handle(event.detail)}
        ></eomap-lighting-panel>
      </eomap-palette>
      <eomap-infobar
        .tilePos=${this.currentPos}
        .zoom=${this.zoom}
        @zoom-changed=${this.onInfoBarZoomChanged}
      ></eomap-infobar>
      <eomap-entity-editor
        .tilePos=${this.currentPos}
        @close=${this.onModalClose}
        @save=${this.onEntityEditorSave}
      ></eomap-entity-editor>
      <eomap-new-map
        @close=${this.onModalClose}
        @confirm=${this.onNewMapConfirm}
      ></eomap-new-map>
      <eomap-properties
        @close=${this.onModalClose}
        @save=${this.onPropertiesSave}
      ></eomap-properties>
      <eomap-settings
        @close=${this.onModalClose}
        @save=${this.onSettingsSave}
        .fileSystemProvider=${this.fileSystemProvider}
      ></eomap-settings>
      <eomap-about @close=${this.onModalClose}></eomap-about>
      <eomap-prompt @close=${this.onPromptClose}></eomap-prompt>
    `;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.onWindowKeyDown);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("beforeunload", this.onBeforeUnload);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.onWindowKeyDown);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    super.disconnectedCallback();
  }

  onKeyDown(event) {
    if (!this.keyboardEnabled()) {
      return;
    }

    // Blur any focused elements when:
    //   1. We're moving around in the map renderer via keyboard
    //   2. We're scrolling the palette via keyboard
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
      case "ArrowLeft":
      case "ArrowRight":
      case "End":
      case "Home":
      case "PageUp":
      case "PageDown":
        document.activeElement.blur();
        break;
    }
  }

  onWheel(event) {
    if (event.ctrlKey) {
      if (this.mapState.zoom !== null) {
        let zoomStep = this.mapState.zoom / (event.deltaY > 0 ? -11 : 10);
        this.editor.updateZoom(this.mapState.zoom + zoomStep);
      }
      event.preventDefault();
    }
  }

  onDragOver(event) {
    event.preventDefault();
    this.isDragged = true;
  }

  onDragLeave(_event) {
    this.isDragged = false;
  }

  onDrop(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  onContextMenuOpen(_event) {
    this.hasOpenContextMenu = true;
  }

  onContextMenuClose(_event) {
    this.hasOpenContextMenu = false;
  }

  emfPickerOptions() {
    return {
      types: [
        {
          description: "Endless Map File",
          accept: {
            "*/*": [".emf"],
          },
        },
      ],
    };
  }

  dirtyCheck(callback) {
    if (this.mapState.dirty) {
      let onButtonPress = async (buttonIndex) => {
        switch (buttonIndex) {
          case 0:
            // Ask for a lighting file even if one was declined before:
            // closing would otherwise lose the lighting without warning.
            await this.save({ askForLightingFile: true });
            if (this.mapState.dirty) {
              // The map failed to save for some reason.
              // Bail out to guard against data loss.
              return;
            }
            break;
          case 2:
            return;
        }
        callback();
      };

      this.showPrompt(
        new PromptState(
          PromptType.Warning,
          `Do you want to save the changes you made to ${this.mapState.filename}?`,
          "Your changes will be lost if you don't save them.",
          ["Save", "Don't Save", "Cancel"],
          onButtonPress,
        ),
      );
    } else {
      callback();
    }
  }

  async open() {
    let fileHandle;
    try {
      [fileHandle] = await this.fileSystemProvider.showOpenFilePicker(
        this.emfPickerOptions(),
      );
    } catch (e) {
      if (e.name === "AbortError") {
        return;
      }
      throw e;
    }
    this.dirtyCheck(() => this.openFile(fileHandle));
  }

  async openRecent(index) {
    let fileHandle = this.recentFiles[index];
    if (!fileHandle) {
      throw new Error(`Invalid recent file index: ${index}`);
    }
    if ((await fileHandle.queryPermission()) !== "granted") {
      if ((await fileHandle.requestPermission()) !== "granted") {
        return;
      }
    }

    this.dirtyCheck(async () => {
      await this.openFile(fileHandle);
      if (this.mapState.error) {
        this.recentFilesController.removeRecentFile(fileHandle);
      }
    });
  }

  async clearRecent() {
    this.recentFilesController.clearRecentFiles();
  }

  async openFile(fileHandle) {
    const pending = !this.validGfx();
    this.mapState = MapState.fromFileHandle(fileHandle).withPending(pending);
    if (pending) {
      return;
    }

    this.startupStatus = Startup.Status.LOADING_EMF;
    this.zoom = null;

    try {
      let file = await fileHandle.getFile();
      let buffer = await file.arrayBuffer();
      this.readMap(buffer);
      this.recentFilesController.addRecentFile(fileHandle);
    } catch (e) {
      let error = e;
      if (e instanceof DOMException && e.name === "NotFoundError") {
        error = new Error(`"${fileHandle.name}" could not be found.`);
      }
      this.mapState = this.mapState.withError(error);
      console.error("Failed to load EMF", e);
    }
  }

  async save({ askForLightingFile = false } = {}) {
    if (!this.mapState.loaded) {
      return;
    }

    if (this.mapState.fileHandle === null) {
      await this.saveAs();
    } else {
      const state = this.mapState;
      const mapHandle = state.fileHandle;
      const filename = state.filename;
      try {
        // Obtain both destinations before writing either file. Cancelling the
        // lighting file still saves the map; lighting stays unsaved, and
        // later saves stop asking until the user chooses a file.
        if (
          state.needsLightingFile &&
          (askForLightingFile || !state.lightingFileDeclined)
        ) {
          const handle = await this.pickLightingFile(
            this.lightingController.pickerOptions(),
          );
          if (this.mapState !== state || state.fileHandle !== mapHandle) return;
          state.lightingFileHandle = handle;
          state.lightingFileDeclined = handle === null;
        }
        await saveMapWithLighting(state);
        if (this.mapState === state) {
          this.onMapStateChange();
          if (state.needsLightingFile)
            this.lightingToolState = {
              ...this.lightingToolState,
              notice:
                "Map saved. Lighting has no file yet, so it wasn't saved. Use Save lighting… to keep it.",
            };
        }
      } catch (e) {
        if (e.name === "AbortError") return;
        if (this.mapState !== state || state.fileHandle !== mapHandle) return;
        let onButtonPress = (buttonIndex) => {
          if (this.mapState !== state || state.fileHandle !== mapHandle) return;
          switch (buttonIndex) {
            case 0:
              this.save();
              break;
            case 1:
              this.saveAs();
              break;
          }
        };

        this.showPrompt(
          new PromptState(
            PromptType.Error,
            `Failed to save ${filename}`,
            `${e.message}\nIf one file was written, the other may still be unsaved. Your changes remain marked as unsaved.`,
            ["Retry", "Save As", "Cancel"],
            onButtonPress,
          ),
        );

        console.error(`Failed to save '${filename}'`, e);
      }
    }
  }

  async saveAs() {
    if (!this.mapState.loaded) {
      return;
    }

    const state = this.mapState;
    try {
      const mapHandle = await this.fileSystemProvider.showSaveFilePicker(
        this.emfPickerOptions(),
      );
      if (this.mapState !== state) return;
      let lightingHandle = null;
      if (state.hasLightingMetadata) {
        lightingHandle = await this.pickLightingFile({
          ...this.lightingController.pickerOptions(),
          suggestedName:
            mapHandle.name.replace(/\.emf$/i, "") + ".lighting.json",
        });
        if (this.mapState !== state) return;
      }
      // Cancelling the map picker leaves the original destinations intact.
      // Cancelling only the lighting file saves the map alone, as in save().
      state.fileHandle = mapHandle;
      state.lightingFileHandle = lightingHandle;
      state.lightingFileDeclined =
        state.hasLightingMetadata && lightingHandle === null;
      // This destination pair has no successful save checkpoint yet.
      state.lastSavedCommand = undefined;
      this.onMapStateChange();
    } catch (e) {
      if (e.name === "AbortError") {
        return;
      }
      throw e;
    }
    await this.save();
  }

  // A cancelled lighting file picker returns null instead of aborting the
  // map save it belongs to.
  async pickLightingFile(options) {
    try {
      return await this.fileSystemProvider.showSaveFilePicker(options);
    } catch (e) {
      if (e.name === "AbortError") return null;
      throw e;
    }
  }

  async openLightingDemo() {
    const response = await fetch(LIGHTING_DEMO_URL);
    if (!response.ok)
      throw new Error("Could not load the local lighting preview.");
    this.readMap(await response.arrayBuffer());
    this.mapState.scrollX = -250;
    this.mapState.scrollY =
      (this.mapState.emf.width + this.mapState.emf.height) * 8 - 300;
    this.selectedTool = "lighting";
  }

  showNewMap() {
    this.dirtyCheck(() => {
      this.newMap.open = true;
      this.updateHasOpenModal();
    });
  }

  showMapProperties() {
    this.properties.populate(this.mapState.emf);
    this.properties.open = true;
    this.updateHasOpenModal();
  }

  showSettings() {
    if (!this.settingsState) {
      return;
    }
    this.settings.populate(this.settingsState);
    this.settings.open = true;
    this.updateHasOpenModal();
  }

  showAbout() {
    this.about.open = true;
    this.updateHasOpenModal();
  }

  toggleVisibilityFlag(flag) {
    this.layerVisibility = this.layerVisibility.withFlagToggled(flag);
  }

  onToolSelected(event) {
    this.lightingController.clearPreview();
    this.lightingInspectorFocused = false;
    this.selectedTool = event.detail;
    document.activeElement.blur();
  }

  isValidDataTransfer(dataTransfer) {
    return (
      dataTransfer &&
      dataTransfer.items.length === 1 &&
      dataTransfer.items[0].kind === "file"
    );
  }

  onDropzoneShouldAccept(event) {
    let dataTransfer = event.detail.dataTransfer;
    if (!this.validGfx() || !this.isValidDataTransfer(dataTransfer)) {
      event.preventDefault();
    }
  }

  async onDropzoneDrop(event) {
    this.isDragged = false;
    let dataTransfer = event.detail.dataTransfer;
    if (this.isValidDataTransfer(dataTransfer)) {
      let fileHandle = await this.fileSystemProvider.dataTransferItemToHandle(
        dataTransfer.items[0],
      );
      if (fileHandle.kind === "file") {
        await this.openFile(fileHandle);
      }
    }
  }

  onCurrentPosChanged(event) {
    this.currentPos = event.detail;
  }

  onEyedropChanged(event) {
    this.eyedrop = event.detail;
  }

  onIsToolBeingUsedChanged(event) {
    this.isToolBeingUsed = event.detail;
  }

  onPaletteResizeStart(_event) {
    this.paletteResizing = true;
  }

  onPaletteResizeEnd(_event) {
    this.paletteResizing = false;
  }

  onSelectedLayerChanged(event) {
    if (this.selectedTool === "lighting") {
      this.lightingController.clearPreview();
      this.selectedTool = "draw";
    }
    this.lightingInspectorFocused = false;
    this.selectedLayer = event.detail;
    this.layerVisibility = this.layerVisibility.withSelectedLayer(
      this.selectedLayer,
    );
    document.activeElement.blur();
  }

  onSelectedDrawIDChanged(event) {
    this.selectedDrawID = event.detail;
  }

  onEditorZoomChanged(_event) {
    this.zoom = this.mapState.zoom;
  }

  onInfoBarZoomChanged(event) {
    this.zoom = event.detail;
    this.editor.updateZoom(this.zoom);
  }

  onEntityEditorRequested(event) {
    this.entityEditor.entityState = event.detail;
    this.entityEditor.open = true;
    this.updateHasOpenModal();
  }

  onModalClose(_event) {
    this.updateHasOpenModal();
  }

  onPromptClose(_event) {
    this.hasOpenPrompt = false;
  }

  onEntityEditorSave(event) {
    if (this.checkEntityOverflow(event.detail)) {
      this.entityState = event.detail;
    } else {
      this.entityEditor.open = true;
    }
  }

  checkEntityOverflow(entityState) {
    let emf = this.mapState.emf;
    let x = entityState.x;
    let y = entityState.y;

    let npcCount = emf.npcs.filter((n) => n.x !== x && n.y !== y).length;
    let itemCount = emf.items.filter((it) => it.x !== x && it.y !== y).length;
    let signCount = emf.tiles.filter((t) => t.sign).length;

    npcCount += entityState.npcs.length;
    itemCount += entityState.items.length;

    if (emf.getTile(x, y).sign) {
      --signCount;
    }

    if (entityState.sign) {
      ++signCount;
    }

    if (npcCount >= CHAR_MAX) {
      this.showEntityOverflowError("NPC", npcCount);
      return false;
    } else if (itemCount >= CHAR_MAX) {
      this.showEntityOverflowError("item", itemCount);
      return false;
    } else if (signCount >= CHAR_MAX) {
      this.showEntityOverflowError("sign", signCount);
      return false;
    }

    return true;
  }

  showEntityOverflowError(entityType, count) {
    let limit = CHAR_MAX - 1;
    this.showPrompt(
      new PromptState(
        PromptType.Error,
        `Entity limit exceeded`,
        `Only ${limit} ${entityType}s are allowed. (${count}/${limit})`,
        ["OK"],
      ),
    );
  }

  onNewMapConfirm(event) {
    const emf = EMF.new(
      event.detail.width,
      event.detail.height,
      event.detail.name,
    );
    const pending = !this.validGfx();
    this.mapState = MapState.fromEMF(emf).withPending(pending);
  }

  onPropertiesSave(event) {
    this.mapPropertiesState = event.detail;
  }

  async onSettingsSave(event) {
    this.settingsController.updateSettings(event.detail);
  }

  pointerEnabled() {
    return !this.paletteResizing && !this.hasOpenContextMenu;
  }

  keyboardEnabled() {
    return (
      !this.hasOpenModal &&
      !this.hasOpenPrompt &&
      !this.hasOpenContextMenu &&
      !this.lightingInspectorFocused
    );
  }

  canReloadGraphics() {
    switch (this.startupStatus) {
      case Startup.Status.ERROR_GFX:
      case Startup.Status.ERROR_EMF:
      case Startup.Status.LOADING_EMF:
      case Startup.Status.READY:
        return true;
      default:
        return false;
    }
  }

  canUndo() {
    return this.validGfx() && this.hasUndoCommands;
  }

  canRedo() {
    return this.validGfx() && this.hasRedoCommands;
  }

  updateHasOpenModal() {
    this.hasOpenModal =
      this.modalOpen(this.entityEditor) ||
      this.modalOpen(this.newMap) ||
      this.modalOpen(this.properties) ||
      this.modalOpen(this.settings) ||
      this.modalOpen(this.about);
  }

  modalOpen(modal) {
    return !!modal?.open;
  }

  emitHasOpenPromptChanged() {
    this.dispatchEvent(
      new CustomEvent("has-open-prompt-changed", {
        detail: this.hasOpenPrompt,
      }),
    );
  }

  async updateStartupStatus() {
    this.startupStatus = await this.getStartupStatus();
  }

  async getStartupStatus() {
    if (!this.fileSystemProvider.supported) {
      return Startup.Status.UNSUPPORTED;
    }

    if (!this.settingsState) {
      return Startup.Status.LOADING_SETTINGS;
    }

    if (!this.isConnectedMode()) {
      if (!this.settingsState.gfxDirectory) {
        return Startup.Status.NEED_GFX_DIRECTORY;
      }

      if (await this.needGFXDirectoryPermission()) {
        return Startup.Status.NEED_GFX_DIRECTORY_PERMISSION;
      }

      if (
        this.settingsState.customAssetsDirectory &&
        (await this.needAssetsDirectoryPermission())
      ) {
        return Startup.Status.NEED_ASSETS_DIRECTORY_PERMISSION;
      }
    }

    if (this.gfxErrors > 0) {
      return Startup.Status.ERROR_GFX;
    }

    if (!this.gfxLoader) {
      return Startup.Status.LOADING_GFX;
    }

    if (this.mapState.error) {
      return Startup.Status.ERROR_EMF;
    }

    if (this.mapState.loading) {
      return Startup.Status.LOADING_EMF;
    }

    return Startup.Status.READY;
  }

  async onRequestGFXDirectoryPermission() {
    await this.settingsState.gfxDirectory.requestPermission();
    this.requestUpdate();
    if (await this.canLoadGFX()) {
      this.loadGFX();
    }
  }

  async onRequestAssetsDirectoryPermission() {
    await this.settingsState.customAssetsDirectory.requestPermission();
    this.requestUpdate();
    if (await this.canLoadGFX()) {
      this.loadGFX();
    }
  }

  async needGFXDirectoryPermission() {
    return (
      this.settingsState?.gfxDirectory &&
      (await this.settingsState.gfxDirectory.queryPermission()) !== "granted"
    );
  }

  async needAssetsDirectoryPermission() {
    return (
      this.settingsState?.customAssetsDirectory &&
      (await this.settingsState.customAssetsDirectory.queryPermission()) !==
        "granted"
    );
  }

  validGfx() {
    return !!this.gfxLoader && this.gfxErrors === 0;
  }

  destroyGFXLoader() {
    if (this.pendingGFXLoader) {
      this.pendingGFXLoader.destroy();
    }
    if (this.gfxLoader) {
      this.gfxLoader.destroy();
    }
    this.pendingGFXLoader = null;
    this.gfxLoader = null;
    this.gfxErrors = 0;
  }

  get commandInvoker() {
    return this.mapState.commandInvoker;
  }
}
