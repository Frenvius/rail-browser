import type {Folder} from './folders.js';
import type {NativeMenuItem} from './native_menu.js';
import {menuItems, separator, showNativeMenu} from './native_menu.js';
import type {Space} from './spaces.js';

export interface TabMenuTarget {
  id: string;
  tabId: string|null;
  url: string;
  pinned: boolean;
  favorite: boolean;
  folder: string;
  dormant: boolean;
  muted: boolean;
  hasOthers: boolean;
  hasRight: boolean;
  count: number;
}

export type TabCommand = 'add-to-folder'|'close'|'close-others'|'close-right'|
    'copy-link'|'duplicate'|'favorite'|'move-to-space'|'move-to-window'|'mute'|
    'mini-window'|'new-folder'|'new-tab-below'|'new-window'|'pin'|'reload'|
    'remove-from-folder'|'replace-pinned-url'|'route-to-space'|'sleep'|'unpin';

export type FolderCommand = 'delete-folder'|'rename-folder';

export type GroupCommand =
    'close-group'|'rename-group'|'save-group'|'ungroup-group';

export interface WindowRow {
  id: number;
  title: string;
}

export interface TabCommandDetail {
  command: TabCommand;
  target: TabMenuTarget;
  spaceId: string;
  windowId: number;
  folderId: string;
}

export interface TabMenuContext {
  target: TabMenuTarget;
  spaces: Space[];
  activeSpace: string;
  windows: WindowRow[];
  folders: Folder[];
}

export function isWebUrl(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('http://');
}

function noun(target: TabMenuTarget): string {
  return target.count > 1 ? `${target.count} Tabs` : 'Tab';
}

function buildItems(context: TabMenuContext): NativeMenuItem[] {
  const {target, spaces, activeSpace, windows, folders} = context;
  const single = target.count <= 1;
  const filing = target.pinned && !target.favorite;
  const available = folders.filter(folder => folder.id !== target.folder);
  const others = spaces.filter(space => space.id !== activeSpace);
  const destinations = menuItems([
    ...others.map(space => ({
                    command: `move-to-space:${space.id}`,
                    label: space.name,
                  })),
    separator(),
    ...(target.tabId ? windows.map(row => ({
                         command: `move-to-window:${row.id}`,
                         label: row.title || 'Untitled Window',
                       })) :
                       []),
    !!target.tabId && target.hasOthers &&
        {command: 'new-window', label: 'New Window'},
    !!target.tabId && {
      command: 'mini-window',
      label: 'Mini Window',
      accelerator: 'Ctrl+Alt+M',
    },
  ]);
  return menuItems([
    {label: 'Tab Context Menu'},
    single && {command: 'copy-link', label: 'Copy Link'},
    single && !target.dormant &&
        {command: 'reload', label: 'Reload', accelerator: 'Ctrl+R'},
    !target.dormant && {
      command: 'mute',
      label: target.muted ? 'Unmute' : 'Mute',
    },
    separator(),
    single && {command: 'new-tab-below', label: 'New Tab Below'},
    {command: 'duplicate', label: 'Duplicate'},
    !target.dormant && {command: 'sleep', label: `Sleep ${noun(target)}`},
    destinations.length > 0 &&
        {command: 'move-to', label: 'Move to', children: destinations},
    single && isWebUrl(target.url) &&
        {command: 'route-to-space', label: 'Always Open in This Space'},
    separator(),
    {
      command: target.pinned ? 'unpin' : 'pin',
      label: `${target.pinned ? 'Unpin' : 'Pin'} ${noun(target)}`,
    },
    {
      command: 'favorite',
      label: target.favorite ? 'Remove from Favorites' : 'Add to Favorites',
    },
    filing && {command: 'new-folder', label: 'New Folder'},
    filing && available.length > 0 && {
      command: 'add-to',
      label: 'Add to Folder',
      children: menuItems(available.map(folder => ({
                                          command: `add-to-folder:${folder.id}`,
                                          label: folder.name,
                                        }))),
    },
    filing && !!target.folder &&
        {command: 'remove-from-folder', label: 'Remove from Folder'},
    target.pinned && single && !target.dormant && {
      command: 'edit-pinned',
      label: 'Edit Pinned Page',
      children: menuItems([{
        command: 'replace-pinned-url',
        label: 'Replace Pinned URL with Current',
      }]),
    },
    separator(),
    target.hasOthers && single &&
        {command: 'close-others', label: 'Close Other Tabs'},
    {
      command: 'close',
      label: target.dormant ? 'Remove' : `Close ${noun(target)}`,
      accelerator: single && !target.dormant ? 'Ctrl+W' : undefined,
    },
    target.hasRight && single &&
        {command: 'close-right', label: 'Close Tabs Below'},
  ]);
}

export function openTabMenu(
    context: TabMenuContext, run: (detail: TabCommandDetail) => void) {
  showNativeMenu(buildItems(context), raw => {
    const [command, argument] = raw.split(':') as [TabCommand, string?];
    run({
      command,
      target: context.target,
      spaceId: command === 'move-to-space' ? argument ?? '' : '',
      windowId: command === 'move-to-window' ? Number(argument ?? 0) : 0,
      folderId: command === 'add-to-folder' ? argument ?? '' : '',
    });
  });
}

export function openFolderMenu(
    name: string, run: (command: FolderCommand) => void) {
  showNativeMenu(
      menuItems([
        {label: name},
        {command: 'rename-folder', label: 'Rename'},
        separator(),
        {command: 'delete-folder', label: 'Delete Folder'},
      ]),
      raw => run(raw as FolderCommand));
}

export function openGroupMenu(
    name: string, run: (command: GroupCommand) => void) {
  showNativeMenu(
      menuItems([
        {label: name},
        {command: 'rename-group', label: 'Rename'},
        {command: 'save-group', label: 'Save as Folder'},
        separator(),
        {command: 'ungroup-group', label: 'Ungroup'},
        {command: 'close-group', label: 'Close Group'},
      ]),
      raw => run(raw as GroupCommand));
}
