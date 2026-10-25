import '//resources/cr_elements/cr_icon/cr_icon.js';
import '//resources/cr_elements/cr_toggle/cr_toggle.js';
import '//resources/cr_elements/icons.html.js';

import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import type {ProfileDetail, SettingsProfile} from '../rail_settings.mojom-webui.js';
import {browserProxyFactory, UpdateStatus} from '../rail_settings.mojom-webui.js';

import {getCss} from './settings.css.js';
import {getHtml} from './settings.html.js';
import {DEFAULT_PROFILE_NAME} from './spaces.js';
import type {ArchiveHours} from './tab_archive.js';
import {archiveHoursFor, archiveSource} from './tab_archive.js';
import {normalizeSleepSite} from './tab_sleep.js';

export interface ProfileRow {
  id: string;
  name: string;
  spaces: string[];
}

interface StoredSpaceName {
  name: string;
  profile?: string;
}

function spaceNamesByProfile(state: string): Map<string, string[]> {
  const names = new Map<string, string[]>();
  let spaces: StoredSpaceName[] = [];
  try {
    const parsed = JSON.parse(state || 'null');
    spaces = Array.isArray(parsed?.spaces) ? parsed.spaces : [];
  } catch (e) {
    return names;
  }
  for (const space of spaces) {
    const id = space.profile ?? '';
    const bucket = names.get(id) ?? [];
    bucket.push(space.name);
    names.set(id, bucket);
  }
  return names;
}

export class RailSettingsElement extends CrLitElement {
  static get is() {
    return 'rail-settings';
  }

  static override get styles() {
    return getCss();
  }

  override render() {
    return getHtml.bind(this)();
  }

  static override get properties() {
    return {
      profiles_: {type: Array, state: true},
      creating_: {type: Boolean, state: true},
      openRow_: {type: Object, state: true},
      detail_: {type: Object, state: true},
      renaming_: {type: Boolean, state: true},
      confirmingDelete_: {type: Boolean, state: true},
      hasKey_: {type: Boolean, state: true},
      model_: {type: String, state: true},
      sidebarIconsOnly_: {type: Boolean, state: true},
      themedTitlebar_: {type: Boolean, state: true},
      groupOpenedLinks_: {type: Boolean, state: true},
      trailDepth_: {type: Number, state: true},
      sleepMinutes_: {type: Number, state: true},
      sleepSites_: {type: Array, state: true},
      archiveHours_: {type: Object, state: true},
      section_: {type: String, state: true},
      customModel_: {type: Boolean, state: true},
      editingKey_: {type: Boolean, state: true},
      railVersion_: {type: String, state: true},
      chromiumVersion_: {type: String, state: true},
      updateStatus_: {type: Number, state: true},
      readyVersion_: {type: String, state: true},
    };
  }

  protected accessor section_ = 'general';
  protected readonly sections_ = [
    {id: 'general', label: 'General'},
    {id: 'profiles', label: 'Profiles'},
    {id: 'organizer', label: 'Tab Organizer'},
    {id: 'about', label: 'About'},
  ];

