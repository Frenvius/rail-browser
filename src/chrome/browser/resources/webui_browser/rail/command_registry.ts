import {browserProxyFactory} from '../browser.mojom-webui.js';

import {adoptMiniWindow} from './mini_window.js';
import type {TabCommand, TabMenuTarget} from './tab_menu.js';

export interface CommandBarHost {
  activeTab(): TabMenuTarget|null;
  goBack(): void;
  goForward(): void;
  newSpace(): void;
  openUrl(url: string): void;
  reload(): void;
  runTabCommand(command: TabCommand, target: TabMenuTarget): void;
  selectTabAt(index: number): void;
  stepSpace(delta: number): void;
  stepTab(delta: number): void;
  toggleSidebar(): void;
}

export interface Command {
  id: string;
  label: string;
  hint: string;
  keywords: string;
  enabled?: (tab: TabMenuTarget|null) => boolean;
  run: (host: CommandBarHost) => void;
}

export interface CommandBarRow {
  id: string;
  kind: 'command'|'tab';
  title: string;
  hint: string;
  favicon: string;
}

const hasTab = (tab: TabMenuTarget|null) => tab !== null;

function onActiveTab(command: TabCommand) {
  return (host: CommandBarHost) => {
    const target = host.activeTab();
    if (target) {
      host.runTabCommand(command, target);
    }
  };
}

function page(label: string, keywords: string, url: string): Command {
  return {id: url, label, hint: url, keywords, run: host => host.openUrl(url)};
}

export const COMMANDS: Command[] = [
  {
    id: 'close-tab',
    label: 'Close Tab',
    hint: 'Ctrl+W',
    keywords: 'quit',
    enabled: hasTab,
    run: onActiveTab('close'),
  },
  {
    id: 'duplicate-tab',
    label: 'Duplicate Tab',
    hint: '',
    keywords: 'clone copy',
    enabled: hasTab,
    run: onActiveTab('duplicate'),
  },
  {
    id: 'new-tab-below',
    label: 'New Tab Below',
    hint: '',
    keywords: 'insert adjacent after',
    enabled: hasTab,
    run: onActiveTab('new-tab-below'),
  },
  {
    id: 'new-window',
    label: 'Move Tab to New Window',
    hint: '',
    keywords: 'detach split out',
    enabled: tab => tab?.hasOthers === true,
    run: onActiveTab('new-window'),
  },
  {
    id: 'mini-window',
    label: 'Move Tab to Mini Window',
    hint: 'Ctrl+Alt+M',
    keywords: 'little small popup float',
    enabled: hasTab,
    run: onActiveTab('mini-window'),
  },
  {
    id: 'adopt-mini-window',
    label: 'Move Tab Back to Rail',
    hint: 'Ctrl+O',
    keywords: 'adopt promote mini little restore',
    run: () => adoptMiniWindow(),
  },
  {
    id: 'pin-tab',
    label: 'Pin Tab',
    hint: '',
    keywords: 'keep stick',
    enabled: tab => tab !== null && !tab.pinned,
    run: onActiveTab('pin'),
  },
  {
    id: 'unpin-tab',
    label: 'Unpin Tab',
    hint: '',
    keywords: 'release',
    enabled: tab => tab?.pinned === true,
    run: onActiveTab('unpin'),
  },
  {
    id: 'toggle-favorite',
    label: 'Toggle Favorite',
    hint: '',
    keywords: 'favorites essentials global',
    enabled: hasTab,
    run: onActiveTab('favorite'),
  },
  {
    id: 'close-others',
    label: 'Close Other Tabs',
    hint: '',
    keywords: 'rest remaining',
    enabled: tab => tab?.hasOthers === true,
    run: onActiveTab('close-others'),
  },
  {
    id: 'close-right',
    label: 'Close Tabs to the Right',
    hint: '',
    keywords: 'after below',
    enabled: tab => tab?.hasRight === true,
    run: onActiveTab('close-right'),
  },
  {
    id: 'copy-link',
    label: 'Copy Link',
    hint: '',
    keywords: 'url address share',
    enabled: hasTab,
    run: onActiveTab('copy-link'),
  },
  {
    id: 'reload',
    label: 'Reload Page',
    hint: 'Ctrl+R',
    keywords: 'refresh',
    enabled: hasTab,
    run: host => host.reload(),
  },
  {
    id: 'back',
    label: 'Go Back',
    hint: 'Alt+Left',
    keywords: 'previous history',
    enabled: hasTab,
    run: host => host.goBack(),
  },
  {
    id: 'forward',
    label: 'Go Forward',
    hint: 'Alt+Right',
    keywords: 'next history',
    enabled: hasTab,
    run: host => host.goForward(),
  },
  {
    id: 'next-tab',
    label: 'Next Tab',
    hint: 'Ctrl+Tab',
    keywords: 'switch cycle',
    run: host => host.stepTab(1),
  },
  {
    id: 'previous-tab',
    label: 'Previous Tab',
    hint: 'Ctrl+Shift+Tab',
    keywords: 'switch cycle',
    run: host => host.stepTab(-1),
  },
  {
    id: 'new-space',
    label: 'New Space',
    hint: 'Ctrl+Alt+N',
    keywords: 'workspace context group',
    run: host => host.newSpace(),
  },
  {
    id: 'next-space',
    label: 'Next Space',
    hint: 'Ctrl+Alt+Right',
    keywords: 'workspace switch',
    run: host => host.stepSpace(1),
  },
  {
    id: 'previous-space',
    label: 'Previous Space',
    hint: 'Ctrl+Alt+Left',
    keywords: 'workspace switch',
    run: host => host.stepSpace(-1),
  },
  {
    id: 'toggle-sidebar',
    label: 'Toggle Sidebar',
    hint: 'Ctrl+S',
    keywords: 'hide show collapse expand rail',
    run: host => host.toggleSidebar(),
  },
  {
    id: 'settings',
    label: 'Settings',
    hint: 'Ctrl+,',
    keywords: 'preferences options config profiles',
    run: () => browserProxyFactory.getInstance().handler.openRailSettings(),
  },
  page('History', 'visited recent', 'chrome://history'),
  page('Downloads', 'files saved', 'chrome://downloads'),
  page('Extensions', 'addons plugins', 'chrome://extensions'),
];

export function matchCommands(
    query: string, tab: TabMenuTarget|null): CommandBarRow[] {
  // A single letter matches nearly every label, which buries the tab rows
  // under commands the user was not reaching for.
  if (query.length < 2) {
    return [];
  }
  return COMMANDS
      .filter(
          command => (!command.enabled || command.enabled(tab)) &&
              (command.label.toLowerCase().includes(query) ||
               command.keywords.includes(query)))
      .map(command => ({
             id: command.id,
             kind: 'command' as const,
             title: command.label,
             hint: command.hint,
             favicon: '',
           }));
}

const SELECT_TAB = 'select-tab:';

export function runCommand(id: string, host: CommandBarHost) {
  if (id.startsWith(SELECT_TAB)) {
    const which = id.slice(SELECT_TAB.length);
    host.selectTabAt(which === 'last' ? -1 : Number(which));
    return;
  }
  COMMANDS.find(command => command.id === id)?.run(host);
}
