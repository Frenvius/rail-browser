import '//resources/cr_elements/cr_icon/cr_icon.js';
import '//resources/cr_elements/icons.html.js';
import './update_badge.js';

import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';
import type {PropertyValues} from '//resources/lit/v3_0/lit.rollup.js';

import type {SystemBackdropMaterial} from '../browser.mojom-webui.js';
import {browserProxyFactory} from '../browser.mojom-webui.js';

import type {Download} from './downloads.js';
import {downloadStatus, DownloadState, fileIconUrl, isMoving, onDownloadsRebound, overallProgress, rankRecent, startedAgo} from './downloads.js';
import type {NativeMenuItem} from './native_menu.js';
import {menuItems, separator, showNativeMenu} from './native_menu.js';
import {INCOGNITO} from './sidebar_state.js';
import {getCss} from './space_bar.css.js';
import {getHtml} from './space_bar.html.js';
import type {SpaceMenuContext, SpaceMenuDetail} from './space_menu.js';
import {openSpaceMenu, openSpaceProfileMenu} from './space_menu.js';
import type {Space, SpaceProfile} from './spaces.js';
import {DEFAULT_MATERIAL, spaceHex} from './spaces.js';

export type SpaceCommand = 'create'|'export'|'library'|'move'|'newfolder'|
    'newgroup'|'newtab'|'remove'|'rename'|'select'|'setprofile';

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
const SLOT_WIDTH = 25;
const COMPACT_SLOT_WIDTH = 14;
const BAR_CHROME_WIDTH = 62;
const SPACE_KEYS = 8;
const CARD_LINGER_MS = 1000;
const CARD_EXIT_MS = 500;
const RING_LENGTH = 2 * Math.PI * 10;
const FLIGHT_MS = 700;
const FLIGHT_STEPS = 36;
const FLIGHT_CHIP = 44;
const FLIGHT_ICON = 28;
const FLIGHT_RISE = 140;
const FLIGHT_POP = 0.15;

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
      menuTarget_: {type: String, state: true},
      recent_: {type: Array, state: true},
      progress_: {type: Number, state: true},
      cardShown_: {type: Boolean, state: true},
      cardVisible_: {type: Boolean, state: true},
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
  protected accessor menuTarget_ = '';
  private menuX_ = 0;
  private menuY_ = 0;
  private menuRename_: (() => void)|null = null;
  private drag_: DotDrag|null = null;
  private swallowClick_ = false;
  protected accessor recent_: Download[] = [];
  protected accessor progress_: number|null = null;
  protected accessor cardShown_ = false;
  protected accessor cardVisible_ = false;
  private hovered_ = new Set<string>();
  private cardTimer_ = 0;
  private unsubscribe_: Array<() => void> = [];
  private unrebind_: (() => void)|null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.resizeObserver_.observe(this);
    this.updateSpaceLayout_();
    if (this.variant === 'dots' && !INCOGNITO) {
      this.unrebind_ = onDownloadsRebound(() => this.watchDownloads_());
      this.watchDownloads_();
    }
  }

  override disconnectedCallback() {
    this.resizeObserver_.disconnect();
    this.unsubscribe_.forEach(unsubscribe => unsubscribe());
    this.unsubscribe_ = [];
    this.unrebind_?.();
    this.unrebind_ = null;
    clearTimeout(this.cardTimer_);
    super.disconnectedCallback();
  }

  private watchDownloads_() {
    this.unsubscribe_.forEach(unsubscribe => unsubscribe());
    const list = downloadStatus();
    const sync = () => {
      this.recent_ = rankRecent(list.items);
      this.progress_ = overallProgress(list.items);
      if (!this.recent_.length) {
        this.dismissCard_();
      }
    };
    this.unsubscribe_ = [
      list.subscribe(sync),
      list.onFinish(() => this.bounce_()),
      list.onStart(item => this.fly_(item)),
    ];
    sync();
  }

  private fly_(item: Download) {
    const target = this.shadowRoot.querySelector('#library');
    const content = document.querySelector('webui-browser-app')
                        ?.shadowRoot?.querySelector('#contentRegion');
    if (!target || !content || !item.filePath ||
        matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const end = target.getBoundingClientRect();
    if (!end.width || end.right <= 0 || end.left >= window.innerWidth) {
      return;
    }
    const start = content.getBoundingClientRect();
    const sx = start.left + start.width / 2;
    const sy = start.top + start.height / 2;
    const ex = end.left + end.width / 2;
    const ey = end.top + end.height / 2;
    const cx = (sx + ex) / 2;
    const cy = Math.min(sy, ey) - FLIGHT_RISE;
    const frames = Array.from({length: FLIGHT_STEPS + 1}, (_, step) => {
      const p = step / FLIGHT_STEPS;
      const t = p * p;
      const u = 1 - t;
      const x = u * u * sx + 2 * u * t * cx + t * t * ex - FLIGHT_CHIP / 2;
      const y = u * u * sy + 2 * u * t * cy + t * t * ey - FLIGHT_CHIP / 2;
      const scale = p < FLIGHT_POP ?
          0.6 + 0.55 * p / FLIGHT_POP :
          1.15 - 0.7 * (p - FLIGHT_POP) / (1 - FLIGHT_POP);
      return {
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        opacity: p < 0.9 ? 1 : (1 - p) / 0.1,
      };
    });
    const chip = document.createElement('div');
    Object.assign(chip.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: `${FLIGHT_CHIP}px`,
      height: `${FLIGHT_CHIP}px`,
      display: 'grid',
      placeItems: 'center',
      boxSizing: 'border-box',
      background: 'color-mix(in srgb, var(--rail-space-color, #7c5cfc) 38%,' +
          ' rgb(20 20 24))',
      border: '1px solid rgb(255 255 255 / 16%)',
      borderRadius: '12px',
      boxShadow: '0 8px 24px rgb(0 0 0 / 40%), 0 2px 6px rgb(0 0 0 / 30%)',
      pointerEvents: 'none',
      zIndex: '1000',
    });
    const icon = document.createElement('img');
    icon.src = fileIconUrl(item);
    icon.alt = '';
    icon.width = icon.height = FLIGHT_ICON;
    chip.appendChild(icon);
    icon.decode().then(() => {
      document.body.appendChild(chip);
      chip.animate(frames, {duration: FLIGHT_MS}).onfinish = () => {
        chip.remove();
        this.bounce_();
      };
    }, () => {});
  }

  private bounce_() {
    this.shadowRoot.querySelector('#library')?.animate(
        [
          {transform: 'none'},
          {transform: 'translateY(-4px) scale(1.12)'},
          {transform: 'translateY(1px) scale(0.96)'},
          {transform: 'none'},
        ],
        {duration: 460, easing: 'cubic-bezier(.3, 0, .2, 1)'});
  }

  protected ringOffset_(): number {
    const progress = this.progress_ ?? 0;
    return RING_LENGTH * (1 - (progress < 0 ? 0.25 : progress));
  }

  protected ringLength_(): number {
    return RING_LENGTH;
  }

  protected isMoving_(item: Download): boolean {
    return isMoving(item);
  }

  protected canDrag_(item: Download): boolean {
    return item.state === DownloadState.kComplete &&
        !item.fileExternallyRemoved;
  }

  protected cardIcon_(item: Download): string {
    return fileIconUrl(item);
  }

  protected cardProgress_(item: Download): number {
    return RING_LENGTH * (1 - Math.max(0, item.percent) / 100);
  }

  protected cardStatus_(item: Download): string {
    if (isMoving(item)) {
      return item.progressStatusText || 'Starting';
    }
    switch (item.state) {
      case DownloadState.kComplete:
        return item.fileExternallyRemoved ? 'Deleted' :
                                            startedAgo(item.started, Date.now());
      case DownloadState.kPaused:
        return 'Paused';
      case DownloadState.kCancelled:
        return 'Canceled';
      case DownloadState.kInterrupted:
        return 'Failed';
      default:
        return 'Needs review';
    }
  }

  protected onLibraryClick_() {
    this.dismissCard_(true);
    this.fire_('library', '');
  }

  protected onLibraryPointerenter_(e: PointerEvent) {
    this.hovered_.add((e.currentTarget as HTMLElement).id);
    if (!this.recent_.length || this.drag_) {
      return;
    }
    clearTimeout(this.cardTimer_);
    this.cardShown_ = true;
    requestAnimationFrame(() => this.cardVisible_ = this.cardShown_);
  }

  protected onLibraryPointerleave_(e: PointerEvent) {
    this.hovered_.delete((e.currentTarget as HTMLElement).id);
    clearTimeout(this.cardTimer_);
    this.cardTimer_ = setTimeout(() => {
      if (!this.hovered_.size) {
        this.dismissCard_();
      }
    }, CARD_LINGER_MS);
  }

  private dismissCard_(now = false) {
    clearTimeout(this.cardTimer_);
    this.cardVisible_ = false;
    if (now) {
      this.cardShown_ = false;
      return;
    }
    this.cardTimer_ = setTimeout(() => {
      if (!this.cardVisible_) {
        this.cardShown_ = false;
      }
    }, CARD_EXIT_MS);
  }

  protected onCardRowClick_(e: Event) {
    const id = (e.currentTarget as HTMLElement).dataset['id'] ?? '';
    const item = this.recent_.find(one => one.id === id);
    if (item && this.canDrag_(item)) {
      downloadStatus().handler.show(id);
    } else {
      this.onLibraryClick_();
    }
  }

  protected onCardShowClick_(e: Event) {
    e.stopPropagation();
    downloadStatus().handler.show(
        (e.currentTarget as HTMLElement).dataset['id'] ?? '');
  }

  protected onCardRemoveClick_(e: Event) {
    e.stopPropagation();
    downloadStatus().handler.remove(
        (e.currentTarget as HTMLElement).dataset['id'] ?? '');
  }

  protected onCardRowDragstart_(e: DragEvent) {
    e.preventDefault();
    const id = (e.currentTarget as HTMLElement).dataset['id'] ?? '';
    downloadStatus().handler.drag(id);
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

  openMenuFor(id: string, x: number, y: number, rename?: () => void) {
    this.openMenuFor_(id, x, y, rename);
  }

  openPicker(id: string, kind: 'color'|'icon', x: number, y: number) {
    this.aim_(id, x, y);
    this.openPicker_(kind);
  }

  openProfileMenuFor(id: string, x: number, y: number) {
    const context = this.aim_(id, x, y);
    if (context) {
      openSpaceProfileMenu(context, detail => this.runMenuCommand_(detail));
    }
  }

  private aim_(id: string, x: number, y: number, rename?: () => void):
      SpaceMenuContext|null {
    this.menuTarget_ = id;
    this.menuX_ = x;
    this.menuY_ = y;
    this.menuRename_ = rename ?? null;
    const space = this.targetSpace_();
    if (INCOGNITO || !space) {
      return null;
    }
    return {
      space,
      profiles: this.profiles,
      spaces: this.spaces,
      canRename: this.variant === 'title' || !!rename,
      canMoveLeft: this.canMove_(-1),
      canMoveRight: this.canMove_(1),
      canRemove: this.canRemove_(),
    };
  }

  private openMenuFor_(
      id: string, x: number, y: number, rename?: () => void) {
    const context = this.aim_(id, x, y, rename);
    if (context) {
      openSpaceMenu(context, detail => this.runMenuCommand_(detail));
    }
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
        if (this.menuRename_) {
          this.menuRename_();
          return;
        }
        void this.startEditing_();
        return;
      case 'set-profile':
        this.fire_('setprofile', this.menuTarget_, {profile: detail.profile});
        return;
      case 'new-profile':
        this.openPicker_('profile');
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

  private openPicker_(kind: 'color'|'icon'|'profile') {
    const space = this.targetSpace_();
    if (!space) {
      return;
    }
    browserProxyFactory.getInstance().handler.openRailSpacePanel(
        {
          kind,
          spaceId: space.id,
          style: {
            color: space.color,
            gradient: space.gradient,
            grain: space.grain,
            icon: space.icon,
            material: this.material,
          },
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
      pitch: dot.getBoundingClientRect().width,
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
    const dotsWidth = width - BAR_CHROME_WIDTH;
    const iconSlots = Math.floor(dotsWidth / SLOT_WIDTH);
    this.compact_ = this.spaces.length > iconSlots;
    if (!this.compact_) {
      this.visibleCount_ = this.spaces.length;
      return;
    }
    const compactSlots = this.compactSlots_(dotsWidth);
    this.visibleCount_ = this.spaces.length > compactSlots ?
        this.compactSlots_(dotsWidth - SLOT_WIDTH) :
        compactSlots;
  }

  private compactSlots_(width: number): number {
    const dots = Math.floor((width - SLOT_WIDTH) / COMPACT_SLOT_WIDTH);
    return 1 + Math.max(0, dots);
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