  protected accessor profiles_: ProfileRow[] = [];
  protected accessor creating_ = false;
  protected accessor openRow_: ProfileRow|null = null;
  protected accessor detail_: ProfileDetail|null = null;
  protected accessor renaming_ = false;
  protected accessor confirmingDelete_ = false;
  protected accessor hasKey_ = false;
  protected accessor model_ = '';
  protected accessor sidebarIconsOnly_ = false;
  protected accessor themedTitlebar_ = true;
  protected accessor groupOpenedLinks_ = true;
  protected accessor trailDepth_ = 1;
  protected accessor sleepMinutes_ = 30;
  protected accessor sleepSites_: string[] = [];
  protected accessor archiveHours_: ArchiveHours = {};
  protected accessor customModel_ = false;
  protected accessor editingKey_ = false;
  protected accessor railVersion_ = '';
  protected accessor chromiumVersion_ = '';
  protected accessor updateStatus_ = UpdateStatus.kUnavailable;
  protected accessor readyVersion_ = '';
  protected readonly models_ = [
    {id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', price: '$0.01 / $0.20'},
    {
      id: 'anthropic/claude-haiku-5.5',
      name: 'Claude Haiku 5.5',
      price: '$0.10 / $0.50',
    },
    {id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', price: '$0.10 / $0.50'},
    {id: 'qwen/qwen3.8-flash', name: 'Qwen3.8 Flash', price: '$0.15 / $0.47'},
    {
      id: 'minimax/minimax-m3.1-flash',
      name: 'MiniMax M3.1 Flash',
      price: '$0.15 / $0.60',
    },
    {
      id: 'deepseek/deepseek-v4.1-flash',
      name: 'DeepSeek V4.1 Flash',
      price: '$0.17 / $0.66',
    },
    {
      id: 'google/gemini-3.5-flash-lite',
      name: 'Gemini 3.5 Flash Lite',
      price: '$0.30 / $2.50',
    },
  ];
  protected readonly trailDepthChoices_ = [
    {depth: 1, label: '1 level'},
    {depth: 2, label: '2 levels'},
    {depth: 3, label: '3 levels'},
    {depth: 4, label: '4 levels'},
    {depth: 5, label: '5 levels'},
    {depth: 0, label: 'Unlimited'},
  ];
  protected readonly sleepChoices_ = [
    {minutes: 0, label: 'Never'},
    {minutes: 15, label: '15 minutes'},
    {minutes: 30, label: '30 minutes'},
    {minutes: 60, label: '1 hour'},
    {minutes: 120, label: '2 hours'},
    {minutes: 360, label: '6 hours'},
  ];
  protected readonly archiveChoices_ = [
    {hours: 0, label: 'Never'},
    {hours: 12, label: '12 hours'},
    {hours: 24, label: '1 day'},
    {hours: 168, label: '7 days'},
    {hours: 720, label: '30 days'},
  ];

  override connectedCallback() {
    super.connectedCallback();
    this.addEventListener('keydown', e => this.onKeydown_(e), true);
    const router = browserProxyFactory.getInstance().callbackRouter;
    router.onUpdateStatusChanged.addListener(
        (status: UpdateStatus, version: string|null) =>
            this.setUpdateStatus_(status, version));
    router.onShowSection.addListener((section: string) => {
      this.section_ = section;
      this.onBackClick_();
    });
    this.load_();
  }

  private async load_() {
    const handler = browserProxyFactory.getInstance().handler;
    const [{profiles}, {value}] =
        await Promise.all([handler.listProfiles(), handler.getSidebarState()]);
    const organize = await handler.getOrganizeSettings();
    this.hasKey_ = organize.hasKey;
    this.model_ = organize.model;
    this.sidebarIconsOnly_ = (await handler.getSidebarIconsOnly()).iconsOnly;
    this.themedTitlebar_ = (await handler.getThemedTitlebar()).themed;
    this.groupOpenedLinks_ = (await handler.getGroupOpenedLinks()).grouped;
    this.trailDepth_ = (await handler.getTrailDepth()).depth;
    const sleep = await handler.getTabSleep();
    this.sleepMinutes_ = sleep.minutes;
    this.sleepSites_ = sleep.exceptions;
    this.archiveHours_ = sleep.archiveHours;
    const versions = await handler.getVersions();
    this.railVersion_ = versions.rail;
    this.chromiumVersion_ = versions.chromium;
    const update = await handler.getUpdateStatus();
    this.setUpdateStatus_(update.status, update.version);
    const names = spaceNamesByProfile(value);
    this.profiles_ = [
      {id: '', name: DEFAULT_PROFILE_NAME, spaces: names.get('') ?? []},
      ...profiles.map((profile: SettingsProfile) => ({
                        id: profile.id,
                        name: profile.name,
                        spaces: names.get(profile.id) ?? [],
                      })),
    ];
  }

  protected onApiKeyKeydown_(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this.onSaveKeyClick_();
    }
  }

  protected onSaveKeyClick_() {
    const input = this.shadowRoot.querySelector<HTMLInputElement>('#apikey');
    const key = input?.value.trim();
    if (!input || !key) {
      return;
    }
    browserProxyFactory.getInstance().handler.setOpenRouterKey(key);
    input.value = '';
    this.hasKey_ = true;
    this.editingKey_ = false;
  }

  protected onReplaceKeyClick_() {
    this.editingKey_ = true;
    this.updateComplete.then(
        () => this.shadowRoot.querySelector<HTMLInputElement>('#apikey')
                  ?.focus());
  }

  protected onCancelKeyClick_() {
    this.editingKey_ = false;
  }

  protected isListedModel_(): boolean {
    return !this.customModel_ &&
        this.models_.some(model => model.id === this.model_);
  }

  protected customModelValue_(): string {
    return this.models_.some(model => model.id === this.model_) ? '' :
                                                                  this.model_;
  }

  protected onModelChoiceChange_(e: Event) {
    const choice = (e.target as HTMLSelectElement).value;
    this.customModel_ = choice === 'custom';
    if (this.customModel_) {
      this.updateComplete.then(
          () => this.shadowRoot.querySelector<HTMLInputElement>('#model')
                    ?.focus());
      return;
    }
    this.setModel_(choice);
  }

  protected onModelChange_(e: Event) {
    this.setModel_((e.target as HTMLInputElement).value.trim());
  }

  private setModel_(model: string) {
    if (!model) {
      return;
    }
    browserProxyFactory.getInstance().handler.setOrganizeModel(model);
    this.model_ = model;
  }

  protected onSidebarCollapseChange_(e: Event) {
    const iconsOnly = (e.target as HTMLSelectElement).value === 'icons';
    browserProxyFactory.getInstance().handler.setSidebarIconsOnly(iconsOnly);
    this.sidebarIconsOnly_ = iconsOnly;
  }

  protected onThemedTitlebarChange_(e: CustomEvent<boolean>) {
    browserProxyFactory.getInstance().handler.setThemedTitlebar(e.detail);
    this.themedTitlebar_ = e.detail;
  }

  protected onGroupOpenedLinksChange_(e: CustomEvent<boolean>) {
    browserProxyFactory.getInstance().handler.setGroupOpenedLinks(e.detail);
    this.groupOpenedLinks_ = e.detail;
  }

  protected onTrailDepthChange_(e: Event) {
    const depth = Number((e.target as HTMLSelectElement).value);
    browserProxyFactory.getInstance().handler.setTrailDepth(depth);
    this.trailDepth_ = depth;
  }

  protected onSleepMinutesChange_(e: Event) {
    const minutes = Number((e.target as HTMLSelectElement).value);
    browserProxyFactory.getInstance().handler.setTabSleepMinutes(minutes);
    this.sleepMinutes_ = minutes;
  }

  protected profileArchiveHours_(): number {
    return archiveHoursFor(this.archiveHours_, this.openRow_?.id ?? '');
  }

  protected archiveHint_(): string {
    const id = this.openRow_?.id ?? '';
    return id && archiveSource(this.archiveHours_, id) === '' ?
        `Follows the ${DEFAULT_PROFILE_NAME} Profile until you pick a time` :
        'Archived tabs leave the sidebar and wait in the Library';
  }

  protected onArchiveHoursChange_(e: Event) {
    const row = this.openRow_;
    if (!row) {
      return;
    }
    const hours = Number((e.target as HTMLSelectElement).value);
    browserProxyFactory.getInstance().handler.setTabArchiveHours(row.id, hours);
    this.archiveHours_ = {...this.archiveHours_, [row.id]: hours};
  }

  protected onSleepSiteKeydown_(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this.onAddSleepSiteClick_();
    }
  }

