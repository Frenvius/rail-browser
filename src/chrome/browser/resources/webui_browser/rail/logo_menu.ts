import {browserProxyFactory} from '../browser.mojom-webui.js';

import type {CommandBarHost} from './command_registry.js';
import {COMMANDS, runCommand} from './command_registry.js';
import type {NativeMenuItem} from './native_menu.js';
import {menuItems, separator, showNativeMenu} from './native_menu.js';
import type {TabMenuTarget} from './tab_menu.js';

const BROWSER_COMMAND = 'browser:';

function browserCommand(
    command: string, label: string, accelerator?: string): NativeMenuItem {
  return {command: BROWSER_COMMAND + command, label, accelerator};
}

function shellCommand(
    id: string, tab: TabMenuTarget|null): NativeMenuItem|false {
  const command = COMMANDS.find(entry => entry.id === id);
  if (!command || (command.enabled && !command.enabled(tab))) {
    return false;
  }
  return {command: id, label: command.label, accelerator: command.hint};
}

export async function openLogoMenu(host: CommandBarHost) {
  const handler = browserProxyFactory.getInstance().handler;
  const {isDefault} = await handler.isDefaultBrowser();
  const tab = host.activeTab();
  const items = menuItems([
    !isDefault && {command: 'set-default', label: 'Set Rail as Default Browser'},
    browserCommand('import-settings', 'Import from Another Browser'),
    separator(),
    {command: 'new-tab', label: 'New Tab', accelerator: 'Ctrl+T'},
    browserCommand('new-window', 'New Window', 'Ctrl+N'),
    browserCommand(
        'new-incognito-window', 'New Incognito Window', 'Ctrl+Shift+N'),
    separator(),
    {
      label: 'Spaces',
      children: menuItems([
        shellCommand('new-space', tab),
        separator(),
        shellCommand('next-space', tab),
        shellCommand('previous-space', tab),
      ]),
    },
    {
      label: 'Tabs',
      children: menuItems([
        shellCommand('reopen-tab', tab),
        separator(),
        shellCommand('duplicate-tab', tab),
        shellCommand('pin-tab', tab),
        shellCommand('unpin-tab', tab),
        shellCommand('toggle-favorite', tab),
        shellCommand('copy-link', tab),
        separator(),
        shellCommand('mini-window', tab),
        shellCommand('new-window', tab),
        separator(),
        shellCommand('close-others', tab),
        shellCommand('close-right', tab),
      ]),
    },
    browserCommand('history', 'History', 'Ctrl+H'),
    shellCommand('show-downloads', tab),
    shellCommand('show-archive', tab),
    browserCommand('extensions', 'Extensions'),
    browserCommand('passwords', 'Passwords and Autofill'),
    browserCommand(
        'clear-browsing-data', 'Clear Browsing Data...', 'Ctrl+Shift+Delete'),
    {
      label: 'Developer',
      children: menuItems([
        tab && browserCommand('dev-tools', 'Developer Tools', 'Ctrl+Shift+I'),
        tab &&
            browserCommand(
                'dev-tools-console', 'JavaScript Console', 'Ctrl+Shift+J'),
        tab && browserCommand('view-source', 'View Page Source', 'Ctrl+U'),
        separator(),
        browserCommand('task-manager', 'Task Manager', 'Shift+Esc'),
      ]),
    },
    separator(),
    {
      label: 'Help',
      children: [
        browserCommand('about', 'About Rail'),
      ],
    },
    shellCommand('settings', tab),
    browserCommand('browser-settings', 'Advanced Settings'),
    tab && browserCommand('print', 'Print', 'Ctrl+P'),
    separator(),
    {command: 'close', label: 'Close', accelerator: 'Alt+F4'},
  ]);
  showNativeMenu(items, command => {
    if (command.startsWith(BROWSER_COMMAND)) {
      handler.runBrowserCommand(command.slice(BROWSER_COMMAND.length));
    } else if (command.includes('://')) {
      host.openUrl(command);
    } else if (command === 'set-default') {
      handler.setAsDefaultBrowser();
    } else if (command === 'new-tab') {
      handler.openRailCommandBar(true, false);
    } else if (command === 'close') {
      handler.close();
    } else {
      runCommand(command, host);
    }
  });
}
