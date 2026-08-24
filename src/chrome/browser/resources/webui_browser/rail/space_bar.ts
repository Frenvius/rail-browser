import '//resources/cr_elements/cr_action_menu/cr_action_menu.js';
import '//resources/cr_elements/cr_button/cr_button.js';
import '//resources/cr_elements/cr_dialog/cr_dialog.js';
import '//resources/cr_elements/cr_icon/cr_icon.js';
import '//resources/cr_elements/icons.html.js';

import type {CrActionMenuElement} from '//resources/cr_elements/cr_action_menu/cr_action_menu.js';
import type {CrDialogElement} from '//resources/cr_elements/cr_dialog/cr_dialog.js';
import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import {getCss} from './space_bar.css.js';
import {getHtml} from './space_bar.html.js';
import type {Space, SpaceProfile} from './spaces.js';
import {DEFAULT_PROFILE_NAME, SPACE_COLORS, SPACE_ICONS} from './spaces.js';

export type SpaceCommand = 'create'|'move'|'newprofile'|'remove'|'rename'|
    'restyle'|'select'|'setprofile';

export interface SpaceCommandDetail {
  command: SpaceCommand;
  id: string;
  name: string;
  color: string;
  icon: string;
  delta: number;
  profile: string;
}

export interface SpaceBarElement {
  $: {
    menu: CrActionMenuElement,
    profileMenu: CrActionMenuElement,
    profileDialog: CrDialogElement,
  };
}

export class SpaceBarElement extends CrLitElement {
  static get is() {
    return 'rail-space-bar';
  }

  static override get styles() {
    return getCss();
  }

  override render() {
    return getHtml.bind(this)();
  }

  static override get properties() {
    return {
      spaces: {type: Array},
      profiles: {type: Array},
      activeId: {type: String},
      tabCounts: {type: Object},
      variant: {type: String},
      editing_: {type: Boolean, state: true},
      confirming_: {type: Boolean, state: true},
      picking_: {type: Boolean, state: true},
      choosing_: {type: Boolean, state: true},
      iconQuery_: {type: String, state: true},
      profileName_: {type: String, state: true},
      menuTarget_: {type: String, state: true},
    };
  }

  accessor spaces: Space[] = [];
  accessor profiles: SpaceProfile[] = [];
  accessor activeId: string = '';
  accessor tabCounts: Record<string, number> = {};
  accessor variant: 'dots'|'title' = 'dots';
  protected accessor editing_ = false;
  protected accessor confirming_ = false;
  protected accessor picking_ = false;
  protected accessor choosing_ = false;
  protected accessor iconQuery_ = '';
  protected accessor profileName_ = '';
  protected accessor menuTarget_ = '';
  protected readonly colors = SPACE_COLORS;

  protected activeSpace_(): Space|undefined {
    return this.spaces.find(space => space.id === this.activeId);
  }

  protected activeName_(): string {
    return this.activeSpace_()?.name ?? '';
  }

  protected activeIcon_(): string {
    return this.activeSpace_()?.icon ?? '';
  }

  protected activeColor_(): string {
    return this.activeSpace_()?.color ?? '';
  }

  protected targetSpace_(): Space|undefined {
    return this.spaces.find(space => space.id === this.menuTarget_);
  }

  protected removeCount_(): number {
    return this.tabCounts[this.menuTarget_] ?? 0;
  }

  protected isGlyphIcon_(icon: string): boolean {
    return icon.startsWith('cr:');
  }

  beginRename() {
    this.startEditing_();
  }

  openMenuAt(x: number, y: number) {
    this.menuTarget_ = this.activeId;
    this.$.menu.showAtPosition({top: y, left: x});
  }

  protected filteredIcons_(): ReadonlyArray<readonly[string, string]> {
    const query = this.iconQuery_.trim().toLowerCase();
    if (!query) {
      return SPACE_ICONS;
    }
    return SPACE_ICONS.filter(
        ([icon, terms]) => terms.includes(query) || icon === query);
  }

  protected async onChangeIconClick_() {
    this.picking_ = true;
    await this.updateComplete;
    this.shadowRoot.querySelector<HTMLInputElement>('#iconSearch')?.focus();
  }

  protected onPickerBackClick_() {
    this.picking_ = false;
    this.iconQuery_ = '';
  }

  protected onIconSearchInput_(e: Event) {
    this.iconQuery_ = (e.target as HTMLInputElement).value;
  }

  protected profileRows_(): SpaceProfile[] {
    return [{id: '', name: DEFAULT_PROFILE_NAME}, ...this.profiles];
  }

  protected checkClass_(profileId: string): string {
    return profileId === this.currentProfile_() ? 'check' : 'check blank';
  }

  protected currentProfile_(): string {
    return this.targetSpace_()?.partition ?? '';
  }

  protected onSetProfileClick_(e: Event) {
    const item = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.choosing_ = true;
    this.$.profileMenu.showAtPosition({top: item.top - 6, left: item.right});
  }

  protected onProfileClick_(e: Event) {
    const profile = (e.currentTarget as HTMLElement).dataset['profile'] ?? '';
    this.closeMenus_();
    this.fire_('setprofile', this.menuTarget_, {profile});
  }

  private closeMenus_() {
    this.choosing_ = false;
    this.$.profileMenu.close();
    this.$.menu.close();
  }

