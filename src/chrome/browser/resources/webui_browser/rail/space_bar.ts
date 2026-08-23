import '//resources/cr_elements/cr_action_menu/cr_action_menu.js';
import '//resources/cr_elements/cr_icon/cr_icon.js';
import '//resources/cr_elements/icons.html.js';

import type {CrActionMenuElement} from '//resources/cr_elements/cr_action_menu/cr_action_menu.js';
import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import {getCss} from './space_bar.css.js';
import {getHtml} from './space_bar.html.js';
import type {Space} from './spaces.js';

export type SpaceCommand = 'create'|'remove'|'rename'|'select';

export interface SpaceCommandDetail {
  command: SpaceCommand;
  id: string;
  name: string;
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
      variant: {type: String},
      editing_: {type: Boolean, state: true},
    };
  }

  accessor spaces: Space[] = [];
  accessor activeId: string = '';
  accessor variant: 'dots'|'title' = 'dots';
  protected accessor editing_ = false;
  private menuTarget_ = '';

  protected activeName_(): string {
    return this.spaces.find(space => space.id === this.activeId)?.name ?? '';
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
    this.$.menu.close();
    this.fire_('remove', this.menuTarget_);
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
      this.fire_('rename', this.activeId, value);
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

  private fire_(command: SpaceCommand, id: string, name: string = '') {
    this.fire<SpaceCommandDetail>('rail-space-command', {command, id, name});
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rail-space-bar': SpaceBarElement;
  }
}

customElements.define(SpaceBarElement.is, SpaceBarElement);
