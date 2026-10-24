import '//resources/cr_elements/cr_icon/cr_icon.js';
import '//resources/cr_elements/icons.html.js';

import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';
import type {PropertyValues} from '//resources/lit/v3_0/lit.rollup.js';

import type {Download} from './downloads.js';
import type {Folder} from './folders.js';
import {downloadsProfile, downloadStatus, DownloadList, DownloadState, fileIconUrl, isMoving, needsReview, onDownloadsRebound} from './downloads.js';
import {formatDisplayUrl} from './format_url.js';
import {getCss} from './library.css.js';
import {getHtml} from './library.html.js';
import type {LibraryIcon} from './library_icons.js';
import {INCOGNITO} from './sidebar_state.js';
import type {FolderSectionOf, PinnedLayout} from './sections.js';
import type {BoardColumn, BoardTab} from './space_board.js';
import type {Space, SpaceProfile} from './spaces.js';
import {DEFAULT_PROFILE_NAME, spaceHex} from './spaces.js';
import type {ArchiveDay, ArchivedTab, ArchiveHours} from './tab_archive.js';
import {archivedTabs, archiveHoursFor, groupByDay, matchArchived} from './tab_archive.js';

export type LibrarySection = 'downloads'|'spaces'|'archive';

export type LibrarySpaceCommand = 'arrange'|'clear'|'create'|'file'|
    'folder-menu'|'group-menu'|'group-tab'|'icon'|'menu'|'move'|'move-group'|
    'new-folder'|'new-group'|'open'|'profile'|'rename'|'rename-folder'|
    'rename-group'|'reorder'|'select'|'theme'|'toggle-folder'|'toggle-group';

export interface LibrarySpaceDetail {
  command: LibrarySpaceCommand;
  id: string;
  tab: string;
  to: string;
  folder: string;
  name: string;
  delta: number;
  x: number;
  y: number;
  ids: string[];
}

export type BoardRow = {
  kind: 'tab',
  tab: BoardTab,
  folder: string,
  group: string,
  loose: boolean,
}|{
  kind: 'folder',
  folder: Folder,
  count: number,
}|{
  kind: 'group',
  group: Folder,
  icon: BoardTab|undefined,
  count: number,
}|{
  kind: 'divider',
};

export interface LibraryChangedDetail {
  open: boolean;
  width: number;
}

interface ColumnDrag {
  id: string;
  pointerId: number;
  startX: number;
  grip: HTMLElement;
  column: HTMLElement;
  columns: HTMLElement[];
  pitch: number;
  from: number;
  to: number;
  moved: boolean;
}

export const LIBRARY_SECTIONS:
    ReadonlyArray<{id: LibrarySection, label: string, icon: LibraryIcon}> = [
      {id: 'downloads', label: 'Downloads', icon: 'download'},
      {id: 'spaces', label: 'Spaces', icon: 'spaces'},
      {id: 'archive', label: 'Archived Tabs', icon: 'archive'},
    ];

