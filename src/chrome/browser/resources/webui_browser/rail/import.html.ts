import {html} from '//resources/lit/v3_0/lit.rollup.js';
import type {TemplateResult} from '//resources/lit/v3_0/lit.rollup.js';

import type {RailImportElement} from './import.js';
import {glyph, orbit, screen} from './import_views.js';

export function getHtml(this: RailImportElement): TemplateResult {
  return html`
    <main @keydown="${this.onKeydown_}">
      <section class="content">
        ${screen.bind(this)()}
      </section>
      <aside class="art">
        ${orbit()}
      </aside>
      <button class="close" aria-label="Close" @click="${this.onCloseClick_}">
        ${glyph('close')}
      </button>
    </main>`;
}
