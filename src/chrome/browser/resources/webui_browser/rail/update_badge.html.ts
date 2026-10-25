import {html} from '//resources/lit/v3_0/lit.rollup.js';

import type {UpdateBadgeElement} from './update_badge.js';

export function getHtml(this: UpdateBadgeElement) {
  return html`<!--_html_template_start_-->
<button id="update" title="Restart to update to Rail ${this.version_}"
    ?disabled="${this.applying_}" @click="${this.onClick_}">
  ${this.applying_ ? 'Restarting...' : 'New Rail Version Available'}
</button>
<!--_html_template_end_-->`;
}
