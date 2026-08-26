import {html} from '//resources/lit/v3_0/lit.rollup.js';

import type {TabMenuElement} from './tab_menu.js';

export function getHtml(this: TabMenuElement) {
  // clang-format off
  return html`<!--_html_template_start_-->
<cr-action-menu id="menu">
  <button class="dropdown-item" ?hidden="${!this.single_()}"
    @click="${this.onNewTabBelowClick_}">
    New Tab Below
  </button>
  <button class="dropdown-item"
    ?hidden="${!!this.target?.dormant || !this.single_()}"
    @click="${this.onReloadClick_}">
    Reload
  </button>
  <button class="dropdown-item" ?hidden="${!this.single_()}"
    @click="${this.onCopyLinkClick_}">
    Copy Link
  </button>
  <button class="dropdown-item" @click="${this.onDuplicateClick_}">
    Duplicate
  </button>
  <button class="dropdown-item" ?hidden="${!!this.target?.dormant}"
    @click="${this.onSleepClick_}">
    ${this.sleepLabel_()}
  </button>
  <button class="dropdown-item" ?hidden="${!!this.target?.dormant}"
    @click="${this.onMuteClick_}">
    ${this.muteLabel_()}
  </button>
  <div class="dropdown-divider"></div>
  <button class="dropdown-item" @click="${this.onPinClick_}">
    ${this.pinLabel_()}
  </button>
  <button class="dropdown-item" @click="${this.onEssentialClick_}">
    ${this.essentialLabel_()}
  </button>
  <button class="dropdown-item"
    ?hidden="${!this.target?.tabId || !this.target?.hasOthers}"
    @click="${this.onNewWindowClick_}">
    ${this.windowLabel_()}
  </button>
  ${this.target?.tabId ? this.windows.map(row => html`
    <button class="dropdown-item" data-id="${row.id}"
      @click="${this.onMoveToWindowClick_}">
      Move to ${this.windowTitle_(row)}
    </button>
  `) : ''}
  ${this.otherSpaces_().length ? html`
    <div class="dropdown-divider"></div>
    ${this.otherSpaces_().map(space => html`
      <button class="dropdown-item" data-id="${space.id}"
        @click="${this.onMoveToSpaceClick_}">
        Move to ${space.name}
      </button>
    `)}
  ` : ''}
  <div class="dropdown-divider"></div>
  <button class="dropdown-item" @click="${this.onCloseClick_}">
    ${this.closeLabel_()}
  </button>
  <button class="dropdown-item"
    ?hidden="${!this.target?.hasOthers || !this.single_()}"
    @click="${this.onCloseOthersClick_}">
    Close Other Tabs
  </button>
  <button class="dropdown-item"
    ?hidden="${!this.target?.hasRight || !this.single_()}"
    @click="${this.onCloseRightClick_}">
    Close Tabs to the Right
  </button>
</cr-action-menu>
<!--_html_template_end_-->`;
  // clang-format on
}
