import '//resources/cr_elements/cr_action_menu/cr_action_menu.js';

import type {CrActionMenuElement} from '//resources/cr_elements/cr_action_menu/cr_action_menu.js';
import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import type {Space} from './spaces.js';
import {getCss} from './tab_menu.css.js';
import {getHtml} from './tab_menu.html.js';

export interface TabMenuTarget {
  id: string;
  // Null while a pinned row has no tab behind it, which is also the only case
  // where |id| is the pinned key rather than a live tab id.
  tabId: string|null;
  url: string;
  pinned: boolean;
  dormant: boolean;
  hasOthers: boolean;
  hasRight: boolean;
}

export type TabCommand = 'close'|'close-others'|'close-right'|'copy-link'|
    'duplicate'|'move-to-space'|'pin'|'reload'|'unpin';

export interface TabCommandDetail {
  command: TabCommand;
  target: TabMenuTarget;
  spaceId: string;
}

export interface TabMenuElement {
  $: {
    menu: CrActionMenuElement,
  };
}

export class TabMenuElement extends CrLitElement {
  static get is() {
    return 'rail-tab-menu';
  }

  static override get styles() {
    return getCss();
  }

  override render() {
    return getHtml.bind(this)();
  }

  static override get properties() {
    return {
      target: {type: Object},
      spaces: {type: Array},
      activeSpace: {type: String},
    };
  }

  accessor target: TabMenuTarget|null = null;
  accessor spaces: Space[] = [];
  accessor activeSpace: string = '';

  protected otherSpaces_(): Space[] {
    return this.spaces.filter(space => space.id !== this.activeSpace);
  }

  openFor(target: TabMenuTarget, x: number, y: number) {
    this.target = target;
    this.$.menu.showAtPosition({top: y, left: x});
  }

  protected pinLabel_(): string {
    return this.target?.pinned ? 'Unpin' : 'Pin';
  }

  protected closeLabel_(): string {
    // A dormant row has no tab left to close, so the command drops the row
    // itself. Every other row, pinned or not, closes a live tab.
    return this.target?.dormant ? 'Remove' : 'Close Tab';
  }

  protected onReloadClick_() {
    this.fire_('reload');
  }

  protected onCopyLinkClick_() {
    this.fire_('copy-link');
  }

  protected onDuplicateClick_() {
    this.fire_('duplicate');
  }

  protected onPinClick_() {
    this.fire_(this.target?.pinned ? 'unpin' : 'pin');
  }

  protected onCloseClick_() {
    this.fire_('close');
  }

  protected onCloseOthersClick_() {
    this.fire_('close-others');
  }

  protected onCloseRightClick_() {
    this.fire_('close-right');
  }

  protected onMoveToSpaceClick_(e: Event) {
    const spaceId = (e.currentTarget as HTMLElement).dataset['id'] ?? '';
    this.fire_('move-to-space', spaceId);
  }

  private fire_(command: TabCommand, spaceId: string = '') {
    const target = this.target;
    if (!target) {
      return;
    }
    this.$.menu.close();
    this.fire<TabCommandDetail>('rail-tab-command', {command, target, spaceId});
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rail-tab-menu': TabMenuElement;
  }
}

customElements.define(TabMenuElement.is, TabMenuElement);
