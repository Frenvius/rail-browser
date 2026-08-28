import {html} from '//resources/lit/v3_0/lit.rollup.js';

import type {RailCommandElement} from './command.js';

export function getHtml(this: RailCommandElement) {
  return html`
<webui-browser-searchbox id="address"
    @input="${this.onInput_}"
    @searchbox-match-opened="${this.onSearchboxMatchOpened_}">
  <div slot="tabMatches" id="rows" ?hidden="${!this.rows_.length}"
      @pointerleave="${this.onRowsPointerleave_}">
    ${this.rows_.map((row, i) => html`
      <button class="row" tabindex="-1" data-index="${i}"
          ?selected="${i === this.selected_}"
          @pointerenter="${this.onRowPointerenter_}"
          @click="${this.onRowClick_}">
        <span class="favicon"
          style="background-image: url(${row.favicon})"></span>
        <span class="title">${row.title}</span>
        <span class="hint">${row.hint}</span>
      </button>
    `)}
  </div>
</webui-browser-searchbox>`;
}
