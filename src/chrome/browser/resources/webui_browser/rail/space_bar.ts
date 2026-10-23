import '//resources/cr_elements/cr_button/cr_button.js';
import '//resources/cr_elements/cr_dialog/cr_dialog.js';
import '//resources/cr_elements/cr_icon/cr_icon.js';
import '//resources/cr_elements/icons.html.js';

import type {CrDialogElement} from '//resources/cr_elements/cr_dialog/cr_dialog.js';
import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';
import type {PropertyValues} from '//resources/lit/v3_0/lit.rollup.js';

import type {SystemBackdropMaterial} from '../browser.mojom-webui.js';
import {browserProxyFactory} from '../browser.mojom-webui.js';

import type {NativeMenuItem} from './native_menu.js';
import {menuItems, separator, showNativeMenu} from './native_menu.js';
import {INCOGNITO} from './sidebar_state.js';
import {getCss} from './space_bar.css.js';
import {getHtml} from './space_bar.html.js';
import type {SpaceMenuDetail} from './space_menu.js';
import {openSpaceMenu} from './space_menu.js';
import type {Space, SpaceProfile} from './spaces.js';
import {DEFAULT_MATERIAL, spaceHex} from './spaces.js';

export type SpaceCommand = 'create'|'export'|'move'|'newfolder'|'newgroup'|
    'newprofile'|'newtab'|'remove'|'rename'|'restyle'|'select'|'setprofile';

export interface SpaceCommandDetail {
  command: SpaceCommand;
  id: string;
  name: string;
  color: string;
  icon: string;
  delta: number;
  destination: string;
  profile: string;
}

export interface SpaceBarElement {
  $: {
    profileDialog: CrDialogElement,
  };
}

interface DotDrag {
  id: string;
  pointerId: number;
  startX: number;
  dot: HTMLElement;
  dots: HTMLElement[];
  centers: number[];
  pitch: number;
  from: number;
  to: number;
  moved: boolean;
}

