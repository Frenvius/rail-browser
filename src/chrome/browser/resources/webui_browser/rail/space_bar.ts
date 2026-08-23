import '//resources/cr_elements/cr_action_menu/cr_action_menu.js';
import '//resources/cr_elements/cr_icon/cr_icon.js';
import '//resources/cr_elements/icons.html.js';

import type {CrActionMenuElement} from '//resources/cr_elements/cr_action_menu/cr_action_menu.js';
import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import {getCss} from './space_bar.css.js';
import {getHtml} from './space_bar.html.js';
import type {Space} from './spaces.js';
import {SPACE_COLORS, SPACE_ICONS} from './spaces.js';

export type SpaceCommand =
    'create'|'move'|'remove'|'rename'|'restyle'|'select';

export interface SpaceCommandDetail {
  command: SpaceCommand;
  id: string;
  name: string;
  color: string;
  icon: string;
  delta: number;
}

export interface SpaceBarElement {
  $: {
    menu: CrActionMenuElement,
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
      activeId: {type: String},
      tabCounts: {type: Object},
      variant: {type: String},
      editing_: {type: Boolean, state: true},
      confirming_: {type: Boolean, state: true},
      menuTarget_: {type: String, state: true},
    };
  }

  accessor spaces: Space[] = [];
  accessor activeId: string = '';
  accessor tabCounts: Record<string, number> = {};
  accessor variant: 'dots'|'title' = 'dots';
  protected accessor editing_ = false;
  protected accessor confirming_ = false;
  protected accessor menuTarget_ = '';
  protected readonly colors = SPACE_COLORS;
  protected readonly icons = SPACE_ICONS;

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
    this.menuTarget_ = this.activeId;
    this.$.menu.showAtPosition({top: e.clientY, left: e.clientX});
  }

  protected onNameContextmenu_(e: MouseEvent) {
    e.preventDefault();
    this.menuTarget_ = this.activeId;
    this.$.menu.showAtPosition({top: e.clientY, left: e.clientX});
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
  }

  protected onColorClick_(e: Event) {
    const color = (e.currentTarget as HTMLElement).dataset['color'] ?? '';
    this.fire_('restyle', this.menuTarget_, {color});
  }

  protected onIconClick_(e: Event) {
    const icon = (e.currentTarget as HTMLElement).dataset['icon'] ?? '';
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
    this.fire<SpaceCommandDetail>(
        'rail-space-command',
        {command, id, name: '', color: '', icon: '', delta: 0, ...extra});
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rail-space-bar': SpaceBarElement;
  }
}

customElements.define(SpaceBarElement.is, SpaceBarElement);
