import {html} from '//resources/lit/v3_0/lit.rollup.js';

import type {RailSpacePanelElement} from './space_panel.js';

export function getHtml(this: RailSpacePanelElement) {
  return html`<!--_html_template_start_-->
${this.isColor_() ? html`
  <div id="colorpicker">
    <div class="panelhead">
      <input id="colorname" spellcheck="false" maxlength="7"
        aria-label="Hex color" .value="${this.pickedHex_()}"
        @input="${this.onHexInput_}">
      <div id="colorpreview" style="background: ${this.pickedHex_()}"></div>
      <button class="panelclose" title="Close" @click="${this.onCloseClick_}">
        <cr-icon icon="cr:close"></cr-icon>
      </button>
    </div>
    <div id="colorfield" @pointerdown="${this.onFieldPointerdown_}"
      @pointermove="${this.onFieldPointermove_}">
      <div id="colordot"
        style="left: ${this.dotLeft_()}; top: ${this.dotTop_()}"></div>
    </div>
    <input id="strength" type="range" min="${this.minStrength_()}" max="100"
      style="--track-gradient: ${this.trackGradient_()}"
      .value="${String(this.strength_)}"
      @input="${this.onStrengthInput_}">
    <div id="swatches">
      ${this.swatches_().map(color => html`
        <button class="swatch" data-color="${color}" title="${color}"
          style="background: ${color}"
          @click="${this.onSwatchClick_}"></button>
      `)}
    </div>
    <div id="backdrop">
      <div id="materials">
        ${this.materials_().map(([value, label]) => html`
          <button class="material" data-material="${value}"
            ?selected="${value === this.material_}"
            @click="${this.onMaterialClick_}">${label}</button>
        `)}
      </div>
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
