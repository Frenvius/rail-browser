import {html, nothing} from '//resources/lit/v3_0/lit.rollup.js';

import type {RailMediaCardElement} from './media_card.js';
import {audioIcon} from './tab_indicator_icons.js';

export function getHtml(this: RailMediaCardElement) {
  return html`${this.media ? html`
    <section aria-label="Media controls" @click="${this.onBodyClick_}">
      <div id="details">
        <button id="title" title="${this.media.title}" @click="${this.onActivateClick_}">
          ${this.media.artwork ? html`<img id="artwork" src="${this.media.artwork}"
              width="16" height="16" alt="">` : nothing}
          <span>
            <span id="mediaTitle">${this.media.title || 'Media'}</span>
          </span>
        </button>
        <button id="dismiss" title="Pause and dismiss"
            aria-label="Pause and dismiss" @click="${this.onDismissClick_}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7 7 10 10M17 7 7 17"></path>
          </svg>
        </button>
      </div>
      <div id="controls">
        <button id="activate" title="Go to media tab"
            aria-label="Go to media tab" @click="${this.onActivateClick_}">
          ${this.favicon ? html`<img src="${this.favicon}" width="16"
              height="16" alt="">` : html`
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3"></rect>
              <path d="m10 9 5 3-5 3z"></path>
            </svg>`}
        </button>
        <div id="playback">
          <button id="previous" title="Previous track" aria-label="Previous track"
              ?disabled="${!this.media.canPrevious}" @click="${this.onPreviousClick_}">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path class="fill" d="M6 5h2v14H6zm12 0v14l-10-7z"></path>
            </svg>
          </button>
          <button id="play" title="${this.media.playing ? 'Pause' : 'Play'}" aria-label="${this.media.playing ? 'Pause' : 'Play'}"
              ?disabled="${this.media.playing ? !this.media.canPause : !this.media.canPlay}"
              @click="${this.onPlaybackClick_}">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path class="fill" d="${this.media.playing ?
                  'M6 5h4v14H6zm8 0h4v14h-4z' : 'm7 4 14 8-14 8z'}"></path>
            </svg>
          </button>
          <button id="next" title="Next track" aria-label="Next track"
              ?disabled="${!this.media.canNext}" @click="${this.onNextClick_}">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path class="fill" d="M16 5h2v14h-2zM6 5l10 7-10 7z"></path>
            </svg>
          </button>
        </div>
        <button id="mute" title="${this.media.muted ? 'Unmute tab' : 'Mute tab'}" aria-label="${this.media.muted ? 'Unmute tab' : 'Mute tab'}"
            aria-pressed="${this.media.muted}" @click="${this.onMuteClick_}">
          ${audioIcon(this.media.muted)}
        </button>
      </div>
    </section>` : nothing}`;
}
