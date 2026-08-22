import type {TabCommand, TabMenuTarget} from './tab_menu.js';

export interface CommandBarHost {
  activeTab(): TabMenuTarget|null;
  goBack(): void;
  goForward(): void;
  newTab(): void;
  openUrl(url: string): void;
  reload(): void;
  runTabCommand(command: TabCommand, target: TabMenuTarget): void;
}

export interface Command {
  id: string;
  label: string;
  hint: string;
  keywords: string;
  enabled?: (host: CommandBarHost) => boolean;
  run: (host: CommandBarHost) => void;
}

export interface CommandBarRow {
  id: string;
  kind: 'command'|'tab';
  title: string;
  hint: string;
  favicon: string;
}

const hasTab = (host: CommandBarHost) => host.activeTab() !== null;

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
    id: 'new-tab',
    label: 'New Tab',
    hint: 'Ctrl+T',
    keywords: 'open create',
    run: host => host.newTab(),
  },
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
    id: 'pin-tab',
    label: 'Pin Tab',
    hint: '',
    keywords: 'keep stick',
    enabled: host => {
      const target = host.activeTab();
      return target !== null && !target.pinned;
    },
    run: onActiveTab('pin'),
  },
  {
    id: 'unpin-tab',
    label: 'Unpin Tab',
    hint: '',
    keywords: 'release',
    enabled: host => host.activeTab()?.pinned === true,
    run: onActiveTab('unpin'),
  },
  {
    id: 'close-others',
    label: 'Close Other Tabs',
    hint: '',
    keywords: 'rest remaining',
    enabled: host => host.activeTab()?.hasOthers === true,
    run: onActiveTab('close-others'),
  },
  {
    id: 'close-right',
    label: 'Close Tabs to the Right',
    hint: '',
    keywords: 'after below',
    enabled: host => host.activeTab()?.hasRight === true,
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
  page('Settings', 'preferences options config', 'chrome://settings'),
  page('History', 'visited recent', 'chrome://history'),
  page('Downloads', 'files saved', 'chrome://downloads'),
  page('Bookmarks', 'favorites saved', 'chrome://bookmarks'),
  page('Extensions', 'addons plugins', 'chrome://extensions'),
];

export function matchCommands(
    query: string, host: CommandBarHost): CommandBarRow[] {
  // A single letter matches nearly every label, which buries the tab rows
  // under commands the user was not reaching for.
  if (query.length < 2) {
    return [];
  }
  return COMMANDS
      .filter(
          command => (!command.enabled || command.enabled(host)) &&
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

export function runCommand(id: string, host: CommandBarHost) {
  COMMANDS.find(command => command.id === id)?.run(host);
}
