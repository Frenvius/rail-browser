import {html} from '//resources/lit/v3_0/lit.rollup.js';
import type {TemplateResult} from '//resources/lit/v3_0/lit.rollup.js';

export type LibraryIcon = 'archive'|'back'|'clear'|'close'|'download'|
    'filter'|'folder'|'grip'|'group'|'more'|'pause'|'pencil'|'play'|'plus'|
    'profile'|'retry'|'search'|'spaces';

const ICONS: Record<LibraryIcon, TemplateResult> = {
  archive: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="4" width="18" height="4" rx="1"></rect>
    <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"></path>
    <path d="M10 12h4"></path>
  </svg>`,
  back: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M19 12H5"></path>
    <path d="m11 18-6-6 6-6"></path>
  </svg>`,
  clear: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 4v14"></path>
    <path d="m6 12 6 6 6-6"></path>
  </svg>`,
  close: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M18 6 6 18"></path>
    <path d="m6 6 12 12"></path>
  </svg>`,
  download: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 4v11"></path>
    <path d="m7 10 5 5 5-5"></path>
    <path d="M5 20h14"></path>
  </svg>`,
  filter: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M7.5 9.5h9"></path>
    <path d="M9 12.5h6"></path>
    <path d="M10.5 15.5h3"></path>
  </svg>`,
  folder: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8l-2-3H4a1 1 0 0 0-1
        1v14a1 1 0 0 0 1 1Z"></path>
  </svg>`,
  grip: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3v18"></path>
    <path d="M3 12h18"></path>
    <path d="m9 6 3-3 3 3"></path>
    <path d="m9 18 3 3 3-3"></path>
    <path d="m6 9-3 3 3 3"></path>
    <path d="m18 9 3 3-3 3"></path>
  </svg>`,
  group: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="8" width="13" height="13" rx="2"></rect>
    <path d="M8 4h10a3 3 0 0 1 3 3v10"></path>
  </svg>`,
  more: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="5" cy="12" r="1"></circle>
    <circle cx="12" cy="12" r="1"></circle>
    <circle cx="19" cy="12" r="1"></circle>
  </svg>`,
  pause: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 5v14"></path>
    <path d="M15 5v14"></path>
  </svg>`,
  pencil: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"></path>
    <path d="m13.5 6.5 4 4"></path>
  </svg>`,
  play: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 5v14l11-7Z"></path>
  </svg>`,
  plus: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5v14"></path>
    <path d="M5 12h14"></path>
  </svg>`,
  profile: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M9 10h.01"></path>
    <path d="M15 10h.01"></path>
    <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"></path>
  </svg>`,
  retry: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path>
    <path d="M3 3v5h5"></path>
  </svg>`,
  search: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="7"></circle>
    <path d="m20 20-4-4"></path>
  </svg>`,
  spaces: html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="m12 3 9 5-9 5-9-5Z"></path>
    <path d="m3 13 9 5 9-5"></path>
  </svg>`,
};

export function libraryIcon(name: LibraryIcon): TemplateResult {
  return ICONS[name];
}
