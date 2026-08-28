import '/strings.m.js';
import '../webui_browser_searchbox.js';

import {loadTimeData} from '//resources/js/load_time_data.js';
import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';
import {TabStripService} from '/tab_strip_api/tab_strip_api.mojom-webui.js';
import type {TabStripServiceRemote} from '/tab_strip_api/tab_strip_api.mojom-webui.js';
import type {Container, Tab} from '/tab_strip_api/tab_strip_api_data_model.mojom-webui.js';

import type {CommandContext} from '../rail_command.mojom-webui.js';
import {browserProxyFactory} from '../rail_command.mojom-webui.js';
import type {WebuiBrowserSearchboxElement} from '../webui_browser_searchbox.js';

import {getCss} from './command.css.js';
import {getHtml} from './command.html.js';
import type {CommandBarRow} from './command_registry.js';
import {matchCommands} from './command_registry.js';
import type {TabMenuTarget} from './tab_menu.js';

const TAB_LIMIT = 8;
const COMMAND_LIMIT = 6;

export interface RailCommandElement {
  $: {
    address: WebuiBrowserSearchboxElement,
  };
}

export class RailCommandElement extends CrLitElement {
  static get is() {
    return 'rail-command';
  }

  static override get styles() {
    return getCss();
  }

  override render() {
    return getHtml.bind(this)();
  }

  static override get properties() {
    return {
      rows_: {state: true, type: Array},
      selected_: {state: true, type: Number},
    };
  }

  protected accessor rows_: CommandBarRow[] = [];
  protected accessor selected_: number = -1;

  private readonly tabStripService_: TabStripServiceRemote =
      TabStripService.getRemote();
  private tabs_: Tab[] = [];
  private text_ = '';
  private target_: TabMenuTarget|null = null;

  override connectedCallback() {
    super.connectedCallback();
    browserProxyFactory.getInstance().callbackRouter.open.addListener(
        this.onOpen_.bind(this));
    this.addEventListener('keydown', e => this.onKeydown_(e), true);
  }

  private async onOpen_(
      text: string, selectAll: boolean, newTabMode: boolean, width: number,
      context: CommandContext) {
    document.body.style.width = `${width}px`;
    document.documentElement.style.setProperty(
        '--rail-space-color', context.spaceColor || '#ffffff');
    this.text_ = text.trim().toLowerCase();
    this.target_ = context.hasTab ? {
      id: '',
      tabId: null,
      url: '',
      pinned: context.pinned,
      essential: context.essential,
      dormant: false,
      muted: false,
      hasOthers: context.hasOthers,
      hasRight: context.hasRight,
      count: 1,
    } : null;

    this.$.address.rebindProxy();
    this.$.address.newTabMode = newTabMode;
    this.$.address.setInputText(text);
    this.$.address.focusInput();
    if (selectAll) {
      this.$.address.selectAll();
    }
    this.$.address.queryAutocomplete(text);

    await this.loadTabs_();
    this.refreshRows_();
    await this.updateComplete;
    browserProxyFactory.getInstance().handler.ready(
        Math.ceil(document.body.getBoundingClientRect().height));
  }

  private async loadTabs_() {
    const snapshot = await this.tabStripService_.getTabs();
    this.tabs_ = collectTabs(snapshot.tabStrip);
  }

  private query_(): string {
    return this.text_;
  }

  private refreshRows_() {
    const query = this.query_();
    const open = this.tabs_.filter(tab => !tab.isActive);
    const matched = query ?
        open.filter(
            tab => tab.title.toLowerCase().includes(query) ||
                tab.url.toLowerCase().includes(query)) :
        open;
    const tabs: CommandBarRow[] =
        matched.slice(0, TAB_LIMIT).map(tab => ({
                                          id: tab.id,
                                          kind: 'tab' as const,
                                          title: tab.title,
                                          hint: loadTimeData.getString(
                                              'commandBarSwitchToTab'),
                                          favicon: tab.favicon.dataUrl,
                                        }));
    const commands =
        matchCommands(query, this.target_).slice(0, COMMAND_LIMIT);
    this.rows_ = [...tabs, ...commands];
    this.selected_ = -1;
  }

  protected onInput_() {
    this.text_ = this.$.address.getInputElement()
                     .lastInput()
                     ?.text.trim()
                     .toLowerCase() ??
        '';
    this.refreshRows_();
  }

  private onKeydown_(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      browserProxyFactory.getInstance().handler.close();
      return;
    }
    if (!this.rows_.length) {
      return;
    }
    if (e.key === 'Enter') {
      if (this.selected_ >= 0) {
        this.consume_(e);
        this.run_(this.rows_[this.selected_]!);
      }
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
      return;
    }

    const down = e.key === 'ArrowDown';
    if (this.selected_ < 0) {
      if (down && this.atLastMatch_()) {
        this.consume_(e);
        this.enterRows_(0);
      }
      return;
    }

    const next = this.selected_ + (down ? 1 : -1);
    this.consume_(e);
    if (next < 0) {
      this.selected_ = -1;
      this.$.address.getDropdownElement().selectLast();
    } else if (next < this.rows_.length) {
      this.selected_ = next;
    }
  }

  private consume_(e: KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  private enterRows_(index: number) {
    this.selected_ = index;
    this.$.address.getDropdownElement().unselect();
  }

  private atLastMatch_(): boolean {
    const matches = this.$.address.result?.matches?.length ?? 0;
    return matches === 0 || this.$.address.selectedMatchIndex >= matches - 1;
  }

  protected onRowClick_(e: Event) {
    const index = (e.currentTarget as HTMLElement).dataset['index'];
    this.run_(this.rows_[Number(index)]!);
  }

  protected onSearchboxMatchOpened_() {
    browserProxyFactory.getInstance().handler.close();
  }

  private run_(row: CommandBarRow) {
    const proxy = browserProxyFactory.getInstance();
    if (row.kind === 'tab') {
      this.tabStripService_.activateTab(row.id);
      proxy.handler.close();
      return;
    }
    proxy.handler.runCommand(row.id);
  }
}

function collectTabs(container: Container): Tab[] {
  if (!container?.children) {
    return [];
  }
  return container.children.flatMap(child => {
    const nested = collectTabs(child);
    return child.data?.tab ? [child.data.tab, ...nested] : nested;
  });
}

declare global {
  interface HTMLElementTagNameMap {
    'rail-command': RailCommandElement;
  }
}

customElements.define(RailCommandElement.is, RailCommandElement);
