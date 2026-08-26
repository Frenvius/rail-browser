import type {NativeMenuItem} from './native_menu.js';
import {menuItems, separator, showNativeMenu} from './native_menu.js';
import type {Space} from './spaces.js';

export interface TabMenuTarget {
  id: string;
  tabId: string|null;
  url: string;
  pinned: boolean;
  essential: boolean;
  dormant: boolean;
  muted: boolean;
  hasOthers: boolean;
  hasRight: boolean;
  count: number;
}

export type TabCommand = 'close'|'close-others'|'close-right'|'copy-link'|
    'duplicate'|'essential'|'move-to-space'|'move-to-window'|'mute'|
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
  return menuItems([
    single && {command: 'new-tab-below', label: 'New Tab Below'},
    single && !target.dormant && {command: 'reload', label: 'Reload'},
    single && {command: 'copy-link', label: 'Copy Link'},
    {command: 'duplicate', label: 'Duplicate'},
    !target.dormant && {command: 'sleep', label: `Sleep ${noun(target)}`},
    !target.dormant && {
      command: 'mute',
      label: `${target.muted ? 'Unmute' : 'Mute'} ${noun(target)}`,
    },
    separator(),
    {
      command: target.pinned ? 'unpin' : 'pin',
      label: `${target.pinned ? 'Unpin' : 'Pin'} ${noun(target)}`,
    },
    {
      command: 'essential',
      label: target.essential ? 'Remove from Essentials' : 'Add to Essentials',
    },
    !!target.tabId && target.hasOthers &&
        {command: 'new-window', label: `Move ${noun(target)} to New Window`},
    ...(target.tabId ? windows.map(row => ({
                         command: `move-to-window:${row.id}`,
                         label: `Move to ${row.title || 'Untitled Window'}`,
                       })) :
                       []),
    separator(),
    ...others.map(space => ({
                    command: `move-to-space:${space.id}`,
                    label: `Move to ${space.name}`,
                  })),
    separator(),
    {
      command: 'close',
      label: target.dormant ? 'Remove' : `Close ${noun(target)}`,
      danger: true,
    },
    target.hasOthers && single &&
        {command: 'close-others', label: 'Close Other Tabs'},
    target.hasRight && single &&
        {command: 'close-right', label: 'Close Tabs to the Right'},
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
