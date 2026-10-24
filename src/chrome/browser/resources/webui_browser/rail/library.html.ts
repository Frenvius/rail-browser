import {html, repeat} from '//resources/lit/v3_0/lit.rollup.js';

import type {RailLibraryElement} from './library.js';
import {LIBRARY_SECTIONS} from './library.js';
import {libraryIcon} from './library_icons.js';

export function getHtml(this: RailLibraryElement) {
  // clang-format off
  return html`<!--_html_template_start_-->
<nav id="sections" aria-label="Library">
  <div id="sectionList">
    <div id="indicator"></div>
    ${LIBRARY_SECTIONS.map((entry, index) => html`
      <button class="section" data-section="${entry.id}"
          style="--i: ${index}"
          aria-pressed="${entry.id === this.section}"
          ?selected="${entry.id === this.section}"
          @click="${this.onSectionClick_}">
        ${libraryIcon(entry.icon)}
        <span>${entry.label}</span>
      </button>
    `)}
  </div>
  <button id="back" title="Back to tabs (Esc)" aria-label="Back to tabs"
      @click="${this.onBackClick_}">
    ${libraryIcon('back')}
  </button>
</nav>
<section id="panel" tabindex="-1" aria-label="${this.sectionLabel_()}"
    @keydown="${this.onPanelKeydown_}">
  <header>
    <h2>${this.sectionLabel_()}</h2>
    ${this.filtering_ ? html`
      <div id="filterPanel" role="group" aria-label="Filter downloads">
        <div class="filter-head">
          <span class="filter-title">Filter downloads</span>
          <button id="filterDone" class="pill"
              @click="${this.onFilterDoneClick_}">Done</button>
        </div>
        <span class="filter-label">Profiles</span>
        <div id="profiles" role="radiogroup" aria-label="Profiles">
          ${this.profileChips_().map((profile, index) => html`
            <button class="chip" role="radio" data-profile="${profile.id}"
                style="--i: ${index}"
                aria-checked="${profile.id === this.filterProfile_}"
                @click="${this.onProfileClick_}">
              ${profile.name}
            </button>
          `)}
        </div>
      </div>
    ` : this.hasSearch_() ? html`
      <div id="searchRow">
        <label id="searchBox">
          ${libraryIcon('search')}
          <input id="search" type="search" spellcheck="false"
              placeholder="${this.searchPlaceholder_()}"
              .value="${this.query_}"
              @input="${this.onSearchInput_}"
              @keydown="${this.onSearchKeydown_}">
          ${this.query_ ? html`
            <button id="searchClear" class="action" title="Clear search"
                aria-label="Clear search" @click="${this.onSearchClearClick_}">
              ${libraryIcon('close')}
            </button>
          ` : ''}
        </label>
        ${this.showFilter_() ? html`
          <button id="filter" class="pill" aria-expanded="false"
              ?applied="${this.filterApplied_()}"
              @click="${this.onFilterClick_}">
            ${libraryIcon('filter')}
            Filter
          </button>
        ` : ''}
      </div>
    ` : ''}
  </header>
  ${this.section === 'downloads' ? html`
    ${this.downloads_.length ? html`
      <div class="list" @scroll="${this.onDownloadsScroll_}">
        ${repeat(this.downloads_, item => item.id, (item, index) => html`
          ${this.downloadHeader_(index) ? html`
            <div class="day">${this.downloadHeader_(index)}</div>
          ` : ''}
          <div class="row download" data-id="${item.id}" tabindex="0"
              style="--i: ${index}"
              ?openable="${this.canOpen_(item)}"
              ?removed="${item.fileExternallyRemoved}"
              ?moving="${this.isMoving_(item)}"
              draggable="${this.canOpen_(item) ? 'true' : 'false'}"
              title="${item.fileName}"
              @click="${this.onDownloadClick_}"
              @keydown="${this.onRowKeydown_}"
              @dragstart="${this.onDownloadDragstart_}">
            <span class="tile">
              <img class="file-icon" alt="" src="${this.fileIcon_(item)}">
            </span>
            <div class="text">
              <span class="title">${item.fileName}</span>
              <span class="detail" ?warning="${this.needsReview_(item)}">
                ${this.downloadStatus_(item)}
              </span>
              ${this.isMoving_(item) ? html`
                <div class="progress" ?paused="${this.isPaused_(item)}"
                    ?indeterminate="${this.indeterminate_(item)}">
                  <div class="bar" style="${this.progressStyle_(item)}"></div>
                </div>
              ` : ''}
            </div>
            <div class="actions">
              ${this.needsReview_(item) ? html`
                <button class="text-action" data-id="${item.id}"
                    @click="${this.onReviewClick_}">Review</button>
                <button class="action remove" data-id="${item.id}"
                    title="Delete" @click="${this.onDiscardClick_}">
                  ${libraryIcon('close')}
                </button>
              ` : this.isMoving_(item) ? html`
                <button class="action" data-id="${item.id}"
                    title="${this.isPaused_(item) ? 'Resume' : 'Pause'}"
                    @click="${this.onPauseClick_}">
                  ${libraryIcon(this.isPaused_(item) ? 'play' : 'pause')}
                </button>
                <button class="action" data-id="${item.id}" title="Cancel"
                    @click="${this.onCancelClick_}">
                  ${libraryIcon('close')}
                </button>
              ` : html`
                ${this.canRetry_(item) ? html`
                  <button class="action" data-id="${item.id}" title="Retry"
                      @click="${this.onRetryClick_}">
                    ${libraryIcon('retry')}
                  </button>
                ` : ''}
                ${this.canOpen_(item) ? html`
                  <button class="action" data-id="${item.id}"
                      title="${item.showInFolderText || 'Show in folder'}"
                      @click="${this.onShowClick_}">
                    ${libraryIcon('folder')}
                  </button>
                ` : ''}
                <button class="action remove" data-id="${item.id}"
                    title="Remove from list"
                    @click="${this.onRemoveDownloadClick_}">
                  ${libraryIcon('close')}
                </button>
              `}
            </div>
          </div>
        `)}
      </div>
      <div class="footer">
        <button class="text-action" @click="${this.onOpenFolderClick_}">
          ${libraryIcon('folder')}
          Open folder
        </button>
        <button class="text-action clear"
            title="Removes every entry. Files stay on disk."
            ?confirming="${this.confirming_ === 'downloads'}"
            @click="${this.onClearClick_}">
          ${this.clearLabel_()}
        </button>
      </div>
    ` : html`
      <div class="empty">
        <span class="empty-icon">${libraryIcon('download')}</span>
        <span class="empty-title">${this.emptyTitle_()}</span>
        <span class="empty-hint">${this.downloadsHint_()}</span>
      </div>
    `}
  ` : this.section === 'spaces' ? html`
    <div class="list">
      ${repeat(this.spaces, space => space.id, (space, index) => html`
        <div class="row space" data-id="${space.id}" tabindex="0"
            style="--i: ${index}; --space-color: ${this.spaceColor_(space)}"
            ?active="${space.id === this.activeId}"
            @click="${this.onSpaceClick_}"
            @keydown="${this.onRowKeydown_}"
            @contextmenu="${this.onSpaceContextmenu_}">
          <span class="space-chip">${this.spaceIcon_(space)}</span>
          <div class="text">
            <span class="title">${space.name}</span>
            <span class="detail">${this.spaceDetail_(space)}</span>
          </div>
          ${space.id === this.activeId ? html`
            <span class="badge">Current</span>
          ` : ''}
          <div class="actions">
            <button class="action" data-id="${space.id}" title="Space options"
                aria-label="Options for ${space.name}"
                @click="${this.onSpaceMoreClick_}">
              ${libraryIcon('more')}
            </button>
          </div>
        </div>
      `)}
    </div>
    ${this.incognito_() ? '' : html`
      <div class="footer">
        <button class="text-action" @click="${this.onNewSpaceClick_}">
          ${libraryIcon('plus')}
          New space
        </button>
      </div>
    `}
  ` : this.days_.length ? html`
    <div class="list">
      ${this.days_.map(day => html`
        <div class="day">${day.label}</div>
        ${repeat(day.tabs, tab => tab.id, (tab, index) => html`
          <div class="row archived" data-id="${tab.id}" tabindex="0"
              style="--i: ${index}" title="${tab.url}"
              @click="${this.onArchivedClick_}"
              @keydown="${this.onRowKeydown_}">
            <span class="tile">
              <img class="favicon" alt="" src="${this.archiveFavicon_(tab)}">
            </span>
            <div class="text">
              <span class="title">${tab.title || tab.url}</span>
              <span class="detail">${this.archiveDetail_(tab)}</span>
            </div>
            <span class="time">${this.archiveTime_(tab)}</span>
            <div class="actions">
              <button class="action remove" data-id="${tab.id}"
                  title="Remove from archive"
                  @click="${this.onArchivedRemoveClick_}">
                ${libraryIcon('close')}
              </button>
            </div>
          </div>
        `)}
      `)}
    </div>
    <div class="footer">
      <span class="count">${this.archiveCount_()}</span>
      <button class="text-action clear"
          ?confirming="${this.confirming_ === 'archive'}"
          @click="${this.onClearClick_}">
        ${this.clearLabel_()}
      </button>
    </div>
  ` : html`
    <div class="empty">
      <span class="empty-icon">${libraryIcon('archive')}</span>
      <span class="empty-title">${this.emptyTitle_()}</span>
      <span class="empty-hint">${this.archiveHint_()}</span>
    </div>
  `}
</section>
<!--_html_template_end_-->`;
  // clang-format on
}
