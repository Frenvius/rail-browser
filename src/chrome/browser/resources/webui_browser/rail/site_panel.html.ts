import {html} from '//resources/lit/v3_0/lit.rollup.js';

import type {RailSitePanelElement} from './site_panel.js';

export function getHtml(this: RailSitePanelElement) {
  return html`<!--_html_template_start_-->
<div id="actions">
  <button class="action" data-action="share" title="Share"
    ?disabled="${!this.canShare_()}" @click="${this.onActionClick_}">
    <span class="icon" data-icon="share"></span>
  </button>
  <button class="action" data-action="copy-link" title="Copy link"
    @click="${this.onActionClick_}">
    <span class="icon" data-icon="link"></span>
  </button>
  <button class="action" data-action="screenshot"
    title="Copy screenshot of the page" @click="${this.onActionClick_}">
    <span class="icon" data-icon="camera"></span>
  </button>
  <button class="action" data-action="mini-window" title="Open in mini window"
    @click="${this.onActionClick_}">
    <span class="icon" data-icon="mini"></span>
  </button>
</div>
<div class="section">
  <div class="heading">Extensions</div>
  <div id="extensions">
    ${this.extensions_().map(extension => html`
      <div class="tile" ?pinned="${extension.pinned}"
        ?disabled="${!extension.enabled}">
        <button class="extension" data-id="${extension.id}"
          title="${extension.name}" aria-label="${extension.name}"
          @click="${this.onExtensionClick_}"
          @contextmenu="${this.onExtensionContextmenu_}">
          <img src="${extension.icon}" alt="">
        </button>
        <button class="pin" data-id="${extension.id}"
          title="${extension.pinned ? 'Unpin from top bar' : 'Pin to top bar'}"
          aria-pressed="${extension.pinned}" @click="${this.onPinClick_}">
          <span class="icon" data-icon="pin"></span>
        </button>
      </div>
    `)}
    <div class="tile">
      <button class="extension" data-action="extensions"
        title="Manage extensions" aria-label="Manage extensions"
        @click="${this.onActionClick_}">
        <span class="icon" data-icon="plus"></span>
      </button>
    </div>
  </div>
</div>
<div class="section" ?hidden="${this.permissions_().length === 0}">
  <div class="heading">Settings</div>
  ${this.permissions_().map(permission => html`
    <button class="permission" data-index="${permission.index}"
      ?on="${permission.on}" ?disabled="${!permission.toggleable}"
      role="switch" aria-checked="${permission.on}"
      @click="${this.onPermissionClick_}">
      <span class="badge">
        <span class="icon" data-icon="${permission.key}"></span>
      </span>
      <span class="text">
        <span class="label">${permission.label}</span>
        <span class="state">${permission.state}</span>
      </span>
    </button>
  `)}
</div>
<div id="footer">
  <button id="security" data-action="page-info" title="${this.securityTitle_()}"
    data-security="${this.security_()}" @click="${this.onActionClick_}">
    <span class="icon"
      data-icon="${this.security_() === 'insecure' ? 'warning' : 'lock'}">
    </span>
    <span>${this.securityLabel_()}</span>
  </button>
  <button id="more" data-action="site-settings" title="Site settings"
    aria-label="Site settings" @click="${this.onActionClick_}">
    <span class="icon" data-icon="more"></span>
  </button>
</div>
<!--_html_template_end_-->`;
}
