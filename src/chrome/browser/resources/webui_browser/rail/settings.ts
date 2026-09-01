import '//resources/cr_elements/cr_icon/cr_icon.js';
import '//resources/cr_elements/cr_toggle/cr_toggle.js';
import '//resources/cr_elements/icons.html.js';

import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import type {ProfileDetail, SettingsProfile} from '../rail_settings.mojom-webui.js';
import {browserProxyFactory} from '../rail_settings.mojom-webui.js';

import {getCss} from './settings.css.js';
import {getHtml} from './settings.html.js';
import {DEFAULT_PROFILE_NAME} from './spaces.js';

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
    };
  }

  protected accessor profiles_: ProfileRow[] = [];
  protected accessor creating_ = false;
  protected accessor openRow_: ProfileRow|null = null;
  protected accessor detail_: ProfileDetail|null = null;
  protected accessor renaming_ = false;
  protected accessor confirmingDelete_ = false;

  override connectedCallback() {
    super.connectedCallback();
    this.addEventListener('keydown', e => this.onKeydown_(e), true);
    this.load_();
  }

  private async load_() {
    const handler = browserProxyFactory.getInstance().handler;
    const [{profiles}, {value}] =
        await Promise.all([handler.listProfiles(), handler.getSidebarState()]);
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

  private onKeydown_(e: KeyboardEvent) {
    if (e.key !== 'Escape') {
      return;
    }
    e.preventDefault();
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
