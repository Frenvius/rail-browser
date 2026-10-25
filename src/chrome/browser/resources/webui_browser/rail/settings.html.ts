import {html, nothing} from '//resources/lit/v3_0/lit.rollup.js';

import type {RailSettingsElement} from './settings.js';

export function getHtml(this: RailSettingsElement) {
  return html`<!--_html_template_start_-->
<div id="titlebar">
  <button id="close" title="Close" @click="${this.onCloseClick_}">
    <cr-icon icon="cr:close"></cr-icon>
  </button>
</div>
<div id="segments" role="tablist">
  ${this.sections_.map(section => html`
    <button class="segment" role="tab" data-section="${section.id}"
        aria-selected="${section.id === this.section_}"
        @click="${this.onSectionClick_}">${section.label}</button>
  `)}
</div>
<div id="page">
${this.section_ === 'general' ? html`
  <h2 class="section">Sidebar</h2>
  <div class="group">
    <div class="item">
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
    <div class="item">
      <div class="rowtext">
        <span class="cardtitle">Tab trails</span>
        <span class="cardhint">
          A link opened in a new tab joins a trail with the tab it came from
        </span>
      </div>
      <cr-toggle ?checked="${this.groupOpenedLinks_}"
        @change="${this.onGroupOpenedLinksChange_}"></cr-toggle>
    </div>
    ${this.groupOpenedLinks_ ? html`
      <div class="item">
        <div class="rowtext">
          <span class="cardtitle">Trail depth</span>
          <span class="cardhint">
            How many levels a trail nests before new links line up as siblings
          </span>
        </div>
        <select id="traildepth" @change="${this.onTrailDepthChange_}">
          ${this.trailDepthChoices_.map(choice => html`
            <option value="${choice.depth}"
              ?selected="${choice.depth === this.trailDepth_}">
              ${choice.label}
            </option>
          `)}
        </select>
      </div>
    ` : ''}
  </div>
  <h2 class="section">Inactive Tabs</h2>
  <div class="group">
    <div class="item">
      <div class="rowtext">
        <span class="cardtitle">Sleep inactive tabs after</span>
        <span class="cardhint">
          A sleeping tab frees its memory and reloads when you open it
        </span>
      </div>
      <select id="sleepafter" @change="${this.onSleepMinutesChange_}">
        ${this.sleepChoices_.map(choice => html`
          <option value="${choice.minutes}"
            ?selected="${choice.minutes === this.sleepMinutes_}">
            ${choice.label}
          </option>
        `)}
      </select>
    </div>
    <div class="item">
      <div class="rowtext">
        <span class="cardtitle">Never sleep these sites</span>
        <span class="cardhint">Covers the site and its subdomains</span>
      </div>
      <div class="control">
        <input id="sleepsite" placeholder="example.com"
            @keydown="${this.onSleepSiteKeydown_}">
        <button class="sitebutton" @click="${this.onAddSleepSiteClick_}">
          Add
        </button>
      </div>
    </div>
    ${this.sleepSites_.map(site => html`
      <div class="item">
        <span class="cardtitle">${site}</span>
        <button class="sitebutton" data-site="${site}"
            @click="${this.onRemoveSleepSiteClick_}">Remove</button>
      </div>
    `)}
  </div>
  <h2 class="section">Top Bar</h2>
  <div class="group">
    <div class="item">
      <div class="rowtext">
        <span class="cardtitle">Match the site's color</span>
        <span class="cardhint">
          The top bar joins the page and takes the color of the site
        </span>
      </div>
      <cr-toggle ?checked="${this.themedTitlebar_}"
        @change="${this.onThemedTitlebarChange_}"></cr-toggle>
    </div>
  </div>
` : nothing}
${this.section_ === 'profiles' && this.openRow_ ? html`
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
    <div class="group">
      <div class="item">
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
      <div class="item">
        <span class="cardtitle">Include search engine suggestions</span>
        <div class="control">
          <span class="cardhint">
            ${this.detail_.searchSuggestions ? 'On' : 'Off'}
          </span>
          <cr-toggle ?checked="${this.detail_.searchSuggestions}"
            @change="${this.onSuggestionsChange_}"></cr-toggle>
        </div>
      </div>
      <div class="item row" @click="${this.onAdvancedSearchClick_}">
        <span class="cardtitle">Advanced Search Settings</span>
        <cr-icon class="chevron" icon="cr:open-in-new"></cr-icon>
      </div>
    </div>
    <h2 class="section">Tabs</h2>
    <div class="group">
      <div class="item">
        <div class="rowtext">
          <span class="cardtitle">Archive untouched tabs after</span>
          <span class="cardhint">${this.archiveHint_()}</span>
        </div>
        <select id="archiveafter" @change="${this.onArchiveHoursChange_}">
          ${this.archiveChoices_.map(choice => html`
            <option value="${choice.hours}"
              ?selected="${choice.hours === this.profileArchiveHours_()}">
              ${choice.label}
            </option>
          `)}
        </select>
      </div>
    </div>
  ` : nothing}
  <div id="danger">
    <span id="dangerhint">${this.deleteHint_()}</span>
    <button id="delete" ?disabled="${!this.canDelete_()}"
      @click="${this.onDeleteClick_}">${this.deleteLabel_()}</button>
  </div>
` : nothing}
${this.section_ === 'profiles' && !this.openRow_ ? html`
  <p id="intro">
    Profiles help keep your data separate across Spaces, like history, logins,
    cookies, and extensions. You can use any profile across one or more Spaces.
  </p>
  <div class="group">
    <div class="item">
      <span class="cardtitle">Add a new Profile</span>
      <button id="newprofile" ?disabled="${this.creating_}"
        @click="${this.onNewProfileClick_}">New Profile</button>
    </div>
  </div>
  <div class="group">
    ${this.profiles_.map((row, index) => html`
      <div class="item row" data-index="${index}" @click="${this.onRowClick_}">
        <div class="rowtext">
          <span class="cardtitle">${row.name}</span>
          <span class="cardhint">${this.spacesLabel_(row)}</span>
        </div>
        <cr-icon class="chevron" icon="cr:chevron-right"></cr-icon>
      </div>
    `)}
  </div>
` : nothing}
${this.section_ === 'organizer' ? html`
  <p class="sectionhint">
    Tidy sends the titles and hostnames of the open tabs in a Space to
    OpenRouter and groups them from the reply. Nothing is sent until a key is
    stored, and the key never leaves this device except as the request
    authorization.
  </p>
  <div class="group">
    <div class="item">
      <div class="rowtext">
        <span class="cardtitle">OpenRouter API key</span>
        ${this.hasKey_ ? html`
          <span class="cardhint keystored">Encrypted on this device</span>
        ` : html`
          <span class="cardhint">Tidy stays off until a key is stored</span>
        `}
      </div>
      ${this.hasKey_ && !this.editingKey_ ? html`
        <div class="control">
          <button class="sitebutton" @click="${this.onReplaceKeyClick_}">
            Replace
          </button>
          <button id="clearkey" @click="${this.onClearKeyClick_}">
            Remove
          </button>
        </div>
      ` : html`
        <div class="control">
          <input id="apikey" type="password" placeholder="sk-or-..."
              @keydown="${this.onApiKeyKeydown_}">
          ${this.editingKey_ ? html`
            <button class="sitebutton" @click="${this.onCancelKeyClick_}">
              Cancel
            </button>
          ` : nothing}
          <button id="savekey" @click="${this.onSaveKeyClick_}">Save</button>
        </div>
      `}
    </div>
    <div class="item">
      <div class="rowtext">
        <span class="cardtitle">Model</span>
        <span class="cardhint">
          Price per million input / output tokens, October 2026
        </span>
      </div>
      <select id="modelchoice" @change="${this.onModelChoiceChange_}">
        ${this.models_.map(model => html`
          <option value="${model.id}"
            ?selected="${this.isListedModel_() && model.id === this.model_}">
            ${model.name} · ${model.price}
          </option>
        `)}
        <option value="custom" ?selected="${!this.isListedModel_()}">
          Custom model
        </option>
      </select>
    </div>
    ${this.isListedModel_() ? nothing : html`
      <div class="item">
        <div class="rowtext">
          <span class="cardtitle">Custom model</span>
          <span class="cardhint">Any OpenRouter model ID</span>
        </div>
        <input id="model" placeholder="vendor/model-name"
            .value="${this.customModelValue_()}"
            @change="${this.onModelChange_}">
      </div>
    `}
  </div>
` : nothing}
${this.section_ === 'about' ? html`
  <div class="group">
    <div class="item">
      <div class="aboutrail">
        <div class="aboutlogo"></div>
        <div class="rowtext">
          <span class="abouttitle">Rail</span>
          <span class="cardhint">
            ${this.railVersion_ ? `Version ${this.railVersion_}` :
                                  'Development build'}
            · Chromium ${this.chromiumVersion_}
          </span>
        </div>
      </div>
      <a class="sitebutton" href="https://github.com/Frenvius/rail-browser"
          @click="${this.onLinkClick_}">GitHub</a>
    </div>
    <div class="item">
      <div class="rowtext">
        <span class="cardtitle">Updates</span>
        <span class="cardhint">
          ${this.updateMessage_()}
          ${this.isUpdateReady_() ? html`
            <a href="https://github.com/Frenvius/rail-browser/releases/tag/v${
                this.readyVersion_}"
                @click="${this.onLinkClick_}">What's new</a>
          ` : nothing}
        </span>
      </div>
      ${this.isUpdateAvailable_() ? html`
        <button class="sitebutton" ?data-ready="${this.isUpdateReady_()}"
            ?disabled="${this.isUpdateBusy_()}"
            @click="${this.onUpdateClick_}">
          ${this.updateButtonLabel_()}
        </button>
      ` : nothing}
    </div>
  </div>
  <h2 class="section">Third-party software</h2>
  <div class="group">
    <div class="item credit">
      <div class="rowtext">
        <span class="cardtitle">uBlock Origin 1.74.0</span>
        <span class="cardhint">
          Raymond Hill &amp; contributors · GNU GPL, version 3
        </span>
        <p class="credittext">
          Preinstalled and removable from
          <a href="chrome://extensions" @click="${this.onLinkClick_}">
            chrome://extensions</a>.
          Shipped unmodified, with its license text inside. The source for this
          version is <code>uBlock-1.74.0-source.tar.gz</code> on the
          <a href="https://github.com/Frenvius/rail-browser/releases"
              @click="${this.onLinkClick_}">Rail release page</a>.
          Upstream:
          <a href="https://github.com/gorhill/uBlock"
              @click="${this.onLinkClick_}">github.com/gorhill/uBlock</a>.
        </p>
      </div>
    </div>
    <div class="item credit">
      <div class="rowtext">
        <span class="cardtitle">Chromium</span>
        <span class="cardhint">The Chromium Authors · BSD 3-Clause</span>
        <p class="credittext">
          The engine Rail is built on. Licenses for every component it bundles
          are at
          <a href="chrome://credits" @click="${this.onLinkClick_}">
            chrome://credits</a>.
        </p>
      </div>
    </div>
    <div class="item credit">
      <div class="rowtext">
        <span class="cardtitle">ungoogled-chromium</span>
        <span class="cardhint">
          The ungoogled-chromium Authors · BSD 3-Clause
        </span>
        <p class="credittext">
          The patch set that removes Google web service integration and
          background requests from the engine. Upstream:
          <a href="https://github.com/ungoogled-software/ungoogled-chromium"
              @click="${this.onLinkClick_}">
            github.com/ungoogled-software/ungoogled-chromium</a>.
        </p>
      </div>
    </div>
  </div>
` : nothing}
</div>
<!--_html_template_end_-->`;
}
