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
</div>
`}
<!--_html_template_end_-->`;
}
