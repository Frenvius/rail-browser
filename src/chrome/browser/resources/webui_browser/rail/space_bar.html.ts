import {html} from '//resources/lit/v3_0/lit.rollup.js';

import type {SpaceBarElement} from './space_bar.js';

export function getHtml(this: SpaceBarElement) {
  return html`<!--_html_template_start_-->
${this.variant === 'title' ? html`
  <div id="title" @contextmenu="${this.onNameContextmenu_}">
    <button id="glyph" title="Space options" style="color: ${
    this.activeColor_()}" @click="${this.onGlyphClick_}">
      <cr-icon icon="${this.activeIcon_()}"></cr-icon>
    </button>
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
          style="--dot-color: ${space.color}"
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
<cr-action-menu id="menu" @close="${this.onMenuClose_}">
  ${this.confirming_ ? html`
    <div id="confirm">
      Delete ${this.targetSpace_()?.name ?? ''} and close
      ${this.removeCount_()} tab${this.removeCount_() === 1 ? '' : 's'}?
    </div>
    <button class="dropdown-item" @click="${this.onCancelRemoveClick_}">
      Cancel
    </button>
    <button class="dropdown-item danger"
      @click="${this.onConfirmRemoveClick_}">
      Delete Space
    </button>
  ` : html`
    <div class="palette">
      ${this.colors.map(color => html`
        <button class="swatch" data-color="${color}" title="${color}"
          style="background: ${color}"
          ?selected="${color === this.targetSpace_()?.color}"
          @click="${this.onColorClick_}"></button>
      `)}
    </div>
    <div class="palette">
      ${this.icons.map(icon => html`
        <button class="glyph" data-icon="${icon}"
          ?selected="${icon === this.targetSpace_()?.icon}"
          @click="${this.onIconClick_}">
          <cr-icon icon="${icon}"></cr-icon>
        </button>
      `)}
    </div>
    <button class="dropdown-item" ?hidden="${this.variant !== 'title'}"
      @click="${this.onRenameClick_}">
      Rename Space
    </button>
    <button class="dropdown-item" ?hidden="${!this.canMove_(-1)}"
      @click="${this.onMoveLeftClick_}">
      Move Left
    </button>
    <button class="dropdown-item" ?hidden="${!this.canMove_(1)}"
      @click="${this.onMoveRightClick_}">
      Move Right
    </button>
    <button class="dropdown-item" ?hidden="${!this.canRemove_()}"
      @click="${this.onRemoveClick_}">
      Delete Space
    </button>
  `}
</cr-action-menu>
<!--_html_template_end_-->`;
  // clang-format on
}
