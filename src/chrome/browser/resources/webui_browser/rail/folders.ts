import type {SidebarState, StoredFolder, StoredSpace} from './sidebar_state.js';

export interface Folder {
  id: string;
  space: string;
  name: string;
  expanded: boolean;
  after: string;
}

export class Folders {
  private folders_: Folder[] = [];

  constructor(private onChange_: () => void) {}

  in(spaceId: string): Folder[] {
    return this.folders_.filter(folder => folder.space === spaceId);
  }

  byId(id: string): Folder|undefined {
    return this.folders_.find(folder => folder.id === id);
  }

  restore(
      state: SidebarState|null,
      pick: (space: StoredSpace) => StoredFolder[] |
      undefined = space => space.folders) {
    for (const space of state?.spaces ?? []) {
      for (const stored of pick(space) ?? []) {
        this.folders_.push({
          id: stored.id,
          space: space.id,
          name: stored.name,
          expanded: stored.expanded !== false,
          after: stored.after ?? '',
        });
      }
    }
  }

  storedIn(spaceId: string): StoredFolder[] {
    return this.in(spaceId).map(
        ({id, name, expanded, after}) => ({id, name, expanded, after}));
  }

  setAfter(id: string, after: string) {
    const folder = this.byId(id);
    if (!folder || folder.after === after) {
      return;
    }
    folder.after = after;
    this.onChange_();
  }

  create(spaceId: string, name: string): Folder {
    const folder: Folder = {
      id: crypto.randomUUID(),
      space: spaceId,
      name,
      expanded: true,
      after: '',
    };
    this.folders_.push(folder);
    this.onChange_();
    return folder;
  }

  reorder(spaceId: string, ids: string[]) {
    const ordered = [...new Set(
        ids.map(id => this.folders_.find(
                   folder => folder.id === id && folder.space === spaceId))
            .filter(folder => folder !== undefined))];
    if (!ordered.length) {
      return;
    }
    const moving = new Set(ordered);
    let next = 0;
    this.folders_ =
        this.folders_.map(folder => moving.has(folder) ? ordered[next++]! : folder);
    this.onChange_();
  }

  rename(id: string, name: string) {
    const folder = this.byId(id);
    if (!folder || !name || folder.name === name) {
      return;
    }
    folder.name = name;
    this.onChange_();
  }

  toggle(id: string) {
    const folder = this.byId(id);
    if (!folder) {
      return;
    }
    folder.expanded = !folder.expanded;
    this.onChange_();
  }

  remove(id: string) {
    this.folders_ = this.folders_.filter(folder => folder.id !== id);
    this.onChange_();
  }

  dropSpace(spaceId: string) {
    this.folders_ = this.folders_.filter(folder => folder.space !== spaceId);
    this.onChange_();
  }
}
