import {html, nothing} from '//resources/lit/v3_0/lit.rollup.js';

import type {RailSettingsElement} from './settings.js';

export function getHtml(this: RailSettingsElement) {
  return html`<!--_html_template_start_-->
<div id="titlebar">
  <button id="close" title="Close" @click="${this.onCloseClick_}">
    <cr-icon icon="cr:close"></cr-icon>
  </button>
</div>
${this.openRow_ ? html`
<div id="page">
  <div id="crumbs">
    <button id="back" title="Back" @click="${this.onBackClick_}">
      <cr-icon icon="cr:arrow-back"></cr-icon>
    </button>
    <button id="crumbroot" @click="${this.onBackClick_}">Profiles</button>
    <span id="crumbsep">/</span>
    ${this.renaming_ ? html`
      <input id="rename" .value="${this.openRow_.name}"
        @keydown="${this.onRenameKeydown_}" @blur="${this.onRenameBlur_}">
    ` : html`<span id="crumbname">${this.openRow_.name}</span>`}
    <button id="renamebutton" @click="${this.onRenameClick_}">
      Rename Profile
    </button>
  </div>
  ${this.detail_ ? html`
    <h2 class="section">Search Settings</h2>
    <div class="card">
      <span class="cardtitle">Search Engine</span>
      <select id="engine" @change="${this.onSearchEngineChange_}">
        ${this.detail_.searchEngines.map(engine => html`
          <option value="${engine.id}"
            ?selected="${this.isCurrentEngine_(engine.id)}">
            ${engine.name}
          </option>
        `)}
      </select>
    </div>
    <div class="card">
      <span class="cardtitle">Include search engine suggestions</span>
      <div class="control">
        <span class="cardhint">
          ${this.detail_.searchSuggestions ? 'On' : 'Off'}
        </span>
        <cr-toggle ?checked="${this.detail_.searchSuggestions}"
          @change="${this.onSuggestionsChange_}"></cr-toggle>
      </div>
    </div>
    <div class="card row" @click="${this.onAdvancedSearchClick_}">
      <span class="cardtitle">Advanced Search Settings</span>
      <cr-icon class="chevron" icon="cr:open-in-new"></cr-icon>
    </div>
  ` : nothing}
  <div id="danger">
    <span id="dangerhint">${this.deleteHint_()}</span>
    <button id="delete" ?disabled="${!this.canDelete_()}"
      @click="${this.onDeleteClick_}">${this.deleteLabel_()}</button>
  </div>
</div>
` : html`
<div id="page">
  <h1>Profiles</h1>
  <p id="intro">
    Profiles help keep your data separate across Spaces, like history, logins,
    cookies, and extensions. You can use any profile across one or more Spaces.
  </p>
  <div class="card" id="addcard">
    <span class="cardtitle">Add a new Profile</span>
    <button id="newprofile" ?disabled="${this.creating_}"
      @click="${this.onNewProfileClick_}">New Profile</button>
  </div>
  ${this.profiles_.map((row, index) => html`
    <div class="card row" data-index="${index}" @click="${this.onRowClick_}">
      <div class="rowtext">
        <span class="cardtitle">${row.name}</span>
        <span class="cardhint">${this.spacesLabel_(row)}</span>
      </div>
      <cr-icon class="chevron" icon="cr:chevron-right"></cr-icon>
    </div>
  `)}
  <h2 class="section">Sidebar</h2>
  <div class="card">
    <div class="rowtext">
      <span class="cardtitle">When collapsed</span>
      <span class="cardhint">Ctrl+S or the sidebar button collapses it</span>
    </div>
    <select id="sidebarcollapse" @change="${this.onSidebarCollapseChange_}">
      <option value="hidden" ?selected="${!this.sidebarIconsOnly_}">
        Hide completely
      </option>
      <option value="icons" ?selected="${this.sidebarIconsOnly_}">
        Show icons only
      </option>
    </select>
  </div>
  <h2 class="section">Top Bar</h2>
  <div class="card">
    <div class="rowtext">
      <span class="cardtitle">Match the site's color</span>
      <span class="cardhint">
        The top bar joins the page and takes the color of the site
      </span>
    </div>
    <cr-toggle ?checked="${this.themedTitlebar_}"
      @change="${this.onThemedTitlebarChange_}"></cr-toggle>
  </div>
  <h2 class="section">Tab Organizer</h2>
  <p class="sectionhint">
    Tidy sends the titles and hostnames of the open tabs in a Space to
    OpenRouter and groups them from the reply. Nothing is sent until a key is
    stored, and the key never leaves this device except as the request
    authorization.
  </p>
  <div class="card">
    <span class="cardtitle">OpenRouter API key</span>
    <div class="control">
      <span class="cardhint">${this.hasKey_ ? 'Stored' : 'Not set'}</span>
      <input id="apikey" type="password" placeholder="sk-or-..."
          @change="${this.onApiKeyChange_}">
      <button id="clearkey" ?disabled="${!this.hasKey_}"
          @click="${this.onClearKeyClick_}">Remove</button>
    </div>
  </div>
  <div class="card">
    <span class="cardtitle">Model</span>
    <input id="model" .value="${this.model_}" @change="${this.onModelChange_}">
  </div>
  <h2 class="section">About</h2>
  <div class="card row" @click="${this.onCreditsClick_}">
    <div class="rowtext">
      <span class="cardtitle">Credits</span>
      <span class="cardhint">
        Third-party software Rail ships, and its license terms
      </span>
    </div>
    <cr-icon class="chevron" icon="cr:open-in-new"></cr-icon>
  </div>
</div>
`}
<!--_html_template_end_-->`;
}
