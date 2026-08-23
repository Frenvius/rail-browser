import {html} from '//resources/lit/v3_0/lit.rollup.js';

import type {SpaceBarElement} from './space_bar.js';

export function getHtml(this: SpaceBarElement) {
  return html`<!--_html_template_start_-->
${this.variant === 'title' ? html`
  <div id="title" @contextmenu="${this.onNameContextmenu_}">
    ${this.editing_ ? html`
      <input id="nameInput" .value="${this.activeName_()}" spellcheck="false"
        @blur="${this.onInputBlur_}" @keydown="${this.onInputKeydown_}">
    ` : html`
      <button id="name" title="Rename space" @click="${this.onNameClick_}">
        ${this.activeName_()}
      </button>
    `}
  </div>
` : html`
  <div id="bar">
    <div id="dots">
      ${this.spaces.map(space => html`
        <button class="dot" data-id="${space.id}" title="${space.name}"
          ?selected="${space.id === this.activeId}"
          @click="${this.onDotClick_}"
          @contextmenu="${this.onDotContextmenu_}"></button>
      `)}
    </div>
    <button id="add" title="New space" @click="${this.onAddClick_}">
      <cr-icon icon="cr:add"></cr-icon>
    </button>
  </div>
`}
<cr-action-menu id="menu">
  <button class="dropdown-item" ?hidden="${this.variant !== 'title'}"
    @click="${this.onRenameClick_}">
    Rename Space
  </button>
  <button class="dropdown-item" ?hidden="${!this.canRemove_()}"
    @click="${this.onRemoveClick_}">
    Delete Space
  </button>
</cr-action-menu>
<!--_html_template_end_-->`;
  // clang-format on
}
