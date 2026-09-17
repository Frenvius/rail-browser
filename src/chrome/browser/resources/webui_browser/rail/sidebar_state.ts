import {loadTimeData} from '//resources/js/load_time_data.js';

import {browserProxyFactory} from '../browser.mojom-webui.js';

export const INCOGNITO = loadTimeData.isInitialized() &&
    loadTimeData.valueExists('incognito') &&
    loadTimeData.getBoolean('incognito');

export const MINI = new URLSearchParams(location.search).has('mini');

const SAVE_DELAY_MS = 0;

export interface StoredPin {
  id?: string;
  home: string;
  homeTitle?: string;
  homeFavicon?: string;
  url: string;
  title: string;
  favicon: string;
  folder?: string;
}

export interface StoredFolder {
  id: string;
  name: string;
  expanded: boolean;
  after?: string;
}

export interface StoredTab {
  url: string;
  title: string;
  favicon: string;
  group?: string;
}

export interface StoredSpace {
  id: string;
  name: string;
  color: string;
  icon: string;
  profile?: string;
  activeUrl: string;
  pinned: StoredPin[];
  folders?: StoredFolder[];
  tidyGroups?: StoredFolder[];
  tabs: Array<StoredTab|string>;
}

export interface SidebarState {
  activeSpace: string;
  material?: number;
  spaces: StoredSpace[];
  favoritesByProfile?: Record<string, StoredPin[]>;
  favorites?: StoredPin[];
  essentials?: StoredPin[];
}

export function parseSidebarState(value: string): SidebarState|null {
  try {
    const parsed = JSON.parse(value || 'null');
    const state = parsed && Array.isArray(parsed.spaces) ?
        parsed as SidebarState :
        null;
    if (!INCOGNITO) {
      return state;
    }
    return {activeSpace: '', material: state?.material, spaces: []};
  } catch (e) {
    return INCOGNITO ? {activeSpace: '', spaces: []} : null;
  }
}

export async function readSidebarState(): Promise<SidebarState|null> {
  const {value} =
      await browserProxyFactory.getInstance().handler.getSidebarState();
  return parseSidebarState(value);
}

export class SidebarStore {
  private timer_ = 0;
  private current_: string|null = null;

  constructor(private serialize_: () => SidebarState) {}

  save() {
    if (INCOGNITO || MINI) {
      return;
    }
    clearTimeout(this.timer_);
    this.timer_ = setTimeout(() => {
      this.current_ = JSON.stringify(this.serialize_());
      browserProxyFactory.getInstance().handler.setSidebarState(this.current_);
    }, SAVE_DELAY_MS);
  }

  accept(value: string): boolean {
    if (value === this.current_) {
      return false;
    }
    this.current_ = value;
    return true;
  }
}
