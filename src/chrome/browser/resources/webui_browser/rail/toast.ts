import {CrLitElement} from '//resources/lit/v3_0/lit.rollup.js';

import {getCss} from './toast.css.js';
import {getHtml} from './toast.html.js';

const VISIBLE_MS = 1800;

export class RailToastElement extends CrLitElement {
  static get is() {
    return 'rail-toast';
  }

  static override get styles() {
    return getCss();
  }

  override render() {
    return getHtml.bind(this)();
  }

  static override get properties() {
    return {
      message: {type: String},
      icon: {type: String},
      visible: {type: Boolean, reflect: true},
    };
  }

  accessor message: string = '';
  accessor icon: string = '';
  accessor visible: boolean = false;
  private timer_: number|null = null;

  show(message: string, icon: string) {
    this.message = message;
    this.icon = icon;
    this.place_();
    this.visible = true;
    if (this.timer_ !== null) {
      clearTimeout(this.timer_);
    }
    this.timer_ = setTimeout(() => {
      this.timer_ = null;
      this.visible = false;
    }, VISIBLE_MS);
  }

  private place_() {
    const content = document.querySelector('webui-browser-app')
                        ?.shadowRoot?.querySelector('#contentRegion');
    if (!content) {
      return;
    }
    const rect = content.getBoundingClientRect();
    this.style.top = `${Math.round(rect.top + 10)}px`;
    this.style.right = `${Math.round(window.innerWidth - rect.right + 10)}px`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rail-toast': RailToastElement;
  }
}

customElements.define(RailToastElement.is, RailToastElement);

export function showToast(message: string, icon: string) {
  let toast = document.querySelector('rail-toast');
  if (!toast) {
    toast = document.createElement('rail-toast');
    document.body.appendChild(toast);
  }
  toast.show(message, icon);
}
