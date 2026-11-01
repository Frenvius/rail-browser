import {html, nothing} from '//resources/lit/v3_0/lit.rollup.js';
import type {TemplateResult} from '//resources/lit/v3_0/lit.rollup.js';

import type {AlertBadge, AlertKind} from './tab_alerts.js';

const ALERT_ICONS: Record<AlertKind, TemplateResult> = {
  screen: html`<svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2"></rect>
      <path d="M8 20h8M12 16v4"></path>
    </svg>`,
  camera: html`<svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="6.5" width="13" height="11" rx="2"></rect>
      <path d="m15.5 10.5 6-3.5v10l-6-3.5"></path>
    </svg>`,
  mic: html`<svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3"></rect>
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"></path>
    </svg>`,
  bluetooth: html`<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 7 10 10-5 4V3l5 4L7 17"></path>
    </svg>`,
  usb: html`<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v14M9 6l3-3 3 3M12 13l-5-3V8M12 15l5-3v-2"></path>
      <circle cx="12" cy="19" r="2"></circle>
    </svg>`,
  headset: html`<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 10a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-3.2a2 2 0 0 1-1.6-.8L12 14l-2.2 2.2a2 2 0 0 1-1.6.8H5a2 2 0 0 1-2-2Z"></path>
    </svg>`,
  pip: html`<svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="4.5" width="19" height="15" rx="2"></rect>
      <rect class="fill" x="12" y="11.5" width="7" height="5.5" rx="1"></rect>
    </svg>`,
};

const AUDIO_PLAYING = html`<svg viewBox="0 0 24 24" aria-hidden="true">
    <path class="fill" d="M4 9.5h3l4.5-4v13L7 14.5H4z"></path>
    <path class="wave" d="M15.5 9.5a3.5 3.5 0 0 1 0 5"></path>
    <path class="wave outer" d="M18.5 6.5a7.5 7.5 0 0 1 0 11"></path>
  </svg>`;

const AUDIO_MUTED = html`<svg viewBox="0 0 24 24" aria-hidden="true">
    <path class="fill" d="M4 9.5h3l4.5-4v13L7 14.5H4z"></path>
    <path d="m16 9.5 5 5M21 9.5l-5 5"></path>
  </svg>`;

export function alertIcon(badge: AlertBadge|null) {
  return badge ? ALERT_ICONS[badge.kind] : nothing;
}

export function audioIcon(muted: boolean) {
  return muted ? AUDIO_MUTED : AUDIO_PLAYING;
}
