import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';
import type {PropertyValues} from '//resources/lit/v3_0/lit.rollup.js';

import type {Download} from './downloads.js';
import {downloadsProfile, downloadStatus, DownloadList, DownloadState, fileIconUrl, isMoving, needsReview, onDownloadsRebound} from './downloads.js';
import {formatDisplayUrl} from './format_url.js';
import {getCss} from './library.css.js';
import {getHtml} from './library.html.js';
import type {LibraryIcon} from './library_icons.js';
import {INCOGNITO} from './sidebar_state.js';
import type {Space, SpaceProfile} from './spaces.js';
import {DEFAULT_PROFILE_NAME, spaceHex} from './spaces.js';
import type {ArchiveDay, ArchivedTab, ArchiveHours} from './tab_archive.js';
import {archivedTabs, archiveHoursFor, groupByDay, matchArchived} from './tab_archive.js';

export type LibrarySection = 'downloads'|'spaces'|'archive';

export interface LibrarySpaceDetail {
  command: 'select'|'create'|'menu';
  id: string;
  x: number;
  y: number;
}

export const LIBRARY_SECTIONS:
    ReadonlyArray<{id: LibrarySection, label: string, icon: LibraryIcon}> = [
      {id: 'downloads', label: 'Downloads', icon: 'download'},
      {id: 'spaces', label: 'Spaces', icon: 'spaces'},
      {id: 'archive', label: 'Archived Tabs', icon: 'archive'},
    ];

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
      tabCounts: {type: Object},
      profiles: {type: Array},
      archiveHours: {type: Object},
      query_: {type: String, state: true},
      downloads_: {type: Array, state: true},
      archived_: {type: Array, state: true},
      days_: {type: Array, state: true},
      filterProfile_: {type: String, state: true},
      confirming_: {type: String, state: true},
      filtering_: {type: Boolean, state: true},
    };
  }

  accessor open = false;
  accessor section: LibrarySection = 'downloads';
  accessor spaces: Space[] = [];
  accessor activeId = '';
  accessor tabCounts: Record<string, number> = {};
  accessor profiles: SpaceProfile[] = [];
  accessor archiveHours: ArchiveHours = {};
  protected accessor query_ = '';
  protected accessor downloads_: Download[] = [];
  protected accessor archived_: ArchivedTab[] = [];
  protected accessor days_: ArchiveDay[] = [];
  protected accessor filterProfile_ = '';
  protected accessor confirming_ = '';
  protected accessor filtering_ = false;
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
  }

  override firstUpdated() {
    this.resizeObserver_ = new ResizeObserver(() => this.placeIndicator_(false));
    this.resizeObserver_.observe(
        this.shadowRoot.querySelector<HTMLElement>('#sectionList')!);
  }

  override updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);
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

  protected spaceIcon_(space: Space): string {
    return space.icon.startsWith('cr:') ? '' : space.icon;
  }

  protected spaceColor_(space: Space): string {
    return spaceHex(space.color);
  }

  protected spaceDetail_(space: Space): string {
    const count = this.tabCounts[space.id] ?? 0;
    const tabs = `${count} tab${count === 1 ? '' : 's'}`;
    const profile = space.profile ?
        this.profiles.find(one => one.id === space.profile)?.name :
        '';
    return profile ? `${tabs} · ${profile}` : tabs;
  }

  protected onSpaceClick_(e: Event) {
    this.fireSpace_('select', this.idOf_(e));
  }

  protected onSpaceContextmenu_(e: MouseEvent) {
    e.preventDefault();
    this.fireSpace_('menu', this.idOf_(e), e.clientX, e.clientY);
  }

  protected onSpaceMoreClick_(e: Event) {
    e.stopPropagation();
    const button = e.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    this.fireSpace_('menu', this.idOf_(e), rect.left, rect.bottom);
  }

  protected onNewSpaceClick_() {
    this.fireSpace_('create', '');
  }

  private fireSpace_(
      command: LibrarySpaceDetail['command'], id: string, x = 0, y = 0) {
    this.fire<LibrarySpaceDetail>('rail-library-space', {command, id, x, y});
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
    return tab.favicon ||
        `chrome://favicon2/?pageUrl=${
               encodeURIComponent(tab.url)}&size=16&scaleFactor=2x`;
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
