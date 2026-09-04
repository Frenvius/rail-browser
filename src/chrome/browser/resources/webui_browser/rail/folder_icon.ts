import {html} from '//resources/lit/v3_0/lit.rollup.js';

export function folderIcon(open: boolean, dotted: boolean) {
  return html`
    <svg class="folder-icon" viewBox="0 0 28 28" width="28" height="28"
        state="${open ? 'open' : 'closed'}" ?dotted="${dotted}">
      <path class="back" d="M7.4 5.6h4.7c.6 0 1.18.21 1.63.6l1.14.98c.45.39
          1.03.6 1.63.6h4.1a2.4 2.4 0 0 1 2.4 2.4v9.82a2.4 2.4 0 0
          1-2.4 2.4H7.4A2.4 2.4 0 0 1 5 20V8a2.4 2.4 0 0 1 2.4-2.4Z"></path>
      <rect class="front surface" x="5" y="9.6" width="18" height="12.8"
          rx="2.6"></rect>
      <rect class="front" x="5" y="9.6" width="18" height="12.8" rx="2.6">
      </rect>
      <g class="dots">
        <circle cx="10.8" cy="16" r="1.35"></circle>
        <circle cx="14" cy="16" r="1.35"></circle>
        <circle cx="17.2" cy="16" r="1.35"></circle>
      </g>
    </svg>`;
}
