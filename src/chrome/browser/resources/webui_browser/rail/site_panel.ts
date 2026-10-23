import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import type {Extension, Permission, SiteState} from '../rail_site_panel.mojom-webui.js';
import {browserProxyFactory} from '../rail_site_panel.mojom-webui.js';

import {getCss} from './site_panel.css.js';
import {getHtml} from './site_panel.html.js';

const SECURITY_LABELS: Record<string, string> = {
  secure: 'Secure',
  internal: 'Rail page',
  insecure: 'Not secure',
};

export class RailSitePanelElement extends CrLitElement {
  static get is() {
    return 'rail-site-panel';
  }

  static override get styles() {
    return getCss();
  }

  override render() {
    return getHtml.bind(this)();
  }

  static override get properties() {
    return {
      state_: {type: Object, state: true},
    };
  }

  protected accessor state_: SiteState|null = null;

  override connectedCallback() {
    super.connectedCallback();
    browserProxyFactory.getInstance().callbackRouter.show.addListener(
        this.onShow_.bind(this));
    this.addEventListener('keydown', e => this.onKeydown_(e), true);
  }

  private async onShow_(state: SiteState) {
    document.documentElement.style.setProperty(
        '--rail-space-color', state.spaceColor || '#ffffff');
    this.state_ = state;
    await this.updateComplete;
    browserProxyFactory.getInstance().handler.ready(
        Math.ceil(document.body.getBoundingClientRect().height));
  }

  private onKeydown_(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      browserProxyFactory.getInstance().handler.close();
    }
  }

  protected extensions_(): Extension[] {
    return this.state_?.extensions ?? [];
  }

  protected permissions_(): Permission[] {
    return this.state_?.permissions ?? [];
  }

  protected canShare_(): boolean {
    return this.state_?.canShare ?? false;
  }

  protected security_(): string {
    return this.state_?.security ?? 'insecure';
  }

  protected securityLabel_(): string {
    return SECURITY_LABELS[this.security_()] ?? SECURITY_LABELS['insecure']!;
  }

  protected securityTitle_(): string {
    const host = this.state_?.host ?? '';
    const summary = this.state_?.securitySummary ?? '';
    return summary ? `${host}\n${summary}` : host;
  }

  protected onActionClick_(e: Event) {
    const action = (e.currentTarget as HTMLElement).dataset['action'] ?? '';
    browserProxyFactory.getInstance().handler.runAction(action);
  }

  private extensionId_(e: Event): string {
    return (e.currentTarget as HTMLElement).dataset['id'] ?? '';
  }

  protected onExtensionClick_(e: Event) {
    browserProxyFactory.getInstance().handler.activateExtension(
        this.extensionId_(e));
  }

  protected onExtensionContextmenu_(e: Event) {
    e.preventDefault();
    browserProxyFactory.getInstance().handler.showExtensionMenu(
        this.extensionId_(e));
  }

  protected onPinClick_(e: Event) {
    e.stopPropagation();
    const id = this.extensionId_(e);
    const extension = this.extensions_().find(item => item.id === id);
    if (extension) {
      browserProxyFactory.getInstance().handler.setExtensionPinned(
          id, !extension.pinned);
    }
  }

  protected onPermissionClick_(e: Event) {
    const index = Number((e.currentTarget as HTMLElement).dataset['index']);
    browserProxyFactory.getInstance().handler.togglePermission(index);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rail-site-panel': RailSitePanelElement;
  }
}

customElements.define(RailSitePanelElement.is, RailSitePanelElement);
