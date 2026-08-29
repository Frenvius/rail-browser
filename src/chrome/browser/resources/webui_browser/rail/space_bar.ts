import '//resources/cr_elements/cr_action_menu/cr_action_menu.js';
import '//resources/cr_elements/cr_button/cr_button.js';
import '//resources/cr_elements/cr_dialog/cr_dialog.js';
import '//resources/cr_elements/cr_icon/cr_icon.js';
import '//resources/cr_elements/icons.html.js';

import type {CrActionMenuElement} from '//resources/cr_elements/cr_action_menu/cr_action_menu.js';
import type {CrDialogElement} from '//resources/cr_elements/cr_dialog/cr_dialog.js';
import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import {browserProxyFactory, SystemBackdropMaterial} from '../browser.mojom-webui.js';

import {announceMenuOpen} from './menu_overlay.js';
import {getCss} from './space_bar.css.js';
import {getHtml} from './space_bar.html.js';
import type {SpaceMenuDetail} from './space_menu.js';
import {openSpaceMenu} from './space_menu.js';
import type {Space, SpaceProfile} from './spaces.js';
import {
  hexToHsl,
  hslToHex,
  spaceHex,
  SPACE_COLORS,
  SPACE_ICONS,
  tintStrength,
  withStrength,
} from './spaces.js';

const PICKER_SATURATION = 70;
const PICKER_MIN_LIGHTNESS = 18;
const PICKER_MAX_LIGHTNESS = 82;

const BACKDROP_MATERIALS: ReadonlyArray<readonly[SystemBackdropMaterial, string]> = [
  [SystemBackdropMaterial.kMica, 'Mica'],
  [SystemBackdropMaterial.kMicaAlt, 'Mica Alt'],
  [SystemBackdropMaterial.kAcrylic, 'Acrylic'],
  [SystemBackdropMaterial.kAcrylicThin, 'Thin'],
];