  protected onAddSleepSiteClick_() {
    const input = this.shadowRoot.querySelector<HTMLInputElement>('#sleepsite');
    if (!input) {
      return;
    }
    const site = normalizeSleepSite(input.value);
    input.value = '';
    if (!site || this.sleepSites_.includes(site)) {
      return;
    }
    this.setSleepSites_([...this.sleepSites_, site]);
  }

  protected onRemoveSleepSiteClick_(e: Event) {
    const site = (e.currentTarget as HTMLElement).dataset['site'];
    this.setSleepSites_(this.sleepSites_.filter(entry => entry !== site));
  }

  private setSleepSites_(sites: string[]) {
    browserProxyFactory.getInstance().handler.setTabSleepExceptions(sites);
    this.sleepSites_ = sites;
  }

  protected onSectionClick_(e: Event) {
    this.section_ = (e.currentTarget as HTMLElement).dataset['section']!;
    this.onBackClick_();
  }

  private setUpdateStatus_(status: UpdateStatus, version: string|null) {
    this.updateStatus_ = status;
    this.readyVersion_ = version ?? '';
  }

  protected updateMessage_(): string {
    switch (this.updateStatus_) {
      case UpdateStatus.kChecking:
        return 'Checking for updates...';
      case UpdateStatus.kDownloading:
        return 'A new version is downloading. You can keep browsing.';
      case UpdateStatus.kUpToDate:
        return 'Rail is up to date.';
      case UpdateStatus.kReady:
        return `Rail ${this.readyVersion_} is ready. ` +
            'Restart Rail to finish updating.';
      case UpdateStatus.kFailed:
        return 'Couldn\'t check for updates. Check your connection and ' +
            'try again.';
      case UpdateStatus.kUnavailable:
        return 'Development builds don\'t update automatically.';
      default:
        return 'Rail checks for updates automatically.';
    }
  }

