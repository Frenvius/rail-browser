import type {Rect} from 'chrome://resources/mojo/ui/gfx/geometry/mojom/geometry.mojom-webui.js';

import type {TabWebviewElement} from '../webview.js';
import {WebviewElement} from '../webview.js';

export interface DockedDevToolsHost {
  shadowRoot: ShadowRoot|null;
  activeWebview?: TabWebviewElement;
  offsetWidth: number;
  offsetHeight: number;
}

export class DockedDevTools {
  private host: DockedDevToolsHost;
  private webview?: WebviewElement;
  private guestId: string = '';
  private inspected?: TabWebviewElement;

  constructor(host: DockedDevToolsHost) {
    this.host = host;
  }

  async show(guestId: string, inspectedBounds: Rect, hideInspected: boolean) {
    if (this.guestId !== guestId) {
      this.close();
      const webview = new WebviewElement();
      this.webview = webview;
      this.guestId = guestId;
      this.host.shadowRoot!.appendChild(webview);
      await webview.updateComplete;
      webview.attachGuest(guestId);
    }
    this.layOutInspectedContents(inspectedBounds, hideInspected);
  }

  close() {
    if (this.webview) {
      this.webview.remove();
      this.webview = undefined;
      this.guestId = '';
    }
    if (this.inspected) {
      this.release(this.inspected);
      this.inspected = undefined;
    }
  }

  forget(webview: TabWebviewElement) {
    if (this.inspected === webview) {
      this.inspected = undefined;
    }
  }

  private release(webview: TabWebviewElement) {
    webview.classList.remove('docked', 'hiddenByDevtools');
    webview.removeAttribute('style');
  }

  private layOutInspectedContents(bounds: Rect, hideInspected: boolean) {
    const webview = this.host.activeWebview;
    if (!webview) {
      return;
    }
    if (this.inspected && this.inspected !== webview) {
      this.release(this.inspected);
    }
    this.inspected = webview;
    webview.classList.add('docked');
    webview.classList.toggle('hiddenByDevtools', hideInspected);

    const width = this.host.offsetWidth;
    const height = this.host.offsetHeight;
    if (bounds.width <= 0 && bounds.height <= 0 && !hideInspected) {
      webview.style.left = '0';
      webview.style.top = '0';
      webview.style.width = '100%';
      webview.style.height = '100%';
      return;
    }
    webview.style.left = `${Math.min(bounds.x, width)}px`;
    webview.style.top = `${Math.min(bounds.y, height)}px`;
    webview.style.width = `${Math.min(bounds.width, width)}px`;
    webview.style.height = `${Math.min(bounds.height, height)}px`;
  }
}