function hexToArgb(hex: string): number {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return (0xff000000 | value) >>> 0;
}

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
      variant: {type: String},
      editing_: {type: Boolean, state: true},
      confirming_: {type: Boolean, state: true},
      picking_: {type: Boolean, state: true},
      coloring_: {type: Boolean, state: true},
      hue_: {type: Number, state: true},
      exactHex_: {type: String, state: true},
      saturation_: {type: Number, state: true},
      lightness_: {type: Number, state: true},
      strength_: {type: Number, state: true},
      material_: {type: Number, state: true},
      tintOpacity_: {type: Number, state: true},
      luminosityOpacity_: {type: Number, state: true},
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
  protected accessor coloring_ = false;
  protected accessor hue_ = 0;
  protected accessor exactHex_ = '';
  protected accessor saturation_ = PICKER_SATURATION;
  protected accessor lightness_ = 50;
  protected accessor strength_ = 0;
  protected accessor material_: SystemBackdropMaterial =
      SystemBackdropMaterial.kAcrylic;
  protected accessor tintOpacity_ = 20;
  protected accessor luminosityOpacity_ = 90;
  protected accessor iconQuery_ = '';
  protected accessor profileName_ = '';
  protected accessor menuTarget_ = '';
  private backdropFrame_ = 0;
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
        void this.openColorPicker_();
        return;
      case 'change-icon':
        void this.openIconPicker_();
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

  private async openIconPicker_() {
    this.picking_ = true;
    await this.openPanel_();
    this.shadowRoot.querySelector<HTMLInputElement>('#iconSearch')?.focus();
  }

  private async openColorPicker_() {
    const current = this.targetSpace_()?.color ?? SPACE_COLORS[0]!;
    const [hue, saturation, lightness] = hexToHsl(current);
    this.hue_ = hue;
    this.saturation_ = saturation;
    this.lightness_ = lightness;
    this.exactHex_ = spaceHex(current);
    this.strength_ = Math.round(tintStrength(current) * 100);
    this.coloring_ = true;
    await this.openPanel_();
  }

  protected swatches_(): readonly string[] {
    return SPACE_COLORS;
  }

  protected pickedHex_(): string {
    return this.exactHex_ ||
        hslToHex(this.hue_, this.saturation_, this.lightness_);
  }

  protected trackGradient_(): string {
    return `linear-gradient(to right, transparent, ${this.pickedHex_()})`;
  }

  protected dotLeft_(): string {
    return `${this.hue_ / 360 * 100}%`;
  }

  protected dotTop_(): string {
    return `${
        (PICKER_MAX_LIGHTNESS - this.lightness_) /
        (PICKER_MAX_LIGHTNESS - PICKER_MIN_LIGHTNESS) * 100}%`;
  }

  protected onFieldPointerdown_(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.trackField_(e);
  }

  protected onFieldPointermove_(e: PointerEvent) {
    if (!e.buttons) {
      return;
    }
    this.trackField_(e);
  }

  private trackField_(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    this.hue_ = Math.round(x * 360);
    this.saturation_ = PICKER_SATURATION;
    this.lightness_ = Math.round(
        PICKER_MAX_LIGHTNESS - y * (PICKER_MAX_LIGHTNESS - PICKER_MIN_LIGHTNESS));
    this.exactHex_ = '';
    this.commitColor_();
  }

  protected onHexInput_(e: Event) {
    const text =
        (e.target as HTMLInputElement).value.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(text)) {
      return;
    }
    const [hue, saturation, lightness] = hexToHsl(`#${text}`);
    this.hue_ = hue;
    this.saturation_ = saturation;
    this.lightness_ = lightness;
    this.exactHex_ = `#${text.toLowerCase()}`;
    this.commitColor_();
  }

  protected onHexKeydown_(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.$.menu.close();
    }
    e.stopPropagation();
  }

  protected onStrengthInput_(e: Event) {
    this.strength_ = Number((e.target as HTMLInputElement).value);
    this.commitColor_();
  }

  protected onSwatchClick_(e: Event) {
    const color = (e.currentTarget as HTMLElement).dataset['color'] ?? '';
    const [hue, saturation, lightness] = hexToHsl(color);
    this.hue_ = hue;
    this.saturation_ = saturation;
    this.lightness_ = lightness;
    this.exactHex_ = spaceHex(color);
    this.commitColor_();
  }

  private commitColor_() {
    this.fire_(
        'restyle', this.menuTarget_,
        {color: withStrength(this.pickedHex_(), this.strength_ / 100)});
    this.commitBackdrop_();
  }

  protected materials_(): ReadonlyArray<readonly[SystemBackdropMaterial, string]> {
    return BACKDROP_MATERIALS;
  }

  protected onMaterialClick_(e: Event) {
    const value = (e.currentTarget as HTMLElement).dataset['material'] ?? '';
    this.material_ = Number(value) as SystemBackdropMaterial;
    this.commitBackdrop_();
  }

  protected onTintOpacityInput_(e: Event) {
    this.tintOpacity_ = Number((e.target as HTMLInputElement).value);
    this.commitBackdrop_();
  }

  protected onLuminosityOpacityInput_(e: Event) {
    this.luminosityOpacity_ = Number((e.target as HTMLInputElement).value);
    this.commitBackdrop_();
  }

  private commitBackdrop_() {
    if (this.backdropFrame_ !== 0) {
      return;
    }
    this.backdropFrame_ = requestAnimationFrame(() => {
      this.backdropFrame_ = 0;
      const color = hexToArgb(this.pickedHex_());
      browserProxyFactory.getInstance().handler.setSystemBackdrop({
        material: this.material_,
        tintColor: color,
        fallbackColor: color,
        tintOpacity: this.tintOpacity_ / 100,
        luminosityOpacity: this.luminosityOpacity_ / 100,
      });
    });
  }

  private async openRemoveConfirm_() {
    this.confirming_ = true;
    await this.openPanel_();
  }

  protected filteredIcons_(): ReadonlyArray<readonly[string, string]> {
    const query = this.iconQuery_.trim().toLowerCase();
    if (!query) {
      return SPACE_ICONS;
    }
    return SPACE_ICONS.filter(
        ([icon, terms]) => terms.includes(query) || icon === query);
  }

  protected onPickerBackClick_() {
    this.$.menu.close();
  }

  protected onIconSearchInput_(e: Event) {
    this.iconQuery_ = (e.target as HTMLInputElement).value;
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

  protected onIconSearchKeydown_(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.$.menu.close();
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
    this.picking_ = false;
    this.coloring_ = false;
    this.iconQuery_ = '';
  }

  protected onIconClick_(e: Event) {
    const icon = (e.currentTarget as HTMLElement).dataset['icon'] ?? '';
    this.$.menu.close();
    this.fire_('restyle', this.menuTarget_, {icon});
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
