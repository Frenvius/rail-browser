import {html} from '//resources/lit/v3_0/lit.rollup.js';
import type {TemplateResult} from '//resources/lit/v3_0/lit.rollup.js';

import {browserProxyFactory} from '../browser.mojom-webui.js';

export type CaptionGlyph = 'close'|'maximize'|'minimize'|'restore';

const MAXIMIZED_ATTRIBUTE = 'maximized';

const GLYPHS: Record<CaptionGlyph, TemplateResult> = {
  close: html`<svg class="caption-glyph" viewBox="0 0 10 10"
      aria-hidden="true">
    <path d="M.5.5l9 9m0-9-9 9"></path>
  </svg>`,
  maximize: html`<svg class="caption-glyph maximize" viewBox="0 0 10 10"
      aria-hidden="true">
    <rect x=".5" y=".5" width="9" height="9" rx="1.5"></rect>
  </svg>`,
  minimize: html`<svg class="caption-glyph" viewBox="0 0 10 10"
      aria-hidden="true">
    <path d="M0 5.5h10"></path>
  </svg>`,
  restore: html`<svg class="caption-glyph restore" viewBox="0 0 10 10"
      aria-hidden="true">
    <rect x=".5" y="2.5" width="7" height="7" rx="1.5"></rect>
    <path d="M2.5 2.5V2A1.5 1.5 0 0 1 4 .5h4A1.5 1.5 0 0 1 9.5 2v4A1.5 1.5 0 0 1
        8 7.5h-.5"></path>
  </svg>`,
};

export function captionGlyph(glyph: CaptionGlyph): TemplateResult {
  return GLYPHS[glyph];
}

export function initWindowControls(host: HTMLElement) {
  const handler = browserProxyFactory.getInstance().handler;
  const sync = async () => {
    const {maximized} = await handler.isMaximized();
    host.toggleAttribute(MAXIMIZED_ATTRIBUTE, maximized);
    const label = maximized ? 'Restore' : 'Maximize';
    const button = host.shadowRoot?.getElementById('maximizeButton');
    button?.setAttribute('title', label);
    button?.setAttribute('aria-label', label);
  };
  window.addEventListener('resize', sync);
  void sync();
}

export function toggleMaximized(host: HTMLElement) {
  const handler = browserProxyFactory.getInstance().handler;
  if (host.hasAttribute(MAXIMIZED_ATTRIBUTE)) {
    handler.restore();
  } else {
    handler.maximize();
  }
}
