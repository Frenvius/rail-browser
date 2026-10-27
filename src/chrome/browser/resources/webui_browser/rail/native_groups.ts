import type {TabStripServiceRemote} from '/tab_strip_api/tab_strip_api.mojom-webui.js';
import type {Container, TabGroupVisualData} from '/tab_strip_api/tab_strip_api_data_model.mojom-webui.js';
import type {Position} from '/tab_strip_api/tab_strip_api_types.mojom-webui.js';

import type {Folders} from './folders.js';
import type {Spaces} from './spaces.js';

export interface NativeGroup {
  id: string;
  visual: TabGroupVisualData;
  tabs: string[];
  exit: Position;
}

const DEFAULT_NAME = 'Group';

function tabIdsIn(node: Container): string[] {
  if (node.data.tab) {
    return [node.data.tab.id];
  }
  return (node.children ?? []).flatMap(tabIdsIn);
}

export function readNativeGroups(root: Container): NativeGroup[] {
  const groups: NativeGroup[] = [];
  const visit = (node: Container, path: string[]) => {
    const data = node.data;
    const parent = data.window ?? data.tabStrip ?? data.pinnedTabs ??
        data.unpinnedTabs ?? data.tabGroup ?? data.splitTab;
    if (!parent) {
      return;
    }
    const components = [...path, parent.id];
    let offset = 0;
    for (const child of node.children ?? []) {
      const tabs = tabIdsIn(child);
      if (child.data.tabGroup) {
        groups.push({
          id: child.data.tabGroup.id,
          visual: child.data.tabGroup.data,
          tabs,
          exit: {path: {components}, index: offset},
        });
      }
      offset += tabs.length;
      visit(child, components);
    }
  };
  visit(root, []);
  return groups;
}

export class NativeGroupLinks {
  private readonly links_ = new Map<string, string>();
  private readonly leaving_ = new Set<string>();

  async update(
      tidyId: string, change: Partial<TabGroupVisualData>,
      service: TabStripServiceRemote, root: Container) {
    const group = this.groupFor_(tidyId, root);
    if (group) {
      await service.update(
          {tabGroup: {id: group.id, data: {...group.visual, ...change}}},
          null);
    }
  }

  release(tidyId: string): string {
    const nativeId = this.nativeFor(tidyId);
    if (nativeId) {
      this.links_.delete(nativeId);
      this.leaving_.add(nativeId);
    }
    return nativeId;
  }

  async ungroup(nativeId: string, service: TabStripServiceRemote,
                root: Container) {
    const group = readNativeGroups(root).find(one => one.id === nativeId);
    try {
      for (const [offset, id] of group?.tabs.entries() ?? []) {
        await service.moveNode(
            id, {...group!.exit, index: group!.exit.index + offset});
      }
    } finally {
      this.leaving_.delete(nativeId);
    }
  }

  private groupFor_(tidyId: string, root: Container): NativeGroup|undefined {
    const nativeId = this.nativeFor(tidyId);
    return nativeId ?
        readNativeGroups(root).find(group => group.id === nativeId) :
        undefined;
  }

  nativeFor(tidyId: string): string {
    for (const [nativeId, linked] of this.links_) {
      if (linked === tidyId) {
        return nativeId;
      }
    }
    return '';
  }

  reconcile(groups: NativeGroup[], spaces: Spaces, tidy: Folders): boolean {
    let changed = false;
    const seen = new Set<string>();
    for (const group of groups) {
      if (this.leaving_.has(group.id)) {
        continue;
      }
      const rows = group.tabs.map(id => spaces.rowFor(id))
                       .filter(row => row !== undefined);
      const first = rows[0];
      if (!first) {
        continue;
      }
      seen.add(group.id);
      let folder = tidy.byId(this.links_.get(group.id) ?? '');
      if (!folder) {
        const adoptable = first.group && !this.nativeFor(first.group) ?
            tidy.byId(first.group) :
            undefined;
        folder = adoptable ??
            tidy.create(first.space, group.visual.title || DEFAULT_NAME);
        this.links_.set(group.id, folder.id);
        changed = true;
      }
      if (group.visual.title && folder.name !== group.visual.title) {
        tidy.rename(folder.id, group.visual.title);
        changed = true;
      }
      if (folder.expanded === group.visual.isCollapsed) {
        tidy.toggle(folder.id);
        changed = true;
      }
      for (const row of rows) {
        if (row.group !== folder.id && row.space === folder.space) {
          spaces.setGroup(row.key, folder.id);
          changed = true;
        }
      }
      const members = new Set(group.tabs);
      for (const key of spaces.keysInGroup(folder.id)) {
        const row = spaces.rowFor(key);
        if (row?.tabId && !members.has(row.tabId)) {
          spaces.setGroup(row.key, '');
          changed = true;
        }
      }
    }
    for (const [nativeId, tidyId] of [...this.links_]) {
      if (seen.has(nativeId)) {
        continue;
      }
      this.links_.delete(nativeId);
      spaces.clearGroup(tidyId);
      tidy.remove(tidyId);
      changed = true;
    }
    return changed;
  }
}
