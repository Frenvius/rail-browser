import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import {browserProxyFactory} from '../browser.mojom-webui.js';

import {getCss} from './update_badge.css.js';
import {getHtml} from './update_badge.html.js';

export class UpdateBadgeElement extends CrLitElement {
  static get is() {
    return 'rail-update-badge';
  }

  static override get styles() {
    return getCss();
  }

  override render() {
    return getHtml.bind(this)();
  }

  static override get properties() {
    return {
      ready: {type: Boolean, reflect: true},
      version_: {type: String, state: true},
      applying_: {type: Boolean, state: true},
    };
  }

  accessor ready: boolean = false;
  protected accessor version_ = '';
  protected accessor applying_ = false;
  private listenerId_: number|null = null;

  override connectedCallback() {
    super.connectedCallback();
    const proxy = browserProxyFactory.getInstance();
    this.listenerId_ = proxy.callbackRouter.onRailUpdateReady.addListener(
        (version: string) => this.show_(version));
    proxy.handler.getRailUpdate().then(({version}) => {
      if (version) {
        this.show_(version);
      }
    });
  }

  override disconnectedCallback() {
    if (this.listenerId_ !== null) {
      browserProxyFactory.getInstance().callbackRouter.removeListener(
          this.listenerId_);
      this.listenerId_ = null;
    }
    super.disconnectedCallback();
  }

  protected onClick_() {
    this.applying_ = true;
    browserProxyFactory.getInstance().handler.applyRailUpdate();
  }

  private show_(version: string) {
    this.version_ = version;
    this.ready = true;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rail-update-badge': UpdateBadgeElement;
  }
}

customElements.define(UpdateBadgeElement.is, UpdateBadgeElement);
