import '//resources/cr_elements/cr_action_menu/cr_action_menu.js';

import type {CrActionMenuElement} from '//resources/cr_elements/cr_action_menu/cr_action_menu.js';
import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import {announceMenuOpen} from './menu_overlay.js';
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
  essential: boolean;
  dormant: boolean;
  muted: boolean;
  hasOthers: boolean;
  hasRight: boolean;
  count: number;
}

export type TabCommand = 'close'|'close-others'|'close-right'|'copy-link'|
    'duplicate'|'essential'|'move-to-space'|'move-to-window'|'mute'|
    'new-tab-below'|'new-window'|'pin'|'reload'|'sleep'|'unpin';

export interface WindowRow {
  id: number;
  title: string;
}

export interface TabCommandDetail {
  command: TabCommand;
  target: TabMenuTarget;
  spaceId: string;
  windowId: number;
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
      windows: {type: Array},
    };
  }

  accessor target: TabMenuTarget|null = null;
  accessor spaces: Space[] = [];
  accessor activeSpace: string = '';
  accessor windows: WindowRow[] = [];

  protected otherSpaces_(): Space[] {
    return this.spaces.filter(space => space.id !== this.activeSpace);
  }

  openFor(target: TabMenuTarget, x: number, y: number) {
    this.target = target;
    this.$.menu.showAtPosition({top: y, left: x});
    announceMenuOpen(this.$.menu);
  }

  private many_(): number {
    return this.target && this.target.count > 1 ? this.target.count : 0;
  }

  private noun_(): string {
    const many = this.many_();
    return many ? `${many} Tabs` : 'Tab';
  }

  protected single_(): boolean {
    return this.many_() === 0;
  }

  protected pinLabel_(): string {
    return `${this.target?.pinned ? 'Unpin' : 'Pin'} ${this.noun_()}`;
  }

  protected windowLabel_(): string {
    return `Move ${this.noun_()} to New Window`;
  }

  protected sleepLabel_(): string {
    return `Sleep ${this.noun_()}`;
  }

  protected closeLabel_(): string {
    // A dormant row has no tab left to close, so the command drops the row
    // itself. Every other row, pinned or not, closes a live tab.
    if (this.target?.dormant) {
      return 'Remove';
    }
    return `Close ${this.noun_()}`;
  }

  protected onNewTabBelowClick_() {
    this.fire_('new-tab-below');
  }

  protected onNewWindowClick_() {
    this.fire_('new-window');
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

  protected onSleepClick_() {
    this.fire_('sleep');
  }

  protected muteLabel_(): string {
    return `${this.target?.muted ? 'Unmute' : 'Mute'} ${this.noun_()}`;
  }

  protected onMuteClick_() {
    this.fire_('mute');
  }

  protected essentialLabel_(): string {
    return this.target?.essential ? 'Remove from Essentials' :
                                    'Add to Essentials';
  }

  protected onEssentialClick_() {
    this.fire_('essential');
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

  protected onMoveToWindowClick_(e: Event) {
    const id = (e.currentTarget as HTMLElement).dataset['id'] ?? '';
    this.fire_('move-to-window', '', Number(id));
  }

  protected windowTitle_(row: WindowRow): string {
    return row.title || 'Untitled Window';
  }

  private fire_(command: TabCommand, spaceId = '', windowId = 0) {
    const target = this.target;
    if (!target) {
      return;
    }
    this.$.menu.close();
    this.fire<TabCommandDetail>(
        'rail-tab-command', {command, target, spaceId, windowId});
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rail-tab-menu': TabMenuElement;
  }
}

customElements.define(TabMenuElement.is, TabMenuElement);
