import '//resources/cr_elements/cr_action_menu/cr_action_menu.js';
import '//resources/cr_elements/cr_button/cr_button.js';
import '//resources/cr_elements/cr_dialog/cr_dialog.js';
import '//resources/cr_elements/cr_icon/cr_icon.js';
import '//resources/cr_elements/icons.html.js';

import type {CrActionMenuElement} from '//resources/cr_elements/cr_action_menu/cr_action_menu.js';
import type {CrDialogElement} from '//resources/cr_elements/cr_dialog/cr_dialog.js';
import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import type {SystemBackdropMaterial} from '../browser.mojom-webui.js';
import {browserProxyFactory} from '../browser.mojom-webui.js';

import {announceMenuOpen} from './menu_overlay.js';
import {getCss} from './space_bar.css.js';
import {getHtml} from './space_bar.html.js';
import type {SpaceMenuDetail} from './space_menu.js';
import {openSpaceMenu} from './space_menu.js';
import type {Space, SpaceProfile} from './spaces.js';
import {DEFAULT_MATERIAL, spaceHex} from './spaces.js';

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
      material: {type: Number},
      variant: {type: String},
      editing_: {type: Boolean, state: true},
      confirming_: {type: Boolean, state: true},
      profileName_: {type: String, state: true},
      menuTarget_: {type: String, state: true},
    };
  }

  accessor spaces: Space[] = [];
  accessor profiles: SpaceProfile[] = [];
  accessor activeId: string = '';
  accessor tabCounts: Record<string, number> = {};
  accessor material: SystemBackdropMaterial = DEFAULT_MATERIAL;
  accessor variant: 'dots'|'title' = 'dots';
  protected accessor editing_ = false;
  protected accessor confirming_ = false;
  protected accessor profileName_ = '';
  protected accessor menuTarget_ = '';
  private menuX_ = 0;
  private menuY_ = 0;

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
    return spaceHex(this.activeSpace_()?.color ?? '');
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
    this.openMenuFor_(this.activeId, x, y);
  }

  private openMenuFor_(id: string, x: number, y: number) {
    this.menuTarget_ = id;
    this.menuX_ = x;
    this.menuY_ = y;
    const space = this.targetSpace_();
    if (!space) {
      return;
    }
    openSpaceMenu(
        {
          space,
          profiles: this.profiles,
          canRename: this.variant === 'title',
          canMoveLeft: this.canMove_(-1),
          canMoveRight: this.canMove_(1),
          canRemove: this.canRemove_(),
        },
        detail => this.runMenuCommand_(detail));
  }

  private runMenuCommand_(detail: SpaceMenuDetail) {
    switch (detail.command) {
      case 'recolor':
        this.openPicker_('color');
        return;
      case 'change-icon':
        this.openPicker_('icon');
        return;
      case 'rename':
        void this.startEditing_();
        return;
      case 'set-profile':
        this.fire_('setprofile', this.menuTarget_, {profile: detail.profile});
        return;
      case 'new-profile':
        void this.openProfileDialog_();
        return;
      case 'move':
        this.fire_('move', this.menuTarget_, {delta: detail.delta});
        return;
      case 'remove':
        if (this.removeCount_()) {
          void this.openRemoveConfirm_();
          return;
        }
        this.fire_('remove', this.menuTarget_);
        return;
    }
  }

  private async openPanel_() {
    await this.updateComplete;
    this.$.menu.showAtPosition({top: this.menuY_, left: this.menuX_});
    announceMenuOpen(this.$.menu);
  }

  private openPicker_(kind: 'color'|'icon') {
    const space = this.targetSpace_();
    if (!space) {
      return;
    }
    browserProxyFactory.getInstance().handler.openRailSpacePanel(
        {
          kind,
          spaceId: space.id,
          color: space.color,
          icon: space.icon,
          material: this.material,
        },
        {x: this.menuX_, y: this.menuY_});
  }

  private async openRemoveConfirm_() {
    this.confirming_ = true;
    await this.openPanel_();
  }

  private async openProfileDialog_() {
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
    this.openMenuFor_(this.idOf_(e), e.clientX, e.clientY);
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

  protected onConfirmRemoveClick_() {
    this.$.menu.close();
    this.fire_('remove', this.menuTarget_);
  }

  protected onCancelRemoveClick_() {
    this.$.menu.close();
  }

  protected onMenuClose_() {
    this.confirming_ = false;
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