  protected updateButtonLabel_(): string {
    switch (this.updateStatus_) {
      case UpdateStatus.kChecking:
        return 'Checking...';
      case UpdateStatus.kDownloading:
        return 'Downloading...';
      case UpdateStatus.kReady:
        return 'Restart to Update';
      case UpdateStatus.kFailed:
        return 'Try Again';
      default:
        return 'Check for Updates';
    }
  }

  protected isUpdateBusy_(): boolean {
    return this.updateStatus_ === UpdateStatus.kChecking ||
        this.updateStatus_ === UpdateStatus.kDownloading;
  }

  protected isUpdateReady_(): boolean {
    return this.updateStatus_ === UpdateStatus.kReady;
  }

  protected isUpdateAvailable_(): boolean {
    return this.updateStatus_ !== UpdateStatus.kUnavailable;
  }

  protected onUpdateClick_() {
    const handler = browserProxyFactory.getInstance().handler;
    if (this.isUpdateReady_()) {
      handler.applyUpdate();
      return;
    }
    handler.checkForUpdates();
  }

  protected onLinkClick_(e: Event) {
    e.preventDefault();
    browserProxyFactory.getInstance().handler.openUrl(
        (e.currentTarget as HTMLAnchorElement).href);
  }

  protected onClearKeyClick_() {
    browserProxyFactory.getInstance().handler.setOpenRouterKey('');
    this.hasKey_ = false;
    this.editingKey_ = false;
  }

  private onKeydown_(e: KeyboardEvent) {
    if (e.key !== 'Escape') {
      return;
    }
    e.preventDefault();
    if (this.editingKey_) {
      this.editingKey_ = false;
      return;
    }
    if (this.renaming_) {
      this.renaming_ = false;
      return;
    }
    if (this.confirmingDelete_) {
      this.confirmingDelete_ = false;
      return;
    }
    if (this.openRow_) {
      this.onBackClick_();
      return;
    }
    this.onCloseClick_();
  }

  protected async onRowClick_(e: Event) {
    const index =
        Number((e.currentTarget as HTMLElement).dataset['index'] ?? '-1');
    const row = this.profiles_[index];
    if (!row) {
      return;
    }
    this.openRow_ = row;
    this.detail_ = null;
    this.renaming_ = false;
    this.confirmingDelete_ = false;
    const {detail} =
        await browserProxyFactory.getInstance().handler.getProfileDetail(row.id);
    if (this.openRow_ === row) {
      this.detail_ = detail;
    }
  }

