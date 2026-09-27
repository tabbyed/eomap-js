import { css, html, LitElement, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { AMBIENT_PRESETS, selectedLight } from "../lighting/model/settings.js";
import {
  LAMP_PRESETS,
  FREE_LIGHT_PRESET,
  CHICAGO_AMBER,
} from "../lighting/model/lamps.js";
import scrollbarStyles from "../styles/scrollbar";

// A light with no graphic: a small sun, drawn in the text colour.
const SUN_ICON = svg`<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
  <circle cx="12" cy="12" r="4.5" fill="currentColor" />
  <g stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
  </g>
</svg>`;

// Labels for the selected light's controls, by what kind of emitter it is.
const COPY = {
  window: {
    on: "Window lit",
    reach: "Outside reach",
    brightness: "Outside spill",
    glow: "Pane glow",
    maxReach: 6,
    about:
      "Pane glow lights the glass independently of the outside spill. Light shines outward from the window; walls still block it.",
    reset: "Reset window lighting",
    owner:
      "The window belongs to this wall. Its position and height follow the graphic.",
  },
  lantern: {
    on: "Lantern lit",
    reach: "Light reach",
    brightness: "Light brightness",
    glow: "Lantern glow",
    maxReach: 6,
    about:
      "The lantern glass glows independently of the light it casts. Light shines outward from the wall; walls still block it.",
    reset: "Reset lantern lighting",
    owner:
      "The lantern belongs to this wall. Its position and height follow the graphic.",
  },
  lamp: {
    on: "Light on",
    reach: "Light reach",
    brightness: "Light brightness",
    glow: "Bulb glow",
    maxReach: 12,
    about:
      "Bright glass and a soft halo. Light reach controls the ground pool.",
  },
};

@customElement("eomap-lighting-panel")
export class LightingPanel extends LitElement {
  @property({ attribute: false }) mapState;
  @property({ attribute: false }) toolState;
  @property({ attribute: false }) gfxLoader;
  @property({ type: Number }) revision = 0;
  @state() thumbnails = {};

  static styles = [
    scrollbarStyles,
    css`
      :host {
        /* App theme (Spectrum dark) with an amber accent for lighting. */
        --surface: var(--spectrum-global-color-gray-75, #1a1a1a);
        --raised: var(--spectrum-global-color-gray-200, #2c2c2c);
        --raised-hover: var(--spectrum-global-color-gray-300, #393939);
        --rule: var(--spectrum-global-color-gray-200, #2c2c2c);
        --control-border: var(--spectrum-global-color-gray-400, #494949);
        --text: var(--spectrum-global-color-gray-900, #efefef);
        --muted: var(--spectrum-global-color-gray-700, #a2a2a2);
        --radius: var(--spectrum-alias-component-border-radius, 4px);
        --accent: #e8b25f;
        --accent-strong: #f5c983;
        --accent-ink: #1f1a12;
        --accent-soft: rgb(232 178 95 / 14%);
        --window: #98ddff;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        height: 100%;
        min-width: 0;
        padding: 0 var(--spectrum-global-dimension-size-50, 4px)
          var(--spectrum-global-dimension-size-50, 4px);
        color: var(--text);
        font: 13px/1.45
          var(--spectrum-alias-body-text-font-family, system-ui, sans-serif);
      }
      :host([hidden]) {
        display: none;
      }
      * {
        box-sizing: border-box;
      }
      .scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        background: var(--surface);
      }
      header {
        padding: 12px 14px 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      h2 {
        font-size: 16px;
        margin: 0;
        font-weight: 700;
      }
      h3 {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
        margin: 0 0 10px;
      }
      section,
      footer {
        padding: 14px;
        border-top: 1px solid var(--rule);
      }
      p {
        margin: 8px 0 0;
        color: var(--muted);
        font-size: 12px;
      }
      button,
      input {
        font: inherit;
        color: inherit;
      }
      button {
        min-height: 30px;
        padding: 5px 10px;
        border: 1px solid var(--control-border);
        border-radius: var(--radius);
        background: var(--raised);
        cursor: pointer;
        transition:
          background-color 120ms,
          border-color 120ms,
          color 120ms;
      }
      button:hover {
        background: var(--raised-hover);
      }
      button:disabled {
        opacity: 0.4;
        cursor: default;
      }
      button[aria-pressed="true"] {
        border-color: var(--accent);
        background: var(--accent-soft);
        color: var(--accent-strong);
      }
      :focus-visible {
        outline: 2px solid var(--spectrum-alias-focus-color, #1473e6);
        outline-offset: 1px;
      }
      .danger:hover {
        border-color: #d7675b;
        color: #ffb4aa;
      }
      .toggles {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 18px;
      }
      /* Checkboxes drawn as switches; they stay native inputs. */
      .switch {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        user-select: none;
      }
      .switch input {
        appearance: none;
        position: relative;
        flex: none;
        width: 28px;
        height: 16px;
        margin: 0;
        border-radius: 8px;
        background: var(--control-border);
        cursor: pointer;
        transition: background-color 150ms;
      }
      .switch input::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--text);
        transition: transform 150ms;
      }
      .switch input:checked {
        background: var(--accent);
      }
      .switch input:checked::after {
        transform: translateX(12px);
        background: var(--accent-ink);
      }
      .legend {
        display: grid;
        gap: 4px;
        margin-top: 10px;
        color: var(--muted);
        font-size: 12px;
      }
      .legend span::before {
        content: "";
        display: inline-block;
        width: 8px;
        height: 8px;
        margin-right: 7px;
        border: 1.5px solid var(--swatch);
        border-radius: 2px;
      }
      .presets {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(56px, 1fr));
        gap: 6px;
      }
      .preset {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 8px 2px 6px;
        font-size: 11px;
        line-height: 1.2;
      }
      .art {
        height: 48px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        color: var(--accent);
      }
      .art svg {
        margin-bottom: 11px;
      }
      img {
        max-height: 48px;
        max-width: 40px;
        image-rendering: pixelated;
      }
      .segmented {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(0, 1fr);
        gap: 6px;
      }
      .mode {
        margin-top: 10px;
      }
      .hint {
        min-height: 36px;
      }
      .notice {
        color: var(--accent-strong);
      }
      kbd {
        padding: 1px 5px;
        border: 1px solid var(--control-border);
        border-bottom-width: 2px;
        border-radius: 3px;
        color: var(--muted);
        font: 11px var(--spectrum-alias-body-text-font-family, system-ui);
      }
      .empty {
        margin: 0;
        padding: 12px;
        border: 1px dashed var(--control-border);
        border-radius: var(--radius);
      }
      .title {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 10px;
        font-size: 14px;
        font-weight: 700;
      }
      .muted {
        color: var(--muted);
        font-size: 12px;
        font-weight: 400;
      }
      .field {
        display: block;
        margin-top: 12px;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      output {
        color: var(--accent-strong);
        font-variant-numeric: tabular-nums;
      }
      input[type="range"] {
        width: 100%;
        margin: 6px 0 0;
        accent-color: var(--accent);
        cursor: pointer;
      }
      input[type="color"] {
        width: 36px;
        height: 24px;
        padding: 2px;
        border: 1px solid var(--control-border);
        border-radius: var(--radius);
        background: var(--raised);
        cursor: pointer;
      }
      .actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        margin-top: 12px;
      }
      .wide {
        width: 100%;
        margin-top: 12px;
      }
      .dirty::before {
        content: "●";
        margin-right: 5px;
        color: var(--accent);
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    // Keep inspector arrows/space/typing from reaching Phaser's map controls.
    this.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.action("select");
        this.shadowRoot.activeElement?.blur();
      }
      event.stopPropagation();
    });
    this.addEventListener("keyup", (event) => event.stopPropagation());
    this.addEventListener("wheel", (event) => event.stopPropagation());
  }

  async updated(changes) {
    if (changes.has("gfxLoader") && this.gfxLoader) {
      const loader = this.gfxLoader;
      const entries = await Promise.all(
        LAMP_PRESETS.map(async (preset) => {
          if (!loader.resourceInfo(4, preset.graphic + 100))
            return [preset.id, null];
          const pixels = await loader.loadResource(4, preset.graphic + 100);
          const canvas = document.createElement("canvas");
          canvas.width = pixels.width;
          canvas.height = pixels.height;
          canvas.getContext("2d").putImageData(pixels, 0, 0);
          return [preset.id, canvas.toDataURL()];
        }),
      );
      if (loader === this.gfxLoader)
        this.thumbnails = Object.fromEntries(entries);
    }
  }

  // `target` is the light the action edits, the current selection unless
  // a control was opened for another one.
  action(type, value, target = this.toolState?.selection) {
    this.dispatchEvent(
      new CustomEvent("lighting-action", { detail: { type, value, target } }),
    );
  }

  toggle(label, checked, onChange) {
    return html`<label class="switch"
      ><input
        type="checkbox"
        role="switch"
        aria-label=${label}
        .checked=${checked}
        @change=${(event) => onChange(event.target.checked)}
      />${label}</label
    >`;
  }

  slider(label, name, value, min, max, step, suffix, scope) {
    const format = (number) =>
      `${suffix === "%" ? Math.round(number * 100) : number}${suffix}`;
    return html`<label class="field">
      <span class="row"
        ><span>${label}</span><output .textContent=${format(value)}></output
      ></span>
      <input
        aria-label=${label}
        type="range"
        min=${min}
        max=${max}
        step=${step}
        .value=${String(value)}
        @input=${(event) => {
          event.target.previousElementSibling.querySelector(
            "output",
          ).textContent = format(Number(event.target.value));
          this.action(`preview-${scope}`, {
            [name]: Number(event.target.value),
          });
        }}
        @change=${(event) =>
          this.action(scope, { [name]: Number(event.target.value) })}
      />
    </label>`;
  }

  colour(label, value, scope) {
    return html`<label class="row field"
      >${label}<input
        aria-label=${label}
        type="color"
        .value=${value}
        @click=${(event) => {
          // The picker stays open while the map is clicked, so remember the
          // light it was opened for.
          event.target.lightTarget = this.toolState?.selection;
        }}
        @input=${(event) =>
          this.action(
            `preview-${scope}`,
            { color: event.target.value },
            event.target.lightTarget,
          )}
        @change=${(event) => {
          this.action(
            scope,
            { color: event.target.value },
            event.target.lightTarget,
          );
          event.target.lightTarget = undefined;
        }}
    /></label>`;
  }

  renderPresets(tool) {
    const tiles = [
      ...LAMP_PRESETS.map((item) => ({
        id: item.id,
        name: item.name,
        disabled: !this.gfxLoader?.resourceInfo(4, item.graphic + 100),
        art: this.thumbnails[item.id]
          ? html`<img alt="" src=${this.thumbnails[item.id]} />`
          : SUN_ICON,
      })),
      { id: "free", name: "Free light", disabled: false, art: SUN_ICON },
    ];
    return html`<div class="presets">
      ${tiles.map(
        (tile) =>
          html`<button
            class="preset"
            aria-label=${`Choose ${tile.name.toLowerCase()}`}
            aria-pressed=${tool.preset === tile.id}
            ?disabled=${tile.disabled}
            @click=${() => this.action("preset", tile.id)}
          >
            <span class="art">${tile.art}</span>${tile.name}
          </button>`,
      )}
    </div>`;
  }

  hint(tool, selected) {
    if (tool.notice) return html`<span class="notice">${tool.notice}</span>`;
    if (tool.mode === "move")
      return html`Click
        ${selected?.kind === "free" ? "a tile" : "an empty tile"} to move this
        light. <kbd>Esc</kbd> cancels.`;
    if (tool.mode === "place")
      return tool.preset === "free"
        ? html`Click any tile to place light, even over an object.
            <kbd>Esc</kbd> cancels.`
        : html`Move over the map to preview. Click an empty tile to place.
            <kbd>Esc</kbd> cancels.`;
    return "Click a lamp’s base, window glass or a blue free-light marker to adjust its light.";
  }

  renderSelected(selected) {
    if (!selected)
      return html`<p class="empty">
        Native lamps, windows and wall lanterns light automatically. Select one
        to change it, or add a free light.
      </p>`;
    const fixed = selected.kind === "window";
    const copy = COPY[fixed ? selected.fixture || "window" : "lamp"];
    return html`
      <div class="title">
        ${selected.name}
        <span class="muted">${selected.x}, ${selected.y}</span>
      </div>
      ${this.toggle(copy.on, selected.enabled, (enabled) =>
        this.action("lamp", { enabled }),
      )}
      ${this.slider(
        copy.reach,
        "radius",
        selected.radius,
        1,
        copy.maxReach,
        0.5,
        " tiles",
        "lamp",
      )}
      ${this.slider(
        copy.brightness,
        "brightness",
        selected.brightness,
        0,
        2,
        0.05,
        "%",
        "lamp",
      )}
      ${selected.kind === "free"
        ? html`${this.slider(
              "Source height",
              "height",
              selected.height ?? 0,
              0,
              192,
              8,
              " px",
              "lamp",
            )}
            <p>
              Raises the source above its ground anchor. Walls receive light at
              that height; the floor pool becomes smaller and softer.
            </p>`
        : html`${this.slider(
              copy.glow,
              "glow",
              selected.glow ?? 1,
              0,
              2,
              0.05,
              "%",
              "lamp",
            )}
            <p>${copy.about}</p>`}
      ${this.colour("Light colour", selected.color, "lamp")}
      ${fixed
        ? html`<button
              class="wide"
              @click=${() => this.action("window-default")}
            >
              ${copy.reset}
            </button>
            <p>${copy.owner}</p>`
        : html`<div class="field">
              ${this.toggle(
                "Block light at walls",
                selected.shadows !== false,
                (shadows) => this.action("lamp", { shadows }),
              )}
            </div>
            <button
              class="wide"
              @click=${() => this.action("lamp", CHICAGO_AMBER)}
            >
              Chicago amber
            </button>
            <div class="actions">
              <button @click=${() => this.action("move")}>Move</button
              ><button @click=${() => this.action("duplicate")}>
                Duplicate</button
              ><button class="danger" @click=${() => this.action("delete")}>
                Delete
              </button>
            </div>
            <p>
              ${selected.kind === "free"
                ? "Moving or deleting affects only this light. Map graphics stay in place."
                : "Moving or deleting includes the lamp and its light."}
            </p>`}
    `;
  }

  render() {
    const emf = this.mapState?.emf;
    const tool = this.toolState;
    if (!emf || !tool)
      return html`<div class="scroll">
        <header><h2>Lighting</h2></header>
        <section>Open or create a map to add lighting.</section>
      </div>`;
    const selected = selectedLight(emf, this.mapState.lighting, tool.selection);
    const preset =
      tool.preset === "free"
        ? FREE_LIGHT_PRESET
        : LAMP_PRESETS.find((item) => item.id === tool.preset) ||
          LAMP_PRESETS[0];
    const ambient = this.mapState.lighting.ambient;
    return html`<div class="scroll">
      <header>
        <h2>Lighting</h2>
        <kbd title="Toggle the lighting tool">L</kbd>
      </header>
      <section>
        <div class="toggles">
          ${this.toggle("Preview lighting", tool.preview, (value) =>
            this.action("preview", value),
          )}
          ${this.toggle("Light guides", tool.guides, (value) =>
            this.action("guides", value),
          )}
        </div>
        ${tool.guides
          ? html`<div class="legend">
              <span style="--swatch: var(--accent)"
                >Lamps: brackets mark the source, rings the ground reach</span
              >
              <span style="--swatch: var(--window)"
                >Windows and lanterns: glass outlined</span
              >
            </div>`
          : null}
      </section>
      <section>
        <h3>Add a light</h3>
        ${this.renderPresets(tool)}
        <p>${preset.description}</p>
        <div class="segmented mode">
          <button
            aria-pressed=${tool.mode === "place"}
            @click=${() => this.action("place")}
          >
            Place ${preset.name.toLowerCase()}
          </button>
          <button
            aria-pressed=${tool.mode === "select"}
            @click=${() => this.action("select")}
          >
            Select
          </button>
        </div>
        <p class="hint" role="status">${this.hint(tool, selected)}</p>
      </section>
      <section>
        <h3>Selected light</h3>
        ${this.renderSelected(selected)}
      </section>
      <section>
        <h3>Scene atmosphere</h3>
        <div class="segmented">
          ${Object.values(AMBIENT_PRESETS).map(
            (item) =>
              html`<button
                aria-pressed=${ambient.brightness === item.brightness &&
                ambient.color === item.color}
                @click=${() =>
                  this.action("ambient", {
                    brightness: item.brightness,
                    color: item.color,
                  })}
              >
                ${item.name}
              </button>`,
          )}
        </div>
        ${this.slider(
          "Ambient brightness",
          "brightness",
          ambient.brightness,
          0.15,
          1,
          0.05,
          "%",
          "ambient",
        )}
        ${this.colour("Ambient colour", ambient.color, "ambient")}
        <p>
          Night shows each light clearly. Recognised building walls block light;
          fences and decorations let it through.
        </p>
      </section>
      <footer>
        <div class="segmented">
          <button @click=${() => this.action("load")}>Load lighting…</button
          ><button @click=${() => this.action("save")}>Save lighting…</button>
        </div>
        <p class=${this.mapState.lightingDirty ? "dirty" : ""}>
          ${this.mapState.lightingDirty
            ? "Unsaved lighting changes. "
            : ""}Lighting
          is saved in a companion .lighting.json file; keep it with your EMF.
        </p>
      </footer>
    </div>`;
  }
}
