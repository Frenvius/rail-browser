import type {SidebarState, StoredFolder, StoredSpace} from './sidebar_state.js';
import {normalizeStoredFolders} from './sidebar_state.js';
import type {PinnedEntry, PinnedTabs} from './pinned_tabs.js';

export interface Folder {
  id: string;
  space: string;
  name: string;
  expanded: boolean;
  after: string;
  parent: string;
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

  clear() {
    this.folders_ = [];
  }

  restore(
      state: SidebarState|null,
      pick?: (space: StoredSpace) => StoredFolder[]|undefined) {
    for (const space of state?.spaces ?? []) {
      const storedFolders = pick ?
          (pick(space) ?? []).map(folder => ({...folder, parent: ''})) :
          normalizeStoredFolders(space.folders ?? []);
      for (const stored of storedFolders) {
        this.folders_.push({
          id: stored.id,
          space: space.id,
          name: stored.name,
          expanded: stored.expanded !== false,
          after: stored.after ?? '',
          parent: stored.parent ?? '',
        });
      }
    }
  }

  storedIn(spaceId: string): StoredFolder[] {
    return this.in(spaceId).map(
        ({id, name, expanded, after, parent}) =>
            ({id, name, expanded, after, parent}));
  }

  setAfter(id: string, after: string) {
    const folder = this.byId(id);
    if (!folder || folder.after === after) {
      return;
    }
    folder.after = after;
    this.onChange_();
  }

  create(spaceId: string, name: string, id: string = crypto.randomUUID()):
      Folder {
    const folder: Folder = {
      id,
      space: spaceId,
      name,
      expanded: true,
      after: '',
      parent: '',
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

  subtree(id: string): Folder[] {
    const root = this.byId(id);
    if (!root) {
      return [];
    }
    const ids = new Set([id]);
    const result = [root];
    for (let index = 0; index < result.length; index++) {
      for (const folder of this.in(root.space)) {
        if (folder.parent === result[index]!.id && !ids.has(folder.id)) {
          ids.add(folder.id);
          result.push(folder);
        }
      }
    }
    return result;
  }

  entriesIn(id: string, pinned: PinnedTabs): PinnedEntry[] {
    const folder = this.byId(id);
    const ids = new Set(this.subtree(id).map(child => child.id));
    return folder ? pinned.entriesIn(folder.space).filter(entry => ids.has(entry.folder)) : [];
  }

  canParent(id: string, parent: string): boolean {
    const folder = this.byId(id);
    const destination = this.byId(parent);
    return !!folder && (!parent ||
        (!!destination && destination.space === folder.space &&
         !this.subtree(id).some(child => child.id === parent)));
  }

  setParent(id: string, parent: string) {
    const folder = this.byId(id);
    if (!folder || folder.parent === parent || !this.canParent(id, parent)) {
      return;
    }
    folder.parent = parent;
    folder.after = '';
    this.onChange_();
  }

  moveTo(id: string, spaceId: string) {
    const folder = this.byId(id);
    if (!folder || folder.space === spaceId) {
      return;
    }
    for (const child of this.subtree(id)) {
      child.space = spaceId;
    }
    folder.parent = '';
    folder.after = '';
    this.onChange_();
  }

  remove(id: string) {
    const ids = new Set(this.subtree(id).map(folder => folder.id));
    this.folders_ = this.folders_.filter(folder => !ids.has(folder.id));
    this.onChange_();
  }

  deleteTree(id: string, pinned: PinnedTabs, close: (key: string) => void) {
    for (const entry of this.entriesIn(id, pinned)) {
      close(entry.key);
      pinned.remove(entry.key);
    }
    this.remove(id);
  }

  moveTree(options: {
    id: string, space: string, pinned: PinnedTabs,
    move: (key: string, space: string) => void,
  }) {
    const entries = this.entriesIn(options.id, options.pinned)
                        .map(entry => ({key: entry.key, folder: entry.folder}));
    this.moveTo(options.id, options.space);
    for (const {key, folder} of entries) {
      options.move(key, options.space);
      options.pinned.setFolder(key, folder);
    }
  }

  dropSpace(spaceId: string) {
    this.folders_ = this.folders_.filter(folder => folder.space !== spaceId);
    this.onChange_();
  }
}