const DRAG_THRESHOLD = 4;
const SPACE_KEYS = 8;

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
      compact_: {type: Boolean, state: true},
      visibleCount_: {type: Number, state: true},
      editing_: {type: Boolean, state: true},
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
  protected accessor compact_ = false;
  protected accessor visibleCount_ = 1;
  protected accessor editing_ = false;
  private readonly resizeObserver_ = new ResizeObserver(() =>
    this.updateSpaceLayout_());
  protected accessor profileName_ = '';
  protected accessor menuTarget_ = '';
  private menuX_ = 0;
  private menuY_ = 0;
  private drag_: DotDrag|null = null;
  private swallowClick_ = false;

  override connectedCallback() {
    super.connectedCallback();
    this.resizeObserver_.observe(this);
    this.updateSpaceLayout_();
  }

  override disconnectedCallback() {
    this.resizeObserver_.disconnect();
    super.disconnectedCallback();
  }

  override updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);
    const changedPrivateProperties =
        changedProperties as Map<PropertyKey, unknown>;
    if (changedProperties.has('spaces') || changedProperties.has('variant') ||
        changedPrivateProperties.has('editing_')) {
      this.updateSpaceLayout_();
    }
  }

  protected activeSpace_(): Space|undefined {
    return this.spaces.find(space => space.id === this.activeId);
  }

  protected visibleSpaces_(): Space[] {
    if (this.spaces.length <= this.visibleCount_) {
      return this.spaces;
    }
    const visible = this.spaces.slice(0, this.visibleCount_);
    const active = this.activeSpace_();
    if (active && !visible.includes(active)) {
      visible[visible.length - 1] = active;
    }
    return visible;
  }

  protected overflowSpaces_(): Space[] {
    const visible = new Set(this.visibleSpaces_().map(space => space.id));
    return this.spaces.filter(space => !visible.has(space.id));
  }

  protected hasOverflow_(): boolean {
    return this.overflowSpaces_().length > 0;
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
    if (INCOGNITO || !space) {
      return;
    }
    openSpaceMenu(
        {
          space,
          profiles: this.profiles,
          spaces: this.spaces,
          canRename: this.variant === 'title',
          canMoveLeft: this.canMove_(-1),
          canMoveRight: this.canMove_(1),
          canRemove: this.canRemove_(),
        },
        detail => this.runMenuCommand_(detail));
  }

  private runMenuCommand_(detail: SpaceMenuDetail) {
    switch (detail.command) {
      case 'export':
        this.fire_(
            'export', this.menuTarget_, {destination: detail.destination});
        return;
      case 'new-group':
        this.fire_('newgroup', this.menuTarget_);
        return;
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
          this.openRemoveConfirm_();
          return;
        }
        this.fire_('remove', this.menuTarget_);
        return;
    }
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

  private openRemoveConfirm_() {
    const count = this.removeCount_();
    showNativeMenu(
        [
          {
            label: `Delete ${this.targetSpace_()?.name ?? ''} and close ${
                count} tab${count === 1 ? '' : 's'}?`,
          },
          separator(),
          {command: 'cancel', label: 'Cancel'},
          {command: 'remove', label: 'Delete Space', danger: true},
        ],
        command => {
          if (command === 'remove') {
            this.fire_('remove', this.menuTarget_);
          }
        });
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

  protected dotTitle_(space: Space): string {
    const index = this.spaces.indexOf(space);
    const key = index < SPACE_KEYS       ? index + 1 :
        index === this.spaces.length - 1 ? SPACE_KEYS + 1 :
                                           0;
    return key ? `${space.name} (Alt+${key})` : space.name;
  }

  protected onDotClick_(e: Event) {
    if (this.swallowClick_) {
      this.swallowClick_ = false;
      return;
    }
    this.fire_('select', this.idOf_(e));
  }

  protected onDotPointerdown_(e: PointerEvent) {
    this.swallowClick_ = false;
    if (e.button !== 0 || INCOGNITO || this.drag_ || this.hasOverflow_() ||
        this.spaces.length < 2) {
      return;
    }
    const dot = e.currentTarget as HTMLElement;
    const dots = [...this.shadowRoot.querySelectorAll<HTMLElement>('.dot')];
    const centers = dots.map(each => {
      const rect = each.getBoundingClientRect();
      return rect.left + rect.width / 2;
    });
    const from = dots.indexOf(dot);
    this.drag_ = {
      id: this.idOf_(e),
      pointerId: e.pointerId,
      startX: e.clientX,
      dot,
      dots,
      centers,
      pitch: centers[1]! - centers[0]!,
      from,
      to: from,
      moved: false,
    };
    dot.setPointerCapture(e.pointerId);
    dot.addEventListener('pointermove', this.onDragMove_);
    dot.addEventListener('pointerup', this.onDragEnd_);
    dot.addEventListener('pointercancel', this.onDragEnd_);
  }

  private onDragMove_ = (e: PointerEvent) => {
    const drag = this.drag_;
    if (!drag || e.pointerId !== drag.pointerId) {
      return;
    }
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD) {
        return;
      }
      drag.moved = true;
      drag.dot.toggleAttribute('dragging', true);
    }
    const origin = drag.centers[drag.from]!;
    const center = Math.min(
        drag.centers[drag.centers.length - 1]!,
        Math.max(drag.centers[0]!, origin + e.clientX - drag.startX));
    drag.dot.style.transform = `translateX(${center - origin}px)`;
    drag.to =
        drag.centers
            .filter((other, index) => index !== drag.from && other < center)
            .length;
    drag.dots.forEach((dot, index) => {
      if (index === drag.from) {
        return;
      }
      const shift = index > drag.from && index <= drag.to ? -drag.pitch :
          index < drag.from && index >= drag.to           ? drag.pitch :
                                                            0;
      dot.style.transform = shift ? `translateX(${shift}px)` : '';
    });
  };

  private onDragEnd_ = async (e: PointerEvent) => {
    const drag = this.drag_;
    if (!drag || e.pointerId !== drag.pointerId) {
      return;
    }
    this.drag_ = null;
    drag.dot.removeEventListener('pointermove', this.onDragMove_);
    drag.dot.removeEventListener('pointerup', this.onDragEnd_);
    drag.dot.removeEventListener('pointercancel', this.onDragEnd_);
    if (drag.dot.hasPointerCapture(e.pointerId)) {
      drag.dot.releasePointerCapture(e.pointerId);
    }
    if (!drag.moved) {
      return;
    }
    this.swallowClick_ = e.type === 'pointerup';
    const dropX = drag.dot.getBoundingClientRect().left;
    this.toggleAttribute('settling', true);
    drag.dot.removeAttribute('dragging');
    for (const dot of drag.dots) {
      dot.style.transform = '';
    }
    if (e.type === 'pointerup' && drag.to !== drag.from) {
      const order = [...this.spaces];
      const [moved] = order.splice(drag.from, 1);
      order.splice(drag.to, 0, moved!);
      this.spaces = order;
      this.fire_('move', drag.id, {delta: drag.to - drag.from});
      await this.updateComplete;
    }
    const landed = this.shadowRoot.querySelector<HTMLElement>(
        `.dot[data-id="${drag.id}"]`);
    if (landed) {
      landed.style.transform =
          `translateX(${dropX - landed.getBoundingClientRect().left}px)`;
      void getComputedStyle(landed).transform;
    }
    this.removeAttribute('settling');
    if (landed) {
      landed.style.transform = '';
    }
  };

  protected onDotContextmenu_(e: MouseEvent) {
    e.preventDefault();
    this.openMenuFor_(this.idOf_(e), e.clientX, e.clientY);
  }

  protected onAddClick_() {
    showNativeMenu(this.newItems_(), command => this.runNewCommand_(command));
  }

  protected onMoreClick_() {
    showNativeMenu(menuItems([
      {label: 'Spaces'},
      ...this.overflowSpaces_().map(space => ({
        command: `select:${space.id}`,
        label: space.name,
      })),
      separator(),
      {label: 'New', children: this.newItems_()},
    ]), command => {
      if (command.startsWith('select:')) {
        this.fire_('select', command.slice('select:'.length));
      } else {
        this.runNewCommand_(command);
      }
    });
  }

  private newItems_(): NativeMenuItem[] {
    return [
      {command: 'create', label: 'New Space'},
      {command: 'newfolder', label: 'New Folder'},
      separator(),
      {command: 'newtab', label: 'New Tab', accelerator: 'Ctrl+T'},
    ];
  }

  private runNewCommand_(command: string) {
    if (command === 'create' || command === 'newfolder' ||
        command === 'newtab') {
      this.fire_(command, '');
    }
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
    if (INCOGNITO) {
      return;
    }
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

  private updateSpaceLayout_() {
    const width = this.shadowRoot.querySelector<HTMLElement>('#bar')
                      ?.clientWidth ?? this.clientWidth;
    if (!width) {
      return;
    }
    const visibleSlots = Math.max(1, Math.floor((width - 31) / 25));
    const iconSlots = Math.max(1, visibleSlots - 1);
    const compact = this.spaces.length > iconSlots;
    this.compact_ = compact;
    this.visibleCount_ = this.spaces.length > visibleSlots ?
        Math.max(1, visibleSlots - 1) : visibleSlots;
  }

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
      destination: '',
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
