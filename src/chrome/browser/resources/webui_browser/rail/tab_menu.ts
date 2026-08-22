import '//resources/cr_elements/cr_action_menu/cr_action_menu.js';

import type {CrActionMenuElement} from '//resources/cr_elements/cr_action_menu/cr_action_menu.js';
import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import {getCss} from './tab_menu.css.js';
import {getHtml} from './tab_menu.html.js';

export interface TabMenuTarget {
  id: string;
  url: string;
  pinned: boolean;
  dormant: boolean;
}

export type TabCommand = 'copy-link'|'duplicate'|'pin'|'unpin'|'close';

export interface TabCommandDetail {
  command: TabCommand;
  target: TabMenuTarget;
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
    };
  }

  accessor target: TabMenuTarget|null = null;

  openFor(target: TabMenuTarget, x: number, y: number) {
    this.target = target;
    this.$.menu.showAtPosition({top: y, left: x});
  }

  protected pinLabel_(): string {
    return this.target?.pinned ? 'Unpin' : 'Pin';
  }

  protected closeLabel_(): string {
    const target = this.target;
    return target && target.pinned && !target.dormant ? 'Close Tab' : 'Remove';
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

  private fire_(command: TabCommand) {
    const target = this.target;
    if (!target) {
      return;
    }
    this.$.menu.close();
    this.fire<TabCommandDetail>('rail-tab-command', {command, target});
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rail-tab-menu': TabMenuElement;
  }
}

customElements.define(TabMenuElement.is, TabMenuElement);
