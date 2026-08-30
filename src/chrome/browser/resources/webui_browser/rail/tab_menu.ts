import type {NativeMenuItem} from './native_menu.js';
import {menuItems, separator, showNativeMenu} from './native_menu.js';
import type {Space} from './spaces.js';

export interface TabMenuTarget {
  id: string;
  tabId: string|null;
  url: string;
  pinned: boolean;
  favorite: boolean;
  dormant: boolean;
  muted: boolean;
  hasOthers: boolean;
  hasRight: boolean;
  count: number;
}

export type TabCommand = 'close'|'close-others'|'close-right'|'copy-link'|
    'duplicate'|'favorite'|'move-to-space'|'move-to-window'|'mute'|
    'new-tab-below'|'new-window'|'pin'|'reload'|'sleep'|'unpin';

export interface WindowRow {
  id: number;
  title: string;
}

export interface TabCommandDetail {
  command: TabCommand;
  target: TabMenuTarget;
  spaceId: string;
  windowId: number;
}

export interface TabMenuContext {
  target: TabMenuTarget;
  spaces: Space[];
  activeSpace: string;
  windows: WindowRow[];
}

function noun(target: TabMenuTarget): string {
  return target.count > 1 ? `${target.count} Tabs` : 'Tab';
}

function buildItems(context: TabMenuContext): NativeMenuItem[] {
  const {target, spaces, activeSpace, windows} = context;
  const single = target.count <= 1;
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
  ]);
  return menuItems([
    {label: 'Tab Context Menu'},
    single && {command: 'copy-link', label: 'Copy Link'},
    single && !target.dormant && {command: 'reload', label: 'Reload'},
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
    separator(),
    {
      command: target.pinned ? 'unpin' : 'pin',
      label: `${target.pinned ? 'Unpin' : 'Pin'} ${noun(target)}`,
    },
    {
      command: 'favorite',
      label: target.favorite ? 'Remove from Favorites' : 'Add to Favorites',
    },
    separator(),
    target.hasOthers && single &&
        {command: 'close-others', label: 'Close Other Tabs'},
    {
      command: 'close',
      label: target.dormant ? 'Remove' : `Close ${noun(target)}`,
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
    });
  });
}
