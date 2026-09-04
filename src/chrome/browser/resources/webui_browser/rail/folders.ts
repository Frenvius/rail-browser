import type {SidebarState, StoredFolder} from './sidebar_state.js';

export interface Folder {
  id: string;
  space: string;
  name: string;
  expanded: boolean;
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

  restore(state: SidebarState|null) {
    for (const space of state?.spaces ?? []) {
      for (const stored of space.folders ?? []) {
        this.folders_.push({
          id: stored.id,
          space: space.id,
          name: stored.name,
          expanded: stored.expanded !== false,
        });
      }
    }
  }

  storedIn(spaceId: string): StoredFolder[] {
    return this.in(spaceId).map(
        ({id, name, expanded}) => ({id, name, expanded}));
  }

  create(spaceId: string, name: string): Folder {
    const folder:
        Folder = {id: crypto.randomUUID(), space: spaceId, name, expanded: true};
    this.folders_.push(folder);
    this.onChange_();
    return folder;
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
