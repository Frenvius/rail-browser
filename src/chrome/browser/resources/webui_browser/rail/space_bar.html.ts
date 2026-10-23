import {html} from '//resources/lit/v3_0/lit.rollup.js';

import {INCOGNITO} from './sidebar_state.js';
import type {SpaceBarElement} from './space_bar.js';

export function getHtml(this: SpaceBarElement) {
  return html`<!--_html_template_start_-->
${this.variant === 'title' ? html`
  <div id="title" @contextmenu="${this.onNameContextmenu_}">
    ${this.activeIcon_() ? html`
      <button id="glyph" title="Space options" style="--space-color: ${
    this.activeColor_()}" @click="${this.onGlyphClick_}">
        ${this.isGlyphIcon_(this.activeIcon_()) ? html`
          <cr-icon icon="${this.activeIcon_()}"></cr-icon>
        ` : this.activeIcon_()}
      </button>
    ` : ''}
    ${this.editing_ ? html`
      <input id="nameInput" .value="${this.activeName_()}" spellcheck="false"
        @blur="${this.onInputBlur_}" @keydown="${this.onInputKeydown_}">
    ` : html`
      <button id="name" title="Rename space" @click="${this.onNameClick_}">
        ${this.activeName_()}
      </button>
    `}
  </div>
` : INCOGNITO ? '' : html`
  <div id="bar">
    <div id="dots">
      ${this.visibleSpaces_().map(space => html`
        <button class="dot" data-id="${space.id}" title="${space.name}"
          aria-label="Switch to ${space.name}"
          aria-pressed="${space.id === this.activeId}"
          ?compact="${this.compact_}"
          ?selected="${space.id === this.activeId}"
          @click="${this.onDotClick_}"
          @contextmenu="${this.onDotContextmenu_}">
          ${!this.compact_ || space.id === this.activeId ?
    !space.icon ? html`<span class="space-dot"></span>` :
    space.icon.startsWith('cr:') ?
        html`<cr-icon icon="${space.icon}"></cr-icon>` :
        html`<span class="space-icon">${space.icon}</span>` : ''}
        </button>
      `)}
      ${this.hasOverflow_() ? html`
        <button id="more" title="More spaces" aria-label="More spaces"
          @click="${this.onMoreClick_}">
          <cr-icon icon="cr:more-vert"></cr-icon>
        </button>
      ` : ''}
    </div>
    ${this.hasOverflow_() ? '' : html`
      <button id="add" title="New space" aria-label="New space"
        @click="${this.onAddClick_}">
        <cr-icon icon="cr:add"></cr-icon>
      </button>
    `}
  </div>
`}
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
