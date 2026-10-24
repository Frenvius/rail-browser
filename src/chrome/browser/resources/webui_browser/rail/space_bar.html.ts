import {html} from '//resources/lit/v3_0/lit.rollup.js';

import {libraryIcon} from './library_icons.js';
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
  ${this.cardShown_ ? html`
    <div id="card" ?visible="${this.cardVisible_}"
        @pointerenter="${this.onLibraryPointerenter_}"
        @pointerleave="${this.onLibraryPointerleave_}">
      ${this.recent_.map((item, index) => html`
        <div class="card-row" data-id="${item.id}" title="${item.fileName}"
            style="--order: ${this.recent_.length - index}"
            ?removed="${item.fileExternallyRemoved}"
            draggable="${this.canDrag_(item) ? 'true' : 'false'}"
            @click="${this.onCardRowClick_}"
            @dragstart="${this.onCardRowDragstart_}">
          ${this.isMoving_(item) ? html`
            <svg class="card-ring" viewBox="0 0 24 24" aria-hidden="true">
              <circle class="track" cx="12" cy="12" r="10"></circle>
              <circle class="fill" cx="12" cy="12" r="10"
                  stroke-dasharray="${this.ringLength_()}"
                  stroke-dashoffset="${this.cardProgress_(item)}"></circle>
            </svg>
          ` : html`
            <img class="card-icon" alt="" src="${this.cardIcon_(item)}">
          `}
          <div class="card-text">
            <span class="card-name">${item.fileName}</span>
            <span class="card-status">${this.cardStatus_(item)}</span>
          </div>
          ${this.isMoving_(item) ? '' : html`
            <div class="card-actions">
              ${this.canDrag_(item) ? html`
                <button class="card-action" data-id="${item.id}"
                    title="${item.showInFolderText || 'Show in folder'}"
                    @click="${this.onCardShowClick_}">
                  ${libraryIcon('folder')}
                </button>
              ` : ''}
              <button class="card-action" data-id="${item.id}"
                  title="Remove from list" @click="${this.onCardRemoveClick_}">
                ${libraryIcon('close')}
              </button>
            </div>
          `}
        </div>
      `)}
    </div>
  ` : ''}
  <div id="bar">
    <button id="library" title="Library (Ctrl+J)" aria-label="Library"
        @click="${this.onLibraryClick_}"
        @pointerenter="${this.onLibraryPointerenter_}"
        @pointerleave="${this.onLibraryPointerleave_}">
      ${libraryIcon('archive')}
      ${this.progress_ !== null ? html`
        <svg class="ring" viewBox="0 0 24 24" aria-hidden="true"
            ?indeterminate="${this.progress_ < 0}">
          <circle class="track" cx="12" cy="12" r="10"></circle>
          <circle class="fill" cx="12" cy="12" r="10"
              stroke-dasharray="${this.ringLength_()}"
              stroke-dashoffset="${this.ringOffset_()}"></circle>
        </svg>
      ` : ''}
    </button>
    <div id="dots">
      ${this.visibleSpaces_().map(space => html`
        <button class="dot" data-id="${space.id}"
          title="${this.dotTitle_(space)}"
          aria-label="Switch to ${space.name}"
          aria-pressed="${space.id === this.activeId}"
          ?compact="${this.compact_}"
          ?selected="${space.id === this.activeId}"
          @click="${this.onDotClick_}"
          @contextmenu="${this.onDotContextmenu_}"
          @pointerdown="${this.onDotPointerdown_}">
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
