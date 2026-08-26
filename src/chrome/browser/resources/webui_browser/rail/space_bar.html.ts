import {html} from '//resources/lit/v3_0/lit.rollup.js';

import type {SpaceBarElement} from './space_bar.js';

export function getHtml(this: SpaceBarElement) {
  return html`<!--_html_template_start_-->
${this.variant === 'title' ? html`
  <div id="title" @contextmenu="${this.onNameContextmenu_}">
    <button id="glyph" title="Space options" style="--space-color: ${
    this.activeColor_()}" @click="${this.onGlyphClick_}">
      ${this.isGlyphIcon_(this.activeIcon_()) ? html`
        <cr-icon icon="${this.activeIcon_()}"></cr-icon>
      ` : this.activeIcon_()}
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
  ` : this.picking_ ? html`
    <div id="picker">
      <div class="panelhead">
        <button class="panelback" title="Back"
          @click="${this.onPickerBackClick_}">
          <cr-icon icon="cr:arrow-back"></cr-icon>
        </button>
        <input id="iconSearch" placeholder="Search icons" spellcheck="false"
          .value="${this.iconQuery_}" @input="${this.onIconSearchInput_}"
          @keydown="${this.onIconSearchKeydown_}">
      </div>
      <div id="iconGrid">
        ${this.filteredIcons_().map(([icon, terms]) => html`
          <button class="glyph" data-icon="${icon}" title="${terms}"
            ?selected="${icon === this.targetSpace_()?.icon}"
            @click="${this.onIconClick_}">${icon}</button>
        `)}
      </div>
      <div id="noicons" ?hidden="${this.filteredIcons_().length > 0}">
        No icon matches
      </div>
    </div>
  ` : ''}
</cr-action-menu>
<cr-dialog id="profileDialog">
  <div slot="title">
    <div id="profileMark">
      <cr-icon icon="cr:person"></cr-icon>
    </div>
    Create a new Profile
  </div>
  <div slot="body">
    <p id="profileBlurb">
      A profile keeps a space's browsing to itself: its own cookies, logins and
      site data, so the same site can stay signed in as two different accounts.
    </p>
    <label id="profileLabel" for="profileNameInput">
      What do you want to call this Profile?
    </label>
    <input id="profileNameInput" placeholder="Profile name" spellcheck="false"
      .value="${this.profileName_}" @input="${this.onProfileNameInput_}"
      @keydown="${this.onProfileNameKeydown_}">
  </div>
  <div slot="button-container">
    <cr-button @click="${this.onCancelProfileClick_}">Cancel</cr-button>
    <cr-button class="action-button"
      ?disabled="${!this.profileName_.trim()}"
      @click="${this.onCreateProfileClick_}">
      Create
    </cr-button>
  </div>
</cr-dialog>
<!--_html_template_end_-->`;
  // clang-format on
}
