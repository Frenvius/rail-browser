import {html, nothing} from '//resources/lit/v3_0/lit.rollup.js';
import type {TemplateResult} from '//resources/lit/v3_0/lit.rollup.js';

import type {ImportSource} from '../rail_import.mojom-webui.js';
import {ImportState} from '../rail_import.mojom-webui.js';

import type {RailImportElement, SetupChoices, StepRow} from './import.js';
import type {StepIcon} from './import_steps.js';
import {describeCounts, hasData} from './import_steps.js';

type Glyph = StepIcon|'browser'|'check'|'close'|'cross'|'folder'|'lock'|'return';

export function glyph(name: Glyph): TemplateResult {
  switch (name) {
    case 'key':
      return html`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>
      </svg>`;
    case 'clock':
      return html`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
      </svg>`;
    case 'cookie':
      return html`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 9 9 4 4 0 0 1-4-4 4 4 0 0 1-5-5z"/>
        <circle cx="9" cy="10" r=".6"/><circle cx="14" cy="15" r=".6"/>
      </svg>`;
    case 'puzzle':
      return html`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H4v-4a2 2 0 1 0 0-4z"/>
      </svg>`;
    case 'star':
      return html`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>
      </svg>`;
    case 'pin':
      return html`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>
      </svg>`;
    case 'grid':
      return html`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="6" height="6" rx="1"/>
        <rect x="14" y="4" width="6" height="6" rx="1"/>
        <rect x="4" y="14" width="6" height="6" rx="1"/>
        <rect x="14" y="14" width="6" height="6" rx="1"/>
      </svg>`;
    case 'bookmark':
      return html`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h12v18l-6-4-6 4z"/>
      </svg>`;
    case 'folder':
      return html`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h6l2 2h10v11H3z"/>
      </svg>`;
    case 'browser':
      return html`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18"/>
      </svg>`;
    case 'check':
      return html`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5"/>
      </svg>`;
    case 'close':
      return html`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18"/>
      </svg>`;
    case 'cross':
      return html`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 7l10 10M17 7L7 17"/>
      </svg>`;
    case 'lock':
      return html`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2"/>
        <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
      </svg>`;
    case 'return':
      return html`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19 6v6H6M10 8l-4 4 4 4"/>
      </svg>`;
  }
}

function stateBadge(row: StepRow): TemplateResult {
  switch (row.state) {
    case ImportState.kRunning:
      return html`<span class="spinner" role="status" aria-label="Running"></span>`;
    case ImportState.kDone:
      return html`${glyph('check')}<span class="sr-only">Done</span>`;
    case ImportState.kFailed:
      return html`${glyph('cross')}<span class="sr-only">Failed</span>`;
    case ImportState.kSkipped:
      return html`<span class="badge">${row.locked ? 'Locked' : 'Skipped'}</span>`;
    default:
      return html`<span class="dot" aria-hidden="true"></span><span class="sr-only">Waiting</span>`;
  }
}

function stepList(this: RailImportElement): TemplateResult {
  return html`
    <div class="steps-frame">
      <ol class="steps" aria-live="polite">
        ${this.stepRows_().map(row => html`
          <li class="step" data-state="${row.state}">
            <span class="step-icon">${glyph(row.icon)}</span>
            <span class="step-label">${row.label}</span>
            <span class="step-detail">${row.detail}</span>
            <span class="step-state">${stateBadge(row)}</span>
          </li>
        `)}
      </ol>
    </div>`;
}

function pickScreen(this: RailImportElement): TemplateResult {
  return html`
    <h1>${this.firstRun_ ? 'Bring your browsing with you' :
                           'Import from another browser'}</h1>
    <p class="lede">Your spaces, tabs, history, cookies, passwords and
      extensions come along. Nothing already in Rail is replaced.</p>
    <div class="list" role="radiogroup" aria-label="Browsers">
      ${this.sources_.map(source => sourceRow.bind(this)(source))}
    </div>
    ${this.sources_.length === 0 ? html`
      <p class="empty">No supported browser was found on this computer.</p>
    ` : nothing}
    <footer class="actions">
      ${this.firstRun_ ? html`
        <button class="ghost" @click="${this.onSkipClick_}">Skip</button>
      ` : nothing}
      <button class="primary" ?disabled="${!this.canContinuePick_()}"
        @click="${this.onPrimaryClick_}">
        Continue ${glyph('return')}
      </button>
    </footer>`;
}

function sourceIcon(source: ImportSource): TemplateResult {
  if (source.icon) {
    return html`<img alt="" src="${source.icon}">`;
  }
  if (source.iconPath) {
    return html`<img alt="" src="chrome://fileicon/?path=${encodeURIComponent(source.iconPath)}&scale=2x">`;
  }
  return glyph('browser');
}

