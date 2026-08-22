import {html} from '//resources/lit/v3_0/lit.rollup.js';

import type {TabMenuElement} from './tab_menu.js';

export function getHtml(this: TabMenuElement) {
  // clang-format off
  return html`<!--_html_template_start_-->
<cr-action-menu id="menu">
  <button class="dropdown-item" @click="${this.onCopyLinkClick_}">
    Copy Link
  </button>
  <button class="dropdown-item" @click="${this.onDuplicateClick_}">
    Duplicate
  </button>
  <div class="dropdown-divider"></div>
  <button class="dropdown-item" @click="${this.onPinClick_}">
    ${this.pinLabel_()}
  </button>
  <button class="dropdown-item" @click="${this.onCloseClick_}">
    ${this.closeLabel_()}
  </button>
</cr-action-menu>
<!--_html_template_end_-->`;
  // clang-format on
}
