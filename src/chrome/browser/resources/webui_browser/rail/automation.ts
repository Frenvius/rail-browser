import {browserProxyFactory} from '../browser.mojom-webui.js';

import type {Spaces} from './spaces.js';

export interface AutomationSpace {
  id: string;
  name: string;
  profile: string;
  active: boolean;
  dormant: number;
}

export interface AutomationTab {
  targetId: string;
  space: string;
}

export interface AutomationHost {
  refresh(): void;
  select(spaceId: string): void;
}

export class Automation {
  constructor(
      private readonly spaces_: Spaces,
      private readonly host_: AutomationHost) {}

  spaces(): AutomationSpace[] {
    return this.spaces_.all.map(space => ({
      id: space.id,
      name: space.name,
      profile: this.spaces_.profileName(space.profile),
      active: space.id === this.spaces_.activeId,
      dormant: this.spaces_.dormantIn(space.id)
                   .filter(row => !row.remote)
                   .length,
    }));
  }

  tabs(): Promise<AutomationTab[]> {
    const handler = browserProxyFactory.getInstance().handler;
    const rows = this.spaces_.all.flatMap(
        space => this.spaces_.rowsIn(space.id).filter(row => row.tabId));
    return Promise.all(rows.map(async row => {
      const {targetId} = await handler.getTabTargetId(row.tabId);
      return {targetId, space: row.space};
    }));
  }

  async open(spaceId: string, url: string): Promise<string> {
    if (!this.spaces_.byId(spaceId)) {
      return '';
    }
    const handler = browserProxyFactory.getInstance().handler;
    this.spaces_.expectTab();
    try {
      const {id} = await handler.createBackgroundTabInProfile(
          this.spaces_.profileOf(spaceId), url);
      if (!id) {
        return '';
      }
      this.spaces_.claim(id, spaceId);
      this.host_.refresh();
      const {targetId} = await handler.getTabTargetId(id);
      return targetId;
    } finally {
      this.spaces_.settleTab();
    }
  }

  select(spaceId: string): boolean {
    if (!this.spaces_.byId(spaceId)) {
      return false;
    }
    this.host_.select(spaceId);
    return this.spaces_.activeId === spaceId;
  }
}

declare global {
  interface Window {
    railAutomation?: Automation;
  }
}

export function exposeAutomation(spaces: Spaces, host: AutomationHost) {
  window.railAutomation = new Automation(spaces, host);
}
