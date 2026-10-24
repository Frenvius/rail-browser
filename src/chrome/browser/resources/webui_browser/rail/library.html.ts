import {html, repeat} from '//resources/lit/v3_0/lit.rollup.js';

import {folderIcon} from './folder_icon.js';
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
  <header ?hidden="${this.section === 'spaces'}">
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
    <div id="board">
      ${repeat(this.spaces, space => space.id, (space, index) => html`
        <section class="column" data-id="${space.id}"
            aria-label="${space.name}"
            style="--i: ${index}; --space-color: ${this.spaceColor_(space)}"
            ?active="${space.id === this.activeId}"
            ?editing="${space.id === this.editing_}"
            ?drop-target="${space.id === this.dropTarget_}"
            @dragover="${this.onColumnDragover_}"
            @dragleave="${this.onColumnDragleave_}"
            @drop="${this.onColumnDrop_}">
          <div class="column-head" @contextmenu="${this.onColumnContextmenu_}">
            ${this.incognito_() ? html`
              ${space.icon ? html`
                <span class="space-icon">
                  ${this.isGlyph_(space.icon) ? html`
                    <cr-icon icon="${space.icon}"></cr-icon>
                  ` : space.icon}
                </span>
              ` : ''}
              <span class="space-name" title="${space.name}">
                ${space.name}
              </span>
            ` : html`
              <button class="space-icon" title="Change icon"
                  aria-label="Change icon" ?empty="${!space.icon}"
                  @pointerdown="${this.onEditControlPointerdown_}"
                  @click="${this.onIconEditClick_}">
                ${this.isGlyph_(space.icon) ? html`
                  <cr-icon icon="${space.icon}"></cr-icon>
                ` : space.icon}
              </button>
              ${space.id === this.editing_ ? html`
                <input id="nameInput" class="space-name" spellcheck="false"
                    aria-label="Space name" .value="${space.name}"
                    @keydown="${this.onNameKeydown_}"
                    @blur="${this.onNameBlur_}">
              ` : html`
                <button class="space-name" title="Rename ${space.name}"
                    @click="${this.onNameClick_}">${space.name}</button>
              `}
              <button class="profile-badge" title="Change profile"
                  aria-label="Profile: ${this.profileName_(space)}"
                  @click="${this.onProfileBadgeClick_}">
                ${libraryIcon('profile')}
                <span>${this.profileName_(space)}</span>
              </button>
              <button class="action theme" title="Change theme"
                  aria-label="Change theme of ${space.name}"
                  @pointerdown="${this.onEditControlPointerdown_}"
                  @click="${this.onThemeClick_}">
                ${libraryIcon('pencil')}
              </button>
            `}
          </div>
          <div class="column-tabs" @click="${this.onColumnTabsClick_}">
            ${repeat(this.columnRows_(space), row => this.rowKey_(row),
                     row => row.kind === 'tab' ? html`
              <div class="board-tab" data-id="${row.tab.id}"
                  data-key="${space.id}/${this.rowKey_(row)}"
                  data-folder="${row.folder}" data-group="${row.group}"
                  tabindex="0" title="${row.tab.title}" draggable="true"
                  ?nested="${!!(row.folder || row.group)}"
                  ?loose="${row.loose}"
                  @dragover="${this.onRowDragover_}"
                  @drop="${this.onRowDrop_}"
                  ?dragging="${row.tab.id === this.draggedTab_}"
                  @click="${this.onBoardTabClick_}"
                  @keydown="${this.onBoardTabKeydown_}"
                  @dragstart="${this.onBoardTabDragstart_}"
                  @dragend="${this.onBoardTabDragend_}">
                <img class="favicon" alt="" draggable="false"
                    src="${this.tabFavicon_(row.tab)}">
                <span class="title">${row.tab.title}</span>
              </div>
            ` : row.kind === 'folder' ? html`
              <div class="board-folder" data-folder="${row.folder.id}"
                  data-key="${space.id}/${this.rowKey_(row)}"
                  tabindex="0" title="${row.folder.name}"
                  aria-expanded="${row.folder.expanded}"
                  ?drop-target="${row.folder.id === this.dropFolder_}"
                  @click="${this.onBoardFolderClick_}"
                  @keydown="${this.onBoardTabKeydown_}"
                  @contextmenu="${this.onBoardFolderContextmenu_}"
                  @dragover="${this.onFolderDragover_}"
                  @drop="${this.onFolderDrop_}">
                ${folderIcon(row.folder.expanded, false)}
                ${row.folder.id === this.editingFolder_ ? html`
                  <input id="folderInput" class="folder-name"
                      spellcheck="false" aria-label="Folder name"
                      .value="${row.folder.name}"
                      @keydown="${this.onFolderNameKeydown_}"
                      @blur="${this.onFolderNameBlur_}">
                ` : html`
                  <span class="folder-name">${row.folder.name}</span>
                  <span class="folder-count">${row.count}</span>
                `}
              </div>
            ` : row.kind === 'group' ? html`
              <div class="board-folder board-group" data-folder="${row.group.id}"
                  tabindex="0" title="${row.group.name}" draggable="true"
                  aria-expanded="${row.group.expanded}"
                  ?drop-target="${row.group.id === this.dropFolder_}"
                  ?dragging="${row.group.id === this.draggedGroup_}"
                  data-key="${space.id}/${this.rowKey_(row)}"
                  @click="${this.onBoardGroupClick_}"
                  @keydown="${this.onBoardTabKeydown_}"
                  @contextmenu="${this.onBoardGroupContextmenu_}"
                  @dragstart="${this.onBoardGroupDragstart_}"
                  @dragend="${this.onBoardTabDragend_}"
                  @dragover="${this.onGroupDragover_}"
                  @drop="${this.onGroupDrop_}">
                ${row.icon ? html`
                  <img class="favicon" alt="" draggable="false"
                      src="${this.tabFavicon_(row.icon)}">
                ` : libraryIcon('group')}
                ${row.group.id === this.editingFolder_ ? html`
                  <input id="folderInput" class="folder-name"
                      spellcheck="false" aria-label="Group name"
                      .value="${row.group.name}"
                      @keydown="${this.onFolderNameKeydown_}"
                      @blur="${this.onFolderNameBlur_}">
                ` : html`
                  <span class="folder-name">${row.group.name}</span>
                  <span class="folder-count">${row.count}</span>
                `}
                <cr-icon class="group-chevron" icon="cr:keyboard-arrow-down">
                </cr-icon>
              </div>
            ` : html`
              <div class="divider" data-key="${space.id}/${this.rowKey_(row)}">
                <span class="rule"></span>
                <button class="clear" title="Archive today's tabs"
                    @click="${this.onColumnClearClick_}">
                  ${libraryIcon('clear')}
                  Clear
                </button>
              </div>
            `)}
          </div>
          <div class="column-foot">
            ${this.incognito_() ? html`<span></span>` : html`
              <button class="action grip" title="Drag to reorder"
                  aria-label="Reorder ${space.name}"
                  @pointerdown="${this.onGripPointerdown_}">
                ${libraryIcon('grip')}
              </button>
            `}
            <span class="foot-actions">
              ${this.incognito_() ? '' : html`
                <button class="action" title="New folder"
                    aria-label="New folder in ${space.name}"
                    @click="${this.onNewFolderClick_}">
                  ${libraryIcon('folder')}
                </button>
                <button class="action" title="New group"
                    aria-label="New group in ${space.name}"
                    @click="${this.onNewGroupClick_}">
                  ${libraryIcon('group')}
                </button>
              `}
              <button class="action" title="Space options"
                  aria-label="Options for ${space.name}"
                  @click="${this.onSpaceMoreClick_}">
                ${libraryIcon('more')}
              </button>
            </span>
          </div>
        </section>
      `)}
      ${this.incognito_() ? '' : html`
        <button id="addSpace" title="New space" aria-label="New space"
            @click="${this.onNewSpaceClick_}">
          ${libraryIcon('plus')}
        </button>
      `}
    </div>
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
