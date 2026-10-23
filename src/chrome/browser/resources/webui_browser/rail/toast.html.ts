import {html} from '//resources/lit/v3_0/lit.rollup.js';

import type {RailToastElement} from './toast.js';

export function getHtml(this: RailToastElement) {
  return html`<!--_html_template_start_-->
<span id="message">${this.message}</span>
<span id="badge"><span class="icon" data-icon="${this.icon}"></span></span>
<!--_html_template_end_-->`;
}
