import {browserProxyFactory} from '../browser.mojom-webui.js';

const SAVE_DELAY_MS = 500;

export interface StoredPin {
  home: string;
  url: string;
  title: string;
  favicon: string;
}

export interface StoredTab {
  url: string;
  title: string;
  favicon: string;
}

export interface StoredSpace {
  id: string;
  name: string;
  color: string;
  icon: string;
  activeUrl: string;
  pinned: StoredPin[];
  tabs: Array<StoredTab|string>;
}

export interface SidebarState {
  activeSpace: string;
  spaces: StoredSpace[];
}

export async function readSidebarState(): Promise<SidebarState|null> {
  const {value} =
      await browserProxyFactory.getInstance().handler.getSidebarState();
  try {
    const parsed = JSON.parse(value || 'null');
    return parsed && Array.isArray(parsed.spaces) ? parsed as SidebarState :
                                                    null;
  } catch (e) {
    return null;
  }
}

export class SidebarStore {
  private timer_ = 0;

  constructor(private serialize_: () => SidebarState) {}

  save() {
    clearTimeout(this.timer_);
    this.timer_ = setTimeout(() => {
      browserProxyFactory.getInstance().handler.setSidebarState(
          JSON.stringify(this.serialize_()));
    }, SAVE_DELAY_MS);
  }
}