  protected async onNewProfileClick_() {
    this.closeMenus_();
    this.profileName_ = '';
    this.$.profileDialog.showModal();
    await this.updateComplete;
    this.shadowRoot.querySelector<HTMLInputElement>('#profileNameInput')
        ?.focus();
  }

  protected onProfileNameInput_(e: Event) {
    this.profileName_ = (e.target as HTMLInputElement).value;
  }

  protected onProfileNameKeydown_(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this.onCreateProfileClick_();
    }
    e.stopPropagation();
  }

  protected onCreateProfileClick_() {
    const name = this.profileName_.trim();
    if (!name) {
      return;
    }
    this.$.profileDialog.close();
    this.fire_('newprofile', this.menuTarget_, {name});
  }

  protected onCancelProfileClick_() {
    this.$.profileDialog.close();
  }

  protected onIconSearchKeydown_(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.onPickerBackClick_();
    }
    e.stopPropagation();
  }

  protected canMove_(delta: number): boolean {
    const index = this.spaces.findIndex(space => space.id === this.menuTarget_);
    const next = index + delta;
    return index !== -1 && next >= 0 && next < this.spaces.length;
  }

  protected onDotClick_(e: Event) {
    this.fire_('select', this.idOf_(e));
  }

  protected onDotContextmenu_(e: MouseEvent) {
    e.preventDefault();
    this.menuTarget_ = this.idOf_(e);
    this.$.menu.showAtPosition({top: e.clientY, left: e.clientX});
  }

  protected onAddClick_() {
    this.fire_('create', '');
  }

  protected onNameClick_() {
    this.startEditing_();
  }

  protected onGlyphClick_(e: MouseEvent) {
    this.openMenuAt(e.clientX, e.clientY);
  }

  protected onNameContextmenu_(e: MouseEvent) {
    e.preventDefault();
    this.openMenuAt(e.clientX, e.clientY);
  }

  protected onRenameClick_() {
    this.$.menu.close();
    this.startEditing_();
  }

  protected onRemoveClick_() {
    if (this.removeCount_()) {
      this.confirming_ = true;
      return;
    }
    this.$.menu.close();
    this.fire_('remove', this.menuTarget_);
  }

  protected onConfirmRemoveClick_() {
    this.$.menu.close();
    this.fire_('remove', this.menuTarget_);
  }

  protected onCancelRemoveClick_() {
    this.confirming_ = false;
  }

  protected onMenuClose_() {
    this.confirming_ = false;
    this.picking_ = false;
    this.iconQuery_ = '';
    if (this.choosing_) {
      this.choosing_ = false;
      this.$.profileMenu.close();
    }
  }

  protected onColorClick_(e: Event) {
    const color = (e.currentTarget as HTMLElement).dataset['color'] ?? '';
    this.fire_('restyle', this.menuTarget_, {color});
  }

  protected onIconClick_(e: Event) {
    const icon = (e.currentTarget as HTMLElement).dataset['icon'] ?? '';
    this.$.menu.close();
    this.fire_('restyle', this.menuTarget_, {icon});
  }

  protected onMoveLeftClick_() {
    this.$.menu.close();
    this.fire_('move', this.menuTarget_, {delta: -1});
  }

  protected onMoveRightClick_() {
    this.$.menu.close();
    this.fire_('move', this.menuTarget_, {delta: 1});
  }

  protected onInputKeydown_(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this.stopEditing_(true);
    } else if (e.key === 'Escape') {
      this.stopEditing_(false);
    }
    e.stopPropagation();
  }

  protected onInputBlur_() {
    this.stopEditing_(true);
  }

  protected canRemove_(): boolean {
    return this.spaces.length > 1;
  }

  private async startEditing_() {
    this.editing_ = true;
    document.addEventListener('pointerdown', this.onOutsidePointerdown_, true);
    window.addEventListener('blur', this.onWindowBlur_);
    await this.updateComplete;
    const input = this.input_();
    input?.focus();
    input?.select();
  }

  private stopEditing_(commit: boolean) {
    if (!this.editing_) {
      return;
    }
    const value = this.input_()?.value ?? '';
    this.editing_ = false;
    document.removeEventListener(
        'pointerdown', this.onOutsidePointerdown_, true);
    window.removeEventListener('blur', this.onWindowBlur_);
    if (commit) {
      this.fire_('rename', this.activeId, {name: value});
    }
  }

  private onOutsidePointerdown_ = (e: PointerEvent) => {
    if (!e.composedPath().includes(this.input_() as EventTarget)) {
      this.stopEditing_(true);
    }
  };

  private onWindowBlur_ = () => {
    this.stopEditing_(true);
  };

  private input_(): HTMLInputElement|null {
    return this.shadowRoot.querySelector('input');
  }

  private idOf_(e: Event): string {
    return (e.currentTarget as HTMLElement).dataset['id'] ?? '';
  }

  private fire_(
      command: SpaceCommand, id: string,
      extra: Partial<SpaceCommandDetail> = {}) {
    this.fire<SpaceCommandDetail>('rail-space-command', {
      command,
      id,
      name: '',
      color: '',
      icon: '',
      delta: 0,
      profile: '',
      ...extra,
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rail-space-bar': SpaceBarElement;
  }
}

customElements.define(SpaceBarElement.is, SpaceBarElement);
