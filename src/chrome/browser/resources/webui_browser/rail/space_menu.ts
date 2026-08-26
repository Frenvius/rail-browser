import type {NativeMenuItem} from './native_menu.js';
import {menuItems, separator, showNativeMenu} from './native_menu.js';
import type {Space, SpaceProfile} from './spaces.js';
import {DEFAULT_PROFILE_NAME, SPACE_COLORS} from './spaces.js';

export type SpaceMenuCommand = 'change-icon'|'move'|'new-profile'|'recolor'|
    'remove'|'rename'|'set-profile';

export interface SpaceMenuContext {
  space: Space;
  profiles: SpaceProfile[];
  canRename: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canRemove: boolean;
}

export interface SpaceMenuDetail {
  command: SpaceMenuCommand;
  color: string;
  delta: number;
  profile: string;
}

function profileItems(context: SpaceMenuContext): NativeMenuItem[] {
  const rows = [{id: '', name: DEFAULT_PROFILE_NAME}, ...context.profiles];
  return [
    ...rows.map(profile => ({
      command: `set-profile:${profile.id}`,
      label: profile.name,
      checked: profile.id === context.space.profile,
    })),
    separator(),
    {command: 'new-profile', label: 'New Profile'},
  ];
}

function buildItems(context: SpaceMenuContext): NativeMenuItem[] {
  return menuItems([
    {
      command: 'recolor:',
      swatches: [...SPACE_COLORS],
      selected: context.space.color,
    },
    {command: 'change-icon', label: 'Change Icon'},
    context.canRename && {command: 'rename', label: 'Rename Space'},
    {
      command: 'set-profile',
      label: 'Set Profile',
      children: profileItems(context),
    },
    separator(),
    context.canMoveLeft && {command: 'move:-1', label: 'Move Left'},
    context.canMoveRight && {command: 'move:1', label: 'Move Right'},
    separator(),
    context.canRemove &&
        {command: 'remove', label: 'Delete Space', danger: true},
  ]);
}

export function openSpaceMenu(
    context: SpaceMenuContext, run: (detail: SpaceMenuDetail) => void) {
  showNativeMenu(buildItems(context), raw => {
    const mark = raw.indexOf(':');
    const command =
        (mark === -1 ? raw : raw.slice(0, mark)) as SpaceMenuCommand;
    const argument = mark === -1 ? '' : raw.slice(mark + 1);
    run({
      command,
      color: command === 'recolor' ? argument : '',
      delta: command === 'move' ? Number(argument) : 0,
      profile: command === 'set-profile' ? argument : '',
    });
  });
}