function sourceRow(this: RailImportElement, source: ImportSource): TemplateResult {
  return html`
    <label class="row ${this.sourceDisabledHint_(source) ? 'disabled' : ''}">
      <span class="app-icon">
        ${sourceIcon(source)}
      </span>
      <span class="row-text">
        <span class="name">${source.name}</span>
        ${this.sourceDisabledHint_(source) ?
            html`<span class="hint">${this.sourceDisabledHint_(source)}</span>` :
            nothing}
      </span>
      <input type="radio" name="source" value="${source.id}"
        .checked="${this.flow_.sourceId === source.id}"
        ?disabled="${this.sourceDisabledHint_(source) !== ''}"
        @change="${this.onSourceChange_}">
    </label>`;
}

function profilesScreen(this: RailImportElement): TemplateResult {
  return html`
    <h1>Choose profiles</h1>
    <p class="lede">${this.sourceName_()} has more than one profile. Pick the
      ones to bring over.</p>
    <div class="list">
      ${(this.selectedSource_()?.profiles ?? []).map(profile => html`
        <label class="row choice ${hasData(profile.counts) ? '' : 'disabled'}">
          <span class="row-text">
            <span class="name">${profile.name}</span>
            <span class="hint single" title="${describeCounts(profile.counts)}">
              ${describeCounts(profile.counts)}</span>
            ${this.profileLocked_(profile) ? html`
              <span class="note">Some data is locked by ${this.sourceName_()}</span>
            ` : nothing}
          </span>
          <input type="checkbox" value="${profile.dir}"
            .checked="${this.flow_.dirs.includes(profile.dir)}"
            ?disabled="${!hasData(profile.counts)}"
            @change="${this.onProfileChange_}">
        </label>
      `)}
    </div>
    <footer class="actions">
      <button class="ghost" @click="${this.onBackClick_}">Back</button>
      <button class="primary" ?disabled="${!this.canStartSelected_()}"
        @click="${this.onPrimaryClick_}">Import</button>
    </footer>`;
}

function importingScreen(this: RailImportElement): TemplateResult {
  return html`
    <h1>Importing from ${this.sourceName_()}</h1>
    <p class="lede">This may take a moment.</p>
    <p class="status" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      ${this.currentProfileName_() ?
          `Importing data from profile ${this.currentProfileName_()}` :
          'Preparing your data'}
    </p>
    ${stepList.bind(this)()}`;
}

function doneScreen(this: RailImportElement): TemplateResult {
  return html`
    <h1>${this.doneTitle_()}</h1>
    <p class="lede">${this.flow_.summary?.message ?? ''}</p>
    ${this.flow_.events.size > 0 ? stepList.bind(this)() : nothing}
    ${this.lockedNotes_().map(note => html`<p class="note">${note}</p>`)}
    <footer class="actions">
      <button class="primary" @click="${this.onPrimaryClick_}">
        ${this.firstRun_ ? 'Continue' : 'Done'}
      </button>
    </footer>`;
}

function setupRow(this: RailImportElement, key: keyof SetupChoices, title: string, description: string): TemplateResult {
  return html`
    <label class="row choice">
      <span class="row-text">
        <span class="name">${title}</span>
        <span class="hint">${description}</span>
      </span>
      <input type="checkbox" value="${key}"
        .checked="${this.setup_.choices[key]}"
        @change="${this.onSetupChange_}">
    </label>`;
}

function finalScreen(this: RailImportElement): TemplateResult {
  return html`
    <h1>Finish setting up Rail</h1>
    <p class="lede">Choose what Rail should do for you. You can change these
      later in Settings.</p>
    <div class="list">
      ${setupRow.bind(this)(
          'defaultBrowser', 'Set Rail as default browser',
          this.setup_.isDefault ? 'Rail is already your default browser' :
                                  'Open links and web pages in Rail by default')}
      ${this.setup_.canPin ? setupRow.bind(this)(
          'taskbar', 'Add Rail to taskbar',
          'Quick access to Rail whenever you need it') : nothing}
      ${setupRow.bind(this)(
          'login', 'Open Rail at login',
          'Automatically open Rail when you sign in')}
    </div>
    <footer class="actions">
      <button class="primary" @click="${this.onPrimaryClick_}">Get started
        ${glyph('return')}</button>
    </footer>`;
}

export function screen(this: RailImportElement): TemplateResult {
  switch (this.flow_.screen) {
    case 'pick':
      return pickScreen.bind(this)();
    case 'profiles':
      return profilesScreen.bind(this)();
    case 'importing':
      return importingScreen.bind(this)();
    case 'done':
      return doneScreen.bind(this)();
    case 'final':
      return finalScreen.bind(this)();
  }
}

export function orbit(): TemplateResult {
  return html`
    <div class="art-stage" aria-hidden="true">
      <span class="ring ring-1"></span>
      <span class="ring ring-2"></span>
      <span class="ring ring-3"></span>
      <span class="logo"></span>
      <span class="track">
        <span class="sat sat-1">${glyph('bookmark')}</span>
        <span class="sat sat-2">${glyph('key')}</span>
        <span class="sat sat-3">${glyph('clock')}</span>
        <span class="sat sat-4">${glyph('puzzle')}</span>
        <span class="sat sat-5">${glyph('folder')}</span>
        <span class="sat sat-6">${glyph('star')}</span>
        <span class="sat sat-7">${glyph('pin')}</span>
      </span>
    </div>`;
}
