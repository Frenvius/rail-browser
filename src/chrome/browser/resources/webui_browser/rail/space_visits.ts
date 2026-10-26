import {browserProxyFactory} from '../browser.mojom-webui.js';

import {siteOf} from './format_url.js';
import {INCOGNITO, MINI} from './sidebar_state.js';

export function recordSpaceVisit(
    spaceId: string|undefined, from: string, to: string) {
  const site = siteOf(to);
  if (INCOGNITO || MINI || !spaceId || !site || site === siteOf(from)) {
    return;
  }
  browserProxyFactory.getInstance().handler.recordSpaceVisit(spaceId, to);
}