const LIBRARY_WIDTH = 400;
const LIBRARY_NAV_WIDTH = 84;
const BOARD_COLUMN_PITCH = 232;
const BOARD_TRAIL = 76;
const DRAG_THRESHOLD = 4;
const TAB_DRAG_TYPE = 'application/x-rail-board-tab';
const GROUP_DRAG_TYPE = 'application/x-rail-board-group';
const ROW_SLIDE_MS = 180;
const EMPTY_COLUMN: BoardColumn = {pinned: [], today: []};
const CONFIRM_MS = 3000;
const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return '';
  }
  if (bytes >= GB) {
    return `${(bytes / GB).toFixed(1)} GB`;
  }
  if (bytes >= MB) {
    return `${(bytes / MB).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / KB))} KB`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function faviconFor(favicon: string, url: string): string {
  return favicon ||
      `chrome://favicon2/?pageUrl=${
             encodeURIComponent(url)}&size=16&scaleFactor=2x`;
}

export class RailLibraryElement extends CrLitElement {
  static get is() {
    return 'rail-library';
  }

  static override get styles() {
    return getCss();
  }

  override render() {
    return getHtml.bind(this)();
  }

  static override get properties() {
    return {
      open: {type: Boolean, reflect: true},
      section: {type: String, reflect: true},
      spaces: {type: Array},
      activeId: {type: String},
      board: {type: Object},
      profiles: {type: Array},
      archiveHours: {type: Object},
      query_: {type: String, state: true},
      downloads_: {type: Array, state: true},
      archived_: {type: Array, state: true},
      days_: {type: Array, state: true},
      filterProfile_: {type: String, state: true},
      confirming_: {type: String, state: true},
      filtering_: {type: Boolean, state: true},
      editing_: {type: String, state: true},
      draggedTab_: {type: String, state: true},
      dropTarget_: {type: String, state: true},
      editingFolder_: {type: String, state: true},
      dropFolder_: {type: String, state: true},
      draggedGroup_: {type: String, state: true},
      dropRow_: {type: String, state: true},
      dropAfter_: {type: Boolean, state: true},
    };
  }

  accessor open = false;
  accessor section: LibrarySection = 'downloads';
  accessor spaces: Space[] = [];
  accessor activeId = '';
  accessor board: Record<string, BoardColumn> = {};
  accessor profiles: SpaceProfile[] = [];
  accessor archiveHours: ArchiveHours = {};
  protected accessor query_ = '';
  protected accessor downloads_: Download[] = [];
  protected accessor archived_: ArchivedTab[] = [];
  protected accessor days_: ArchiveDay[] = [];
  protected accessor filterProfile_ = '';
  protected accessor confirming_ = '';
  protected accessor filtering_ = false;
  protected accessor editing_ = '';
  protected accessor draggedTab_ = '';
  protected accessor dropTarget_ = '';
  protected accessor editingFolder_ = '';
  protected accessor dropFolder_ = '';
  protected accessor draggedGroup_ = '';
  protected accessor dropRow_ = '';
  protected accessor dropAfter_ = false;
  private dropSpace_ = '';
  private dropHeader_ = false;
  private rowTops_: Map<string, number>|null = null;
  private dragSource_ = '';
  private dragFolder_ = '';
  private dragGroup_ = '';
  private columnDrag_: ColumnDrag|null = null;
  private list_: DownloadList|null = null;
  private stopList_: (() => void)|null = null;
  private stopWatching_: Array<() => void> = [];
  private confirmTimer_ = 0;
  private resizeObserver_: ResizeObserver|null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.stopWatching_ = [
      archivedTabs().subscribe(() => this.readArchive_()),
      onDownloadsRebound(() => this.rebindDownloads_()),
    ];
    this.readArchive_();
  }

  override disconnectedCallback() {
    this.stopWatching_.forEach(stop => stop());
    this.stopWatching_ = [];
    this.releaseDownloads_();
    this.resizeObserver_?.disconnect();
    this.resizeObserver_ = null;
    clearTimeout(this.confirmTimer_);
    super.disconnectedCallback();
  }

  private rebindDownloads_() {
    if (this.open && this.section === 'downloads') {
      this.watchDownloads_();
    }
  }

  private releaseDownloads_() {
    this.stopList_?.();
    this.stopList_ = null;
    this.list_?.close();
    this.list_ = null;
  }

  override willUpdate(changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties);
    if (changedProperties.has('open') && this.open) {
      this.filterProfile_ = this.spaceProfile_();
    }
    if (changedProperties.has('section') || changedProperties.has('open')) {
      this.query_ = '';
      this.filtering_ = false;
      this.editing_ = '';
      this.editingFolder_ = '';
      this.setConfirming_('');
    }
    if (changedProperties.has('open') && !this.open) {
      this.releaseDownloads_();
    }
    if ((changedProperties.has('open') || changedProperties.has('section')) &&
        this.open && this.section === 'downloads') {
      this.watchDownloads_();
    }
    const changedPrivateProperties =
        changedProperties as Map<PropertyKey, unknown>;
    if (changedProperties.has('section') ||
        changedPrivateProperties.has('archived_') ||
        changedPrivateProperties.has('query_')) {
      this.days_ =
          groupByDay(matchArchived(this.archived_, this.query_), Date.now());
    }
    if (this.open && this.section === 'spaces' &&
        (changedProperties.has('board') ||
         changedPrivateProperties.has('dropRow_') ||
         changedPrivateProperties.has('dropAfter_'))) {
      this.rowTops_ = this.measureRows_();
    }
  }

  private measureRows_(): Map<string, number> {
    const tops = new Map<string, number>();
    for (const row of this.shadowRoot.querySelectorAll<HTMLElement>(
             '.column-tabs > [data-key]')) {
      tops.set(row.dataset['key']!, row.getBoundingClientRect().top);
    }
    return tops;
  }

  private slideRows_() {
    const before = this.rowTops_;
    this.rowTops_ = null;
    if (!before?.size ||
        matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    for (const row of this.shadowRoot.querySelectorAll<HTMLElement>(
             '.column-tabs > [data-key]')) {
      row.getAnimations().forEach(animation => animation.cancel());
      const top = before.get(row.dataset['key']!);
      const shift = top === undefined ? 0 : top - row.getBoundingClientRect().top;
      if (Math.abs(shift) >= 1) {
        row.animate(
            [{transform: `translateY(${shift}px)`}, {transform: 'none'}],
            {duration: ROW_SLIDE_MS, easing: 'cubic-bezier(.2, 0, 0, 1)'});
      }
    }
  }

  override firstUpdated() {
    this.resizeObserver_ = new ResizeObserver(() => this.placeIndicator_(false));
    this.resizeObserver_.observe(
        this.shadowRoot.querySelector<HTMLElement>('#sectionList')!);
  }

  override updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);
    this.slideRows_();
    if (changedProperties.has('section') || changedProperties.has('open') ||
        changedProperties.has('spaces')) {
      this.fire<LibraryChangedDetail>(
          'rail-library-changed',
          {open: this.open, width: this.desiredWidth_()});
    }
    if (changedProperties.has('section') || changedProperties.has('open')) {
      this.placeIndicator_(!changedProperties.has('open'));
    }
    if (changedProperties.has('open') && this.open) {
      this.readArchive_();
      (this.shadowRoot.querySelector<HTMLElement>('#search') ??
       this.shadowRoot.querySelector<HTMLElement>('#panel'))
          ?.focus();
    }
    const changedPrivateProperties =
        changedProperties as Map<PropertyKey, unknown>;
    if (this.open && !changedProperties.has('open') &&
        changedPrivateProperties.get('filtering_') !== undefined) {
      this.shadowRoot
          .querySelector<HTMLElement>(
              this.filtering_ ? '.chip[aria-checked="true"]' : '#filter')
          ?.focus();
    }
  }

  private placeIndicator_(animate: boolean) {
    const button =
        this.shadowRoot.querySelector<HTMLElement>('.section[selected]');
    const indicator = this.shadowRoot.querySelector<HTMLElement>('#indicator');
    if (!button || !indicator) {
      return;
    }
    indicator.toggleAttribute('instant', !animate);
    indicator.style.transform = `translateY(${button.offsetTop}px)`;
    indicator.style.height = `${button.offsetHeight}px`;
  }

  private desiredWidth_(): number {
    if (this.section !== 'spaces') {
      return LIBRARY_WIDTH;
    }
    return LIBRARY_NAV_WIDTH + this.spaces.length * BOARD_COLUMN_PITCH +
        BOARD_TRAIL;
  }

  private spaceProfile_(): string {
    return this.spaces.find(space => space.id === this.activeId)?.profile ??
        '';
  }

  protected showProfiles_(): boolean {
    return !INCOGNITO && this.profiles.length > 0;
  }

  protected profileChips_(): SpaceProfile[] {
    return [{id: '', name: DEFAULT_PROFILE_NAME}, ...this.profiles];
  }

  protected showFilter_(): boolean {
    return this.section === 'downloads' && this.showProfiles_();
  }

  protected filterApplied_(): boolean {
    return this.filterProfile_ !== this.spaceProfile_();
  }

  protected onFilterClick_() {
    this.filtering_ = true;
  }

  protected onFilterDoneClick_() {
    this.filtering_ = false;
  }

  protected onProfileClick_(e: Event) {
    const profile = (e.currentTarget as HTMLElement).dataset['profile'] ?? '';
    if (profile === this.filterProfile_) {
      return;
    }
    this.filterProfile_ = profile;
    this.setConfirming_('');
    this.watchDownloads_();
  }

  protected sectionLabel_(): string {
    return LIBRARY_SECTIONS.find(entry => entry.id === this.section)?.label ??
        '';
  }

  protected hasSearch_(): boolean {
    return this.section !== 'spaces';
  }

  protected searchPlaceholder_(): string {
    return this.section === 'downloads' ? 'Search downloads' :
                                          'Search archived tabs';
  }

  protected onSectionClick_(e: Event) {
    const section =
        (e.currentTarget as HTMLElement).dataset['section'] as LibrarySection;
    this.fire('rail-library-section', {section});
  }

  protected onBackClick_() {
    this.fire('rail-library-close');
  }

  protected onPanelKeydown_(e: KeyboardEvent) {
    if (e.key !== 'Escape') {
      return;
    }
    e.stopPropagation();
    if (this.filtering_) {
      this.filtering_ = false;
      return;
    }
    if (this.query_) {
      this.setQuery_('');
      return;
    }
    this.fire('rail-library-close');
  }

  protected onSearchInput_(e: Event) {
    this.setQuery_((e.target as HTMLInputElement).value);
  }

  protected onSearchKeydown_(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.shadowRoot.querySelector<HTMLElement>('.list .row')?.focus();
      return;
    }
    this.onPanelKeydown_(e);
  }

  protected onSearchClearClick_() {
    this.setQuery_('');
    this.shadowRoot.querySelector<HTMLElement>('#search')?.focus();
  }

  protected onRowKeydown_(e: KeyboardEvent) {
    const row = e.currentTarget as HTMLElement;
    if (e.target !== row) {
      return;
    }
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        row.click();
        return;
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        const rows =
            [...this.shadowRoot.querySelectorAll<HTMLElement>('.list .row')];
        const next = rows[rows.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1)];
        (next ?? this.shadowRoot.querySelector<HTMLElement>('#search'))
            ?.focus();
        return;
      }
      case 'Delete':
        row.querySelector<HTMLElement>('.remove')?.click();
        return;
      default:
        return;
    }
  }

  private setQuery_(query: string) {
    this.query_ = query;
    if (this.section === 'downloads') {
      this.watchDownloads_();
    }
  }

  private activeList_(): DownloadList {
    if (!this.query_ && this.filterProfile_ === downloadsProfile()) {
      this.list_?.close();
      this.list_ = null;
      return downloadStatus();
    }
    let list = this.list_;
    if (list?.profile !== this.filterProfile_) {
      list?.close();
      list = new DownloadList(this.filterProfile_);
      this.list_ = list;
    }
    list.search(this.query_);
    return list;
  }

  private watchDownloads_() {
    const list = this.activeList_();
    this.stopList_?.();
    this.stopList_ = list.subscribe(() => this.downloads_ = [...list.items]);
    this.downloads_ = [...list.items];
  }

  private readArchive_() {
    this.archived_ = archivedTabs().list();
  }

  protected incognito_(): boolean {
    return INCOGNITO;
  }

  protected downloadHeader_(index: number): string {
    const item = this.downloads_[index]!;
    const label = item.sinceString || item.dateString;
    const previous = this.downloads_[index - 1];
    const before =
        previous ? previous.sinceString || previous.dateString : undefined;
    return label !== before ? label : '';
  }

  protected downloadStatus_(item: Download): string {
    if (needsReview(item)) {
      return item.isInsecure ? 'Blocked: insecure download' :
                               'Blocked: may be dangerous';
    }
    switch (item.state) {
      case DownloadState.kInProgress:
        return item.progressStatusText || 'Starting';
      case DownloadState.kPaused:
        return item.progressStatusText ?
            `Paused, ${item.progressStatusText}` :
            'Paused';
      case DownloadState.kAsyncScanning:
        return 'Checking file';
      case DownloadState.kCancelled:
        return 'Canceled';
      case DownloadState.kInterrupted:
        return item.lastReasonText || 'Failed';
      default:
        break;
    }
    if (item.fileExternallyRemoved) {
      return 'Deleted';
    }
    return [formatBytes(Number(item.total)), hostOf(item.url ?? '')]
        .filter(Boolean)
        .join(' · ');
  }

  protected fileIcon_(item: Download): string {
    return fileIconUrl(item);
  }

  protected isMoving_(item: Download): boolean {
    return isMoving(item) || item.state === DownloadState.kPaused;
  }

  protected needsReview_(item: Download): boolean {
    return needsReview(item);
  }

  protected canOpen_(item: Download): boolean {
    return item.state === DownloadState.kComplete &&
        !item.fileExternallyRemoved;
  }

  protected canRetry_(item: Download): boolean {
    return item.retry && (item.state === DownloadState.kInterrupted ||
                          item.state === DownloadState.kCancelled);
  }

  protected isPaused_(item: Download): boolean {
    return item.state === DownloadState.kPaused;
  }

  protected progressStyle_(item: Download): string {
    return item.percent < 0 ? '' : `width: ${item.percent}%`;
  }

  protected indeterminate_(item: Download): boolean {
    return item.percent < 0;
  }

  private idOf_(e: Event): string {
    return (e.currentTarget as HTMLElement).dataset['id'] ?? '';
  }

  private handler_() {
    return this.activeList_().handler;
  }

  protected onDownloadClick_(e: Event) {
    const id = this.idOf_(e);
    const item = this.downloads_.find(one => one.id === id);
    if (item && this.canOpen_(item)) {
      this.handler_().openFileRequiringGesture(id);
    }
  }

  protected onDownloadDragstart_(e: DragEvent) {
    e.preventDefault();
    this.handler_().drag(this.idOf_(e));
  }

  protected onShowClick_(e: Event) {
    e.stopPropagation();
    this.handler_().show(this.idOf_(e));
  }

  protected onPauseClick_(e: Event) {
    e.stopPropagation();
    const id = this.idOf_(e);
    const item = this.downloads_.find(one => one.id === id);
    if (item?.state === DownloadState.kPaused) {
      this.handler_().resume(id);
    } else {
      this.handler_().pause(id);
    }
  }

  protected onCancelClick_(e: Event) {
    e.stopPropagation();
    this.handler_().cancel(this.idOf_(e));
  }

  protected onRetryClick_(e: Event) {
    e.stopPropagation();
    this.handler_().retryDownload(this.idOf_(e));
  }

  protected onRemoveDownloadClick_(e: Event) {
    e.stopPropagation();
    this.handler_().remove(this.idOf_(e));
  }

  protected onDiscardClick_(e: Event) {
    e.stopPropagation();
    this.handler_().discardDangerous(this.idOf_(e));
  }

  protected onReviewClick_(e: Event) {
    e.stopPropagation();
    this.fire('rail-library-open-url', {url: 'chrome://downloads'});
  }

  protected onOpenFolderClick_() {
    this.handler_().openDownloadsFolderRequiringGesture();
  }

  protected onClearClick_() {
    if (this.confirming_ !== this.section) {
      this.setConfirming_(this.section);
      return;
    }
    this.setConfirming_('');
    if (this.section === 'downloads') {
      this.handler_().clearAll();
    } else {
      archivedTabs().clear();
    }
  }

  private setConfirming_(section: string) {
    clearTimeout(this.confirmTimer_);
    this.confirming_ = section;
    if (section) {
      this.confirmTimer_ =
          setTimeout(() => this.confirming_ = '', CONFIRM_MS);
    }
  }

  protected clearLabel_(): string {
    return this.confirming_ === this.section ? 'Click again to clear' :
                                               'Clear all';
  }

  protected emptyTitle_(): string {
    if (this.query_) {
      return `Nothing matches "${this.query_.trim()}"`;
    }
    return this.section === 'downloads' ? 'No downloads yet' :
                                          'No archived tabs';
  }

  protected downloadsHint_(): string {
    if (this.query_) {
      return 'Try a file name or a site.';
    }
    if (!this.showProfiles_()) {
      return 'Files you download show up here.';
    }
    const name =
        this.profileChips_().find(one => one.id === this.filterProfile_)
            ?.name ??
        DEFAULT_PROFILE_NAME;
    return `Files you download in ${name} show up here.`;
  }

  protected onDownloadsScroll_(e: Event) {
    const list = e.currentTarget as HTMLElement;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 48) {
      this.activeList_().loadMore();
    }
  }

  editSpace(id: string) {
    void this.startEditing_(id);
  }

  protected isGlyph_(icon: string): boolean {
    return icon.startsWith('cr:');
  }

  protected spaceColor_(space: Space): string {
    return spaceHex(space.color);
  }

  editFolder(id: string) {
    void this.startEditingFolder_(id);
  }

  protected columnRows_(space: Space): BoardRow[] {
    const {pinned} = this.board[space.id] ?? EMPTY_COLUMN;
    const today = this.previewToday_(space.id);
    const tabRow = (tab: BoardTab, folder = '', group = '', loose = false) =>
        ({kind: 'tab' as const, tab, folder, group, loose});
    const rows = pinned.flatMap((entry): BoardRow[] => {
      if (entry.kind === 'row') {
        return [tabRow(entry.row)];
      }
      const {folder, rows: tabs} = entry.section;
      return [
        {kind: 'folder', folder, count: tabs.length},
        ...folder.expanded ? tabs.map(tab => tabRow(tab, folder.id)) : [],
      ];
    });
    const loose = today.flatMap((entry): BoardRow[] => {
      if (entry.kind === 'row') {
        return [tabRow(entry.row, '', '', true)];
      }
      const {folder: group, rows: tabs} = entry.section;
      return [
        {kind: 'group', group, icon: tabs[0], count: tabs.length},
        ...group.expanded ?
            tabs.map(tab => tabRow(tab, '', group.id, true)) :
            [],
      ];
    });
    return loose.length ? [...rows, {kind: 'divider'}, ...loose] : rows;
  }

  private isGroup_(id: string): boolean {
    return Object.values(this.board).some(
        column => column.today.some(
            entry => entry.kind === 'folder' && entry.section.folder.id === id));
  }

  protected profileName_(space: Space): string {
    return this.profileChips_().find(one => one.id === space.profile)?.name ??
        DEFAULT_PROFILE_NAME;
  }

  protected tabFavicon_(tab: BoardTab): string {
    return faviconFor(tab.favicon, tab.url);
  }

  private spaceOf_(e: Event): string {
    return (e.currentTarget as HTMLElement)
               .closest<HTMLElement>('.column')
               ?.dataset['id'] ??
        '';
  }

  private anchorOf_(e: Event): {x: number, y: number} {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {x: Math.round(rect.left), y: Math.round(rect.bottom)};
  }

  protected onBoardTabClick_(e: Event) {
    this.fireSpace_('open', this.spaceOf_(e), {tab: this.idOf_(e)});
  }

  protected onBoardTabKeydown_(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  }

  protected onColumnTabsClick_(e: Event) {
    if (e.target === e.currentTarget) {
      this.fireSpace_('select', this.spaceOf_(e));
    }
  }

  protected onColumnClearClick_(e: Event) {
    this.fireSpace_('clear', this.spaceOf_(e));
  }

  protected onColumnContextmenu_(e: MouseEvent) {
    e.preventDefault();
    this.fireSpace_(
        'menu', this.spaceOf_(e), {x: e.clientX, y: e.clientY});
  }

  protected onSpaceMoreClick_(e: Event) {
    this.fireSpace_('menu', this.spaceOf_(e), this.anchorOf_(e));
  }

  protected onProfileBadgeClick_(e: Event) {
    this.fireSpace_('profile', this.spaceOf_(e), this.anchorOf_(e));
  }

  protected onIconEditClick_(e: Event) {
    this.fireSpace_('icon', this.spaceOf_(e), this.anchorOf_(e));
  }

  protected onNewSpaceClick_() {
    this.fireSpace_('create', '');
  }

  protected onNewFolderClick_(e: Event) {
    this.fireSpace_('new-folder', this.spaceOf_(e));
  }

  protected onNewGroupClick_(e: Event) {
    this.fireSpace_('new-group', this.spaceOf_(e));
  }

  private folderOf_(e: Event): string {
    return (e.currentTarget as HTMLElement).dataset['folder'] ?? '';
  }

  protected onBoardFolderClick_(e: Event) {
    const folder = this.folderOf_(e);
    if (folder !== this.editingFolder_) {
      this.fireSpace_('toggle-folder', this.spaceOf_(e), {folder});
    }
  }

  protected onBoardFolderContextmenu_(e: MouseEvent) {
    e.preventDefault();
    if (INCOGNITO) {
      return;
    }
    this.fireSpace_(
        'folder-menu', this.spaceOf_(e),
        {folder: this.folderOf_(e), x: e.clientX, y: e.clientY});
  }

  protected onBoardGroupClick_(e: Event) {
    const folder = this.folderOf_(e);
    if (folder !== this.editingFolder_) {
      this.fireSpace_('toggle-group', this.spaceOf_(e), {folder});
    }
  }

  protected onBoardGroupContextmenu_(e: MouseEvent) {
    e.preventDefault();
    if (INCOGNITO) {
      return;
    }
    this.fireSpace_('group-menu', this.spaceOf_(e), {folder: this.folderOf_(e)});
  }

  protected onFolderNameKeydown_(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      this.stopEditingFolder_(true);
    } else if (e.key === 'Escape') {
      this.stopEditingFolder_(false);
    }
  }

  protected onFolderNameBlur_() {
    this.stopEditingFolder_(true);
  }

  private async startEditingFolder_(id: string) {
    if (INCOGNITO || !id) {
      return;
    }
    this.editingFolder_ = id;
    await this.updateComplete;
    const input =
        this.shadowRoot.querySelector<HTMLInputElement>('#folderInput');
    input?.scrollIntoView({block: 'nearest', inline: 'nearest'});
    input?.focus();
    input?.select();
  }

  private stopEditingFolder_(commit: boolean) {
    const folder = this.editingFolder_;
    if (!folder) {
      return;
    }
    const name =
        this.shadowRoot.querySelector<HTMLInputElement>('#folderInput')
            ?.value ??
        '';
    this.editingFolder_ = '';
    if (commit && name.trim()) {
      this.fireSpace_(
          this.isGroup_(folder) ? 'rename-group' : 'rename-folder', '',
          {folder, name});
    }
  }

  protected onEditControlPointerdown_(e: PointerEvent) {
    e.preventDefault();
  }

  protected onThemeClick_(e: Event) {
    this.fireSpace_('theme', this.spaceOf_(e), this.anchorOf_(e));
  }

  protected onNameClick_(e: Event) {
    this.stopEditing_(true);
    void this.startEditing_(this.spaceOf_(e));
  }

  protected onNameKeydown_(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      this.stopEditing_(true);
    } else if (e.key === 'Escape') {
      this.stopEditing_(false);
    }
  }

  protected onNameBlur_() {
    this.stopEditing_(true);
  }

  private async startEditing_(id: string) {
    if (INCOGNITO || !id) {
      return;
    }
    this.editing_ = id;
    await this.updateComplete;
    this.shadowRoot.querySelector(`.column[data-id="${id}"]`)
        ?.scrollIntoView({block: 'nearest', inline: 'nearest'});
    const input = this.shadowRoot.querySelector<HTMLInputElement>('#nameInput');
    input?.focus();
    input?.select();
  }

  private stopEditing_(commit: boolean) {
    const id = this.editing_;
    if (!id) {
      return;
    }
    const name =
        this.shadowRoot.querySelector<HTMLInputElement>('#nameInput')?.value ??
        '';
    this.editing_ = '';
    if (commit && name.trim()) {
      this.fireSpace_('rename', id, {name});
    }
  }

  protected onBoardTabDragstart_(e: DragEvent) {
    e.stopPropagation();
    const id = this.idOf_(e);
    if (INCOGNITO || !e.dataTransfer) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(TAB_DRAG_TYPE, id);
    this.dragSource_ = this.spaceOf_(e);
    this.dragFolder_ = this.folderOf_(e);
    this.dragGroup_ = (e.currentTarget as HTMLElement).dataset['group'] ?? '';
    this.draggedTab_ = id;
  }

  protected onBoardGroupDragstart_(e: DragEvent) {
    e.stopPropagation();
    const group = this.folderOf_(e);
    if (INCOGNITO || !e.dataTransfer || group === this.editingFolder_) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(GROUP_DRAG_TYPE, group);
    this.dragSource_ = this.spaceOf_(e);
    this.draggedGroup_ = group;
  }

  protected onBoardTabDragend_() {
    this.dragSource_ = '';
    this.dragFolder_ = '';
    this.dragGroup_ = '';
    this.draggedTab_ = '';
    this.draggedGroup_ = '';
    this.dropRow_ = '';
    this.dropTarget_ = '';
    this.dropFolder_ = '';
  }

  protected onColumnDragover_(e: DragEvent) {
    if (!this.draggedTab_ && !this.draggedGroup_) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const space = this.spaceOf_(e);
    if (this.dropRow_ && this.dropSpace_ === space) {
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      return;
    }
    const accepts = space !== this.dragSource_ ||
        (!!this.draggedTab_ && (!!this.dragFolder_ || !!this.dragGroup_));
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = accepts ? 'move' : 'none';
    }
    this.dropTarget_ = accepts ? space : '';
    this.dropFolder_ = '';
    this.dropRow_ = '';
  }

  protected onFolderDragover_(e: DragEvent) {
    if (!this.draggedTab_) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const folder = this.folderOf_(e);
    const accepts = folder !== this.dragFolder_;
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = accepts ? 'move' : 'none';
    }
    this.dropTarget_ = '';
    this.dropRow_ = '';
    this.dropFolder_ = accepts ? folder : '';
  }

  protected onFolderDrop_(e: DragEvent) {
    if (!this.draggedTab_) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const folder = this.folderOf_(e);
    const tab = this.draggedTab_;
    const from = this.dragFolder_;
    const to = this.spaceOf_(e);
    this.onBoardTabDragend_();
    if (tab && folder !== from) {
      this.fireSpace_('file', to, {tab, to, folder});
    }
  }

  protected onGroupDragover_(e: DragEvent) {
    if (this.draggedGroup_) {
      this.onRowDragover_(e);
      return;
    }
    if (!this.draggedTab_) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const group = this.folderOf_(e);
    const accepts = group !== this.dragGroup_;
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = accepts ? 'move' : 'none';
    }
    this.dropTarget_ = '';
    this.dropRow_ = '';
    this.dropFolder_ = accepts ? group : '';
  }

  protected onGroupDrop_(e: DragEvent) {
    if (this.draggedGroup_) {
      this.onRowDrop_(e);
      return;
    }
    if (!this.draggedTab_) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const folder = this.folderOf_(e);
    const tab = this.draggedTab_;
    const from = this.dragGroup_;
    const to = this.spaceOf_(e);
    this.onBoardTabDragend_();
    if (folder !== from) {
      this.fireSpace_('group-tab', to, {tab, to, folder});
    }
  }

  private rowSlot_(e: Event): string {
    const row = e.currentTarget as HTMLElement;
    if (row.classList.contains('board-group')) {
      return row.dataset['folder'] ?? '';
    }
    return row.hasAttribute('loose') ? row.dataset['id'] ?? '' : '';
  }

  protected onRowDragover_(e: DragEvent) {
    const target = this.rowSlot_(e);
    if ((!this.draggedTab_ && !this.draggedGroup_) || !target ||
        target === this.draggedTab_ || target === this.draggedGroup_ ||
        (!!this.draggedGroup_ &&
         (e.currentTarget as HTMLElement).dataset['group'] ===
             this.draggedGroup_)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    const row = e.currentTarget as HTMLElement;
    const header = row.classList.contains('board-group');
    const space = this.spaceOf_(e);
    const slots = this.looseSlots_(space);
    const from = this.draggedGroup_ ?
        slots.findIndex(slot => slot.group === this.draggedGroup_) :
        slots.findIndex(slot => slot.id === this.draggedTab_);
    const to = slots.findIndex(
        slot => header ? slot.group === target : slot.id === target);
    const rect = row.getBoundingClientRect();
    this.dropTarget_ = '';
    this.dropFolder_ = '';
    this.dropSpace_ = space;
    this.dropHeader_ = header;
    this.dropRow_ = target;
    this.dropAfter_ = from >= 0 && to >= 0 ?
        to > from :
        e.clientY > rect.top + rect.height / 2;
  }

  protected onRowDrop_(e: DragEvent) {
    if (!this.dropRow_ || (!this.draggedTab_ && !this.draggedGroup_)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.commitArrange_();
  }

  private commitArrange_() {
    const space = this.dropSpace_;
    const tab = this.draggedTab_;
    const group = this.draggedGroup_;
    const {ids, joins} =
        this.dropOrder_(space, this.dropRow_, this.dropHeader_);
    this.fireSpace_(
        'arrange', space, {tab, to: space, folder: group || joins, ids});
    this.onBoardTabDragend_();
  }

  private previewToday_(space: string): Array<PinnedLayout<BoardTab>> {
    const today = this.board[space]?.today ?? [];
    if (!this.dropRow_ || this.dropSpace_ !== space) {
      return today;
    }
    const tabs = new Map<string, BoardTab>();
    const groups = new Map<string, Folder>();
    const groupOf = new Map<string, string>();
    for (const column of [this.board[space], this.board[this.dragSource_]]) {
      for (const entry of column?.pinned ?? []) {
        for (const tab of entry.kind === 'row' ? [entry.row] :
                                                 entry.section.rows) {
          tabs.set(tab.id, tab);
        }
      }
      for (const entry of column?.today ?? []) {
        if (entry.kind === 'row') {
          tabs.set(entry.row.id, entry.row);
          continue;
        }
        groups.set(entry.section.folder.id, entry.section.folder);
        for (const tab of entry.section.rows) {
          tabs.set(tab.id, tab);
          groupOf.set(tab.id, entry.section.folder.id);
        }
      }
    }
    const {ids, joins} =
        this.dropOrder_(space, this.dropRow_, this.dropHeader_);
    if (this.draggedTab_) {
      groupOf.set(this.draggedTab_, joins);
    }
    const layout: Array<PinnedLayout<BoardTab>> = [];
    const sections = new Map<string, FolderSectionOf<BoardTab>>();
    for (const id of ids) {
      const tab = tabs.get(id);
      const group = groups.get(groupOf.get(id) ?? '');
      if (!tab) {
        continue;
      }
      if (!group) {
        layout.push({kind: 'row', row: tab});
        continue;
      }
      let section = sections.get(group.id);
      if (!section) {
        section = {folder: group, rows: []};
        sections.set(group.id, section);
        layout.push({kind: 'folder', section});
      }
      section.rows.push(tab);
    }
    for (const entry of today) {
      if (entry.kind === 'folder' && !sections.has(entry.section.folder.id)) {
        layout.push(entry);
      }
    }
    return layout;
  }

  protected rowKey_(row: BoardRow): string {
    switch (row.kind) {
      case 'tab':
        return `${row.loose ? 'loose' : 'pinned'}:${row.tab.id}`;
      case 'folder':
        return `folder:${row.folder.id}`;
      case 'group':
        return `group:${row.group.id}`;
      default:
        return 'divider';
    }
  }

  private looseSlots_(space: string): Array<{id: string, group: string}> {
    return (this.board[space]?.today ?? [])
        .flatMap(entry => entry.kind === 'row' ?
                     [{id: entry.row.id, group: ''}] :
                     entry.section.rows.map(
                         tab => ({id: tab.id, group: entry.section.folder.id})));
  }

  private dropOrder_(space: string, target: string, header: boolean):
      {ids: string[], joins: string} {
    const group = this.draggedGroup_;
    const moving = group ?
        this.looseSlots_(this.dragSource_).filter(slot => slot.group === group) :
        [{id: this.draggedTab_, group: ''}];
    const movingIds = new Set(moving.map(slot => slot.id));
    const rest =
        this.looseSlots_(space).filter(slot => !movingIds.has(slot.id));
    const targetGroup = header ?
        target :
        rest.find(slot => slot.id === target)?.group ?? '';
    const spans = (slot: {id: string, group: string}) =>
        header || (group && targetGroup) ? slot.group === targetGroup :
                                           slot.id === target;
    const hits = rest.flatMap((slot, index) => spans(slot) ? [index] : []);
    const index = !hits.length ? rest.length :
        this.dropAfter_        ? hits[hits.length - 1]! + 1 :
                                 hits[0]!;
    return {
      ids: [...rest.slice(0, index), ...moving, ...rest.slice(index)].map(
          slot => slot.id),
      joins: header ? '' : targetGroup,
    };
  }

  protected onColumnDragleave_(e: DragEvent) {
    const column = e.currentTarget as HTMLElement;
    if (column.contains(e.relatedTarget as Node | null)) {
      return;
    }
    this.dropFolder_ = '';
    this.dropRow_ = '';
    if (this.dropTarget_ === column.dataset['id']) {
      this.dropTarget_ = '';
    }
  }

  protected onColumnDrop_(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const to = this.spaceOf_(e);
    if (this.dropRow_ && this.dropSpace_ === to) {
      this.commitArrange_();
      return;
    }
    const tab = this.draggedTab_;
    const group = this.draggedGroup_;
    const from = this.dragSource_;
    const filed = !!this.dragFolder_;
    const grouped = !!this.dragGroup_;
    this.onBoardTabDragend_();
    if (group && to && to !== from) {
      this.fireSpace_('move-group', from, {folder: group, to});
    }
    if (!tab || !to) {
      return;
    }
    if (to !== from) {
      this.fireSpace_('move', from, {tab, to});
    } else if (filed) {
      this.fireSpace_('file', to, {tab, to, folder: ''});
    } else if (grouped) {
      this.fireSpace_('group-tab', to, {tab, to, folder: ''});
    }
  }

  protected onGripPointerdown_(e: PointerEvent) {
    if (e.button !== 0 || INCOGNITO || this.columnDrag_ ||
        this.spaces.length < 2) {
      return;
    }
    e.preventDefault();
    const grip = e.currentTarget as HTMLElement;
    const column = grip.closest<HTMLElement>('.column')!;
    const columns =
        [...this.shadowRoot.querySelectorAll<HTMLElement>('.column')];
    const from = columns.indexOf(column);
    this.columnDrag_ = {
      id: column.dataset['id'] ?? '',
      pointerId: e.pointerId,
      startX: e.clientX,
      grip,
      column,
      columns,
      pitch: columns[1]!.offsetLeft - columns[0]!.offsetLeft,
      from,
      to: from,
      moved: false,
    };
    grip.setPointerCapture(e.pointerId);
    grip.addEventListener('pointermove', this.onColumnDragMove_);
    grip.addEventListener('pointerup', this.onColumnDragEnd_);
    grip.addEventListener('pointercancel', this.onColumnDragEnd_);
  }

  private onColumnDragMove_ = (e: PointerEvent) => {
    const drag = this.columnDrag_;
    if (!drag || e.pointerId !== drag.pointerId) {
      return;
    }
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD) {
        return;
      }
      drag.moved = true;
      drag.column.toggleAttribute('lifted', true);
    }
    const last = drag.columns.length - 1;
    const offset = Math.min(
        (last - drag.from) * drag.pitch,
        Math.max(-drag.from * drag.pitch, e.clientX - drag.startX));
    drag.column.style.transform = `translateX(${offset}px)`;
    drag.to = Math.min(
        last, Math.max(0, Math.round(drag.from + offset / drag.pitch)));
    drag.columns.forEach((column, index) => {
      if (index === drag.from) {
        return;
      }
      const shift = index > drag.from && index <= drag.to ? -drag.pitch :
          index < drag.from && index >= drag.to           ? drag.pitch :
                                                            0;
      column.style.transform = shift ? `translateX(${shift}px)` : '';
    });
  };

  private onColumnDragEnd_ = async (e: PointerEvent) => {
    const drag = this.columnDrag_;
    if (!drag || e.pointerId !== drag.pointerId) {
      return;
    }
    this.columnDrag_ = null;
    drag.grip.removeEventListener('pointermove', this.onColumnDragMove_);
    drag.grip.removeEventListener('pointerup', this.onColumnDragEnd_);
    drag.grip.removeEventListener('pointercancel', this.onColumnDragEnd_);
    if (drag.grip.hasPointerCapture(e.pointerId)) {
      drag.grip.releasePointerCapture(e.pointerId);
    }
    if (!drag.moved) {
      return;
    }
    const dropX = drag.column.getBoundingClientRect().left;
    const board = this.shadowRoot.querySelector<HTMLElement>('#board');
    board?.toggleAttribute('settling', true);
    drag.column.removeAttribute('lifted');
    for (const column of drag.columns) {
      column.style.transform = '';
    }
    if (e.type === 'pointerup' && drag.to !== drag.from) {
      const order = [...this.spaces];
      const [moved] = order.splice(drag.from, 1);
      order.splice(drag.to, 0, moved!);
      this.spaces = order;
      this.fireSpace_('reorder', drag.id, {delta: drag.to - drag.from});
      await this.updateComplete;
    }
    drag.column.style.transform =
        `translateX(${dropX - drag.column.getBoundingClientRect().left}px)`;
    void getComputedStyle(drag.column).transform;
    board?.removeAttribute('settling');
    drag.column.style.transform = '';
  };

  private fireSpace_(
      command: LibrarySpaceCommand, id: string,
      extra: Partial<LibrarySpaceDetail> = {}) {
    this.fire<LibrarySpaceDetail>('rail-library-space', {
      command,
      id,
      tab: '',
      to: '',
      folder: '',
      name: '',
      delta: 0,
      x: 0,
      y: 0,
      ids: [],
      ...extra,
    });
  }

  protected archiveDetail_(tab: ArchivedTab): string {
    const space = this.spaces.find(one => one.id === tab.space);
    return [formatDisplayUrl(tab.url), space && this.spaces.length > 1 ?
             space.name :
             '']
        .filter(Boolean)
        .join(' · ');
  }

  protected archiveTime_(tab: ArchivedTab): string {
    return new Date(tab.archivedAt).toLocaleTimeString(
        undefined, {hour: 'numeric', minute: '2-digit'});
  }

  protected archiveFavicon_(tab: ArchivedTab): string {
    return faviconFor(tab.favicon, tab.url);
  }

  protected archiveCount_(): string {
    const count = this.days_.reduce((sum, day) => sum + day.tabs.length, 0);
    return `${count} tab${count === 1 ? '' : 's'}`;
  }

  protected archiveHint_(): string {
    if (this.query_) {
      return 'Try a page title or a site.';
    }
    if (INCOGNITO) {
      return 'Incognito windows do not keep closed tabs.';
    }
    const hours = archiveHoursFor(this.archiveHours, this.spaceProfile_());
    if (!hours) {
      return 'Tabs you close land here.';
    }
    const span = hours % 24 === 0 ?
        `${hours / 24} day${hours === 24 ? '' : 's'}` :
        `${hours} hour${hours === 1 ? '' : 's'}`;
    return `Tabs you close, or leave alone for ${span}, land here.`;
  }

  protected onArchivedClick_(e: Event) {
    this.fire('rail-archive-restore', {id: this.idOf_(e)});
  }

  protected onArchivedRemoveClick_(e: Event) {
    e.stopPropagation();
    archivedTabs().take(this.idOf_(e));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rail-library': RailLibraryElement;
  }
}

customElements.define(RailLibraryElement.is, RailLibraryElement);