  protected onBackClick_() {
    this.openRow_ = null;
    this.detail_ = null;
    this.renaming_ = false;
    this.confirmingDelete_ = false;
  }

  protected canDelete_(): boolean {
    const row = this.openRow_;
    return row !== null && row.id !== '' && row.spaces.length === 0;
  }

  protected deleteLabel_(): string {
    const name = this.openRow_ ? this.openRow_.name : '';
    return this.confirmingDelete_ ? `Click again to delete "${name}"` :
                                    `Delete "${name}" Profile`;
  }

  protected deleteHint_(): string {
    if (!this.openRow_) {
      return '';
    }
    if (this.openRow_.id === '') {
      return 'The default Profile cannot be deleted.';
    }
    return this.openRow_.spaces.length ?
        'Profiles used by Spaces cannot be deleted.' :
        'Deleting a Profile erases its history, logins, cookies, and extensions.';
  }

  protected onDeleteClick_() {
    const row = this.openRow_;
    if (!row || !this.canDelete_()) {
      return;
    }
    if (!this.confirmingDelete_) {
      this.confirmingDelete_ = true;
      return;
    }
    browserProxyFactory.getInstance().handler.deleteProfile(row.id);
    this.profiles_ = this.profiles_.filter(entry => entry.id !== row.id);
    this.onBackClick_();
  }

  protected onRenameClick_() {
    this.renaming_ = true;
    this.updateComplete.then(() => {
      const input = this.shadowRoot.querySelector<HTMLInputElement>('#rename');
      input?.select();
    });
  }

  protected onRenameKeydown_(e: KeyboardEvent) {
    if (e.key !== 'Enter') {
      return;
    }
    this.commitRename_((e.target as HTMLInputElement).value.trim());
  }

  protected onRenameBlur_(e: Event) {
    this.commitRename_((e.target as HTMLInputElement).value.trim());
  }

  private commitRename_(name: string) {
    const row = this.openRow_;
    this.renaming_ = false;
    if (!row || !name || name === row.name) {
      return;
    }
    browserProxyFactory.getInstance().handler.renameProfile(row.id, name);
    this.openRow_ = {...row, name};
    this.load_();
  }

  protected isCurrentEngine_(id: string): boolean {
    return this.detail_ !== null && this.detail_.searchEngineId === id;
  }

  protected onSearchEngineChange_(e: Event) {
    const row = this.openRow_;
    if (!row) {
      return;
    }
    browserProxyFactory.getInstance().handler.setSearchEngine(
        row.id, (e.target as HTMLSelectElement).value);
  }

  protected onSuggestionsChange_(e: CustomEvent<boolean>) {
    const row = this.openRow_;
    if (!row) {
      return;
    }
    browserProxyFactory.getInstance().handler.setSearchSuggestions(
        row.id, e.detail);
    if (this.detail_) {
      this.detail_ = {...this.detail_, searchSuggestions: e.detail};
    }
  }

  protected onAdvancedSearchClick_() {
    if (this.openRow_) {
      browserProxyFactory.getInstance().handler.openSearchSettings(
          this.openRow_.id);
    }
  }

  protected onCloseClick_() {
    browserProxyFactory.getInstance().handler.close();
  }

  protected async onNewProfileClick_() {
    if (this.creating_) {
      return;
    }
    this.creating_ = true;
    const name = `Profile ${this.profiles_.length + 1}`;
    await browserProxyFactory.getInstance().handler.createProfile(name);
    this.creating_ = false;
    this.load_();
  }

  protected spacesLabel_(row: ProfileRow): string {
    if (!row.spaces.length) {
      return 'Not used by any Space';
    }
    if (row.spaces.length === 1) {
      return `This Profile is used by your ${row.spaces[0]} Space`;
    }
    const head = row.spaces.slice(0, 2).join(', ');
    const rest = row.spaces.length - 2;
    return rest > 0 ?
        `This Profile is used by your ${head}, and ${rest} more Spaces` :
        `This Profile is used by your ${head} Spaces`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rail-settings': RailSettingsElement;
  }
}

customElements.define(RailSettingsElement.is, RailSettingsElement);
