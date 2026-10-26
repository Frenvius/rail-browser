import {html} from '//resources/lit/v3_0/lit.rollup.js';

import type {RailSpacePanelElement} from './space_panel.js';

export function getHtml(this: RailSpacePanelElement) {
  return html`<!--_html_template_start_-->
${this.isColor_() ? html`
  <div id="colorpicker">
    <div id="field" ?dragging="${this.dragging_ >= 0}"
      @pointerdown="${this.onFieldPointerdown_}"
      @pointermove="${this.onFieldPointermove_}"
      @pointerup="${this.onFieldPointerup_}"
      @pointercancel="${this.onFieldPointercancel_}">
      ${this.colors_.map((hex, index) => html`
        <div class="dot" data-index="${index}" ?primary="${index === 0}"
          ?selected="${index === this.selected_}"
          style="${this.dotStyle_(hex)}"></div>
      `)}
      <div id="fieldbar">
        <button class="count" title="Remove color"
          ?disabled="${!this.canRemoveColor_()}"
          @click="${this.onRemoveColorClick_}">
          <svg viewBox="0 0 12 12"><path d="M2 6h8"></path></svg>
        </button>
        <input id="colorname" spellcheck="false" maxlength="7"
          aria-label="Hex color" .value="${this.selectedHex_()}"
          @input="${this.onHexInput_}">
        <button class="count" title="Add color"
          ?disabled="${!this.canAddColor_()}"
          @click="${this.onAddColorClick_}">
          <svg viewBox="0 0 12 12"><path d="M2 6h8M6 2v8"></path></svg>
        </button>
      </div>
    </div>
    <div id="swatches">
      ${this.swatches_().map(color => html`
        <button class="swatch" data-color="${color}" title="${color}"
          style="background: ${color}"
          @click="${this.onSwatchClick_}"></button>
      `)}
    </div>
    <div id="controls">
      <div id="strength">
        <svg id="wave" viewBox="0 0 150 30" preserveAspectRatio="none"
          aria-hidden="true">
          <path d="${this.wavePath_()}"></path>
        </svg>
        <input id="strengthRange" type="range" min="${this.minStrength_()}"
          max="100" aria-label="Tint strength"
          .value="${String(this.strength_)}"
          @input="${this.onStrengthInput_}">
      </div>
      <div id="dial" role="slider" tabindex="0" aria-label="Grain"
        aria-valuemin="0" aria-valuemax="100" aria-valuenow="${this.grain_}"
        @pointerdown="${this.onDialPointerdown_}"
        @pointermove="${this.onDialPointermove_}"
        @keydown="${this.onDialKeydown_}"
        @wheel="${this.onDialWheel_}">
        ${this.dialTicks_().map(tick => html`
          <div class="tick" ?lit="${tick.lit}"
            style="left: ${tick.x}px; top: ${tick.y}px"></div>
        `)}
        <div id="knob" style="transform: rotate(${this.dialAngle_()}deg)">
          <div id="indicator"></div>
        </div>
      </div>
    </div>
    <div id="materials">
      ${this.materials_().map(([value, label]) => html`
        <button class="material" data-material="${value}"
          ?selected="${value === this.material_}"
          @click="${this.onMaterialClick_}">${label}</button>
      `)}
    </div>
  </div>
` : html`
  <div id="picker">
    <div class="panelhead">
      <input id="iconSearch" placeholder="Search icons" spellcheck="false"
        .value="${this.iconQuery_}" @input="${this.onIconSearchInput_}">
      <button class="panelclose" title="Close" @click="${this.onCloseClick_}">
        <cr-icon icon="cr:close"></cr-icon>
      </button>
    </div>
    <div id="iconGrid">
      <button class="glyph" data-icon="none" title="No icon"
        ?selected="${this.icon_ === ''}" @click="${this.onIconClick_}">
        <cr-icon icon="cr:close"></cr-icon>
      </button>
      ${this.filteredIcons_().map(([icon, terms]) => html`
        <button class="glyph" data-icon="${icon}" title="${terms}"
          ?selected="${icon === this.icon_}"
          @click="${this.onIconClick_}">${icon}</button>
      `)}
    </div>
    <div id="noicons" ?hidden="${this.filteredIcons_().length > 0}">
      No icon matches
    </div>
  </div>
`}
<!--_html_template_end_-->`;
}
